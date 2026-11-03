// Scénarios de bout en bout des itinéraires modèles, joués en HTTP réel par
// `run.ts` contre `next start` (build de production), le vrai `@s3nd/core`,
// le vrai SDK AWS et un faux S3 en mémoire (`fake-s3.ts`).
//
// Chaque scénario enchaîne des assertions simples aux messages explicites.
// En plus, toute réponse de l'API passe par `checkReply` :
// - jamais `ownerTokenHash` ni `retiredAt` ; le jeton propriétaire n'apparaît
//   que dans la réponse 201 de sa publication ;
// - le `Cache-Control` attendu pour la route et le statut (§5 de la
//   conception) : une erreur n'est jamais en cache public, sauf le 410 d'une
//   version ou d'un slug, que la conception met en cache exprès ;
// - toute erreur est `{ error }`, en français, sans détail interne.
//
// Conception : docs/itineraire-modele-technique.md §4 et §5.

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { deflateRawSync, gunzipSync, gzipSync } from 'node:zlib'
import { encode } from '@msgpack/msgpack'
import {
  itinerary as demoItinerary,
  type Accommodation,
  type Activity,
  type DayItinerary,
} from '@/lib/itinerary-data'
import { compressItinerary } from '@/lib/share'
import * as templateClient from '@/lib/template-api'
import { cleanForTemplate } from '@/lib/template-clean'
import {
  DEFAULT_TEMPLATE_OPTIONS,
  MAX_TEMPLATE_DAYS,
  MAX_TEMPLATE_DAY_ACTIVITIES,
  MAX_TEMPLATE_TITLE_LENGTH,
  idSuffixedSlug,
  isTemplateId,
  isTemplateSlug,
  type PublicTemplate,
  type TemplateIndexEntry,
  type TemplateOptions,
} from '@/lib/template-model'
import { normalizeItineraryShape } from '@/lib/template-shape'
import { deriveTripTitle } from '@/lib/trips'
import type { FakeS3 } from './fake-s3'

// Les corps JSON sont relus champ par champ : un type précis n'apporterait
// rien à ces vérifications.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export interface E2EOptions {
  /** `http://127.0.0.1:<port>` du serveur Next. */
  baseUrl: string
  s3: FakeS3
  bucket: string
  /** Racine du dépôt, pour lancer `scripts/retire-template.ts`. */
  root: string
  /** Variables R2 qui visent le faux S3. */
  r2Env: Record<string, string>
  /** Journal du serveur Next depuis son démarrage. */
  serverLog: () => string
  /** Ne jouer que les scénarios dont le nom contient ce texte. */
  only?: string
}

export interface E2EReport {
  passed: number
  failed: number
  skipped: number
  assertions: number
  ms: number
}

// ── Harnais ───────────────────────────────────────────────────────────────────

class AssertionFailure extends Error {}

class SkipScenario extends Error {}

interface ScenarioState {
  name: string
  assertions: number
  /** Échecs qui n'arrêtent pas le scénario (invariants des réponses). */
  failures: string[]
  notes: string[]
}

let current: ScenarioState = {
  name: '(hors scénario)',
  assertions: 0,
  failures: [],
  notes: [],
}

function describeValue(value: unknown): string {
  const text = typeof value === 'string' ? value : canonical(value)
  return text === undefined
    ? 'undefined'
    : text.length > 300
      ? `${text.slice(0, 300)}…`
      : text
}

function check(condition: unknown, message: string): asserts condition {
  current.assertions += 1
  if (!condition) throw new AssertionFailure(message)
}

function equal(actual: unknown, expected: unknown, message: string): void {
  current.assertions += 1
  if (!Object.is(actual, expected)) {
    throw new AssertionFailure(
      `${message} — attendu ${describeValue(expected)}, obtenu ${describeValue(actual)}`,
    )
  }
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  current.assertions += 1
  const a = canonical(actual)
  const b = canonical(expected)
  if (a !== b) {
    throw new AssertionFailure(
      `${message} — attendu ${describeValue(expected)}, obtenu ${describeValue(actual)}`,
    )
  }
}

/** Échec noté, le scénario continue. */
function soft(condition: unknown, message: string): void {
  current.assertions += 1
  if (!condition && !current.failures.includes(message)) {
    current.failures.push(message)
  }
}

/** Constat sans échec, affiché sous le scénario. */
function note(message: string): void {
  current.notes.push(message)
}

function skip(reason: string): never {
  throw new SkipScenario(reason)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON aux clés triées : deux objets égaux s'écrivent pareil. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isPlainObject(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  )
}

// ── Contexte ──────────────────────────────────────────────────────────────────

let ctx: E2EOptions

/** Jetons émis pendant la campagne : aucune autre réponse ne doit les contenir. */
const issuedTokens = new Set<string>()

interface ReplyRecord {
  scenario: string
  kind: string
  status: number
  cacheControl: string | null
}

const replies: ReplyRecord[] = []

let ipCounter = 0

/** Une IP différente par requête : le limiteur ne gêne que le scénario qui le vise. */
function freshIp(): string {
  ipCounter += 1
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

// ── Requêtes ──────────────────────────────────────────────────────────────────

const NO_STORE = 'no-store'
const VERSION_CACHE = 'public, s-maxage=60'
const LISTING_CACHE = 'public, s-maxage=300, stale-while-revalidate=300'

const PUBLIC_TEMPLATE_KEYS = [
  'authorName',
  'cities',
  'country',
  'dayCount',
  'id',
  'includesNotes',
  'includesPrices',
  'indexable',
  'itinerary',
  'listed',
  'publishedAt',
  'slug',
  'title',
  'tripYear',
  'updatedAt',
  'version',
]

const INDEX_ENTRY_KEYS = [
  'cities',
  'country',
  'dayCount',
  'id',
  'slug',
  'title',
  'updatedAt',
]

const TOMBSTONE_KEYS = [
  'id',
  'ownerTokenHash',
  'publishedAt',
  'retiredAt',
  'slug',
  'version',
  'wasListed',
]

/** Une langue française reconnaissable : accents, apostrophe typographique ou mots courants. */
const FRENCH =
  /[éèêàâçùûôîœ’«»]|\b(le|la|les|du|des|de|un|une|est|pas|ce|cette|aucun|trop)\b/i

/** Ce qu'une réponse d'erreur ne doit jamais laisser passer. */
const LEAK =
  /node_modules|\/home\/|ECONNREFUSED|ECONNRESET|\bat [\w.<>]+ \(|s3nd|bucket|PreconditionFailed|NoSuchKey|templates\/[0-9a-z]{16}\//i

interface Reply {
  method: string
  path: string
  kind: string
  status: number
  headers: Headers
  text: string
  body: Json
  ms: number
}

interface CallOptions {
  /** Sérialisé en JSON. */
  body?: unknown
  /** Corps envoyé tel quel. */
  raw?: string
  token?: string
  /** En-tête `Authorization` complet, à la place de `token`. */
  authorization?: string
  ip?: string
  headers?: Record<string, string>
}

/** Famille de route, pour le `Cache-Control` attendu et la matrice finale. */
function routeKind(method: string, path: string): string {
  const pathname = path.split('?')[0]
  if (pathname === '/api/templates') return `${method} /api/templates`
  if (pathname === '/api/templates/index') return `${method} index`
  if (pathname.startsWith('/api/templates/by-slug/')) return `${method} by-slug`
  if (/^\/api\/templates\/[^/]+\/v\/[^/]+$/.test(pathname)) {
    return `${method} v/n`
  }
  if (/^\/api\/templates\/[^/]+$/.test(pathname)) return `${method} [id]`
  return `${method} ${pathname}`
}

/** `null` : réponse de Next lui-même (405), vérifiée à part. */
function expectedCacheControl(kind: string, status: number): string | null {
  if (status === 405) return null
  if (kind === 'GET v/n' && (status === 200 || status === 410)) {
    return VERSION_CACHE
  }
  if (
    (kind === 'GET by-slug' || kind === 'GET index') &&
    (status === 200 || status === 410)
  ) {
    return LISTING_CACHE
  }
  return NO_STORE
}

function checkReply(reply: Reply): void {
  const where = `${reply.method} ${reply.path.slice(0, 80)} → ${reply.status}`
  const cacheControl = reply.headers.get('cache-control')
  replies.push({
    scenario: current.name,
    kind: reply.kind,
    status: reply.status,
    cacheControl,
  })
  soft(
    !reply.text.includes('ownerTokenHash'),
    `${where} : la réponse contient ownerTokenHash`,
  )
  soft(
    !reply.text.includes('"retiredAt"'),
    `${where} : la réponse contient retiredAt`,
  )
  const isPublication =
    reply.kind === 'POST /api/templates' && reply.status === 201
  soft(
    isPublication || !reply.text.includes('"ownerToken"'),
    `${where} : la réponse contient un champ ownerToken`,
  )
  if (!isPublication) {
    for (const token of issuedTokens) {
      if (reply.text.includes(token)) {
        soft(false, `${where} : un jeton propriétaire est renvoyé`)
        break
      }
    }
  }
  const expected = expectedCacheControl(reply.kind, reply.status)
  if (expected) {
    soft(
      cacheControl === expected,
      `${where} : Cache-Control « ${cacheControl} » au lieu de « ${expected} »`,
    )
  } else {
    soft(
      !(cacheControl ?? '').includes('public'),
      `${where} : réponse en cache public`,
    )
  }
  if (reply.status === 405) return
  soft(
    (reply.headers.get('content-type') ?? '').includes('application/json'),
    `${where} : réponse qui n'est pas du JSON`,
  )
  if (reply.status >= 400) {
    const error = isPlainObject(reply.body) ? reply.body.error : undefined
    soft(
      typeof error === 'string' && error.length > 0,
      `${where} : erreur sans message { error }`,
    )
    if (typeof error === 'string') {
      soft(
        FRENCH.test(error),
        `${where} : message pas en français « ${error} »`,
      )
    }
    soft(
      !LEAK.test(reply.text),
      `${where} : détail interne dans la réponse « ${reply.text.slice(0, 200)} »`,
    )
  }
  if (reply.status === 410) {
    soft(
      isPlainObject(reply.body) && reply.body.status === 'retired',
      `${where} : un 410 doit porter { status: 'retired' }`,
    )
  }
}

async function call(
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<Reply> {
  const headers: Record<string, string> = {
    'x-forwarded-for': options.ip ?? freshIp(),
    ...options.headers,
  }
  let body: string | undefined
  if (options.raw !== undefined) body = options.raw
  else if (options.body !== undefined) body = JSON.stringify(options.body)
  if (body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json'
  }
  if (options.authorization !== undefined) {
    headers.authorization = options.authorization
  } else if (options.token !== undefined) {
    headers.authorization = `Bearer ${options.token}`
  }
  const started = performance.now()
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    method,
    headers,
    body,
    redirect: 'manual',
  })
  const text = await response.text()
  let parsed: Json = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const reply: Reply = {
    method,
    path,
    kind: routeKind(method, path),
    status: response.status,
    headers: response.headers,
    text,
    body: parsed,
    ms: performance.now() - started,
  }
  checkReply(reply)
  return reply
}

/**
 * Corps envoyé en `Transfer-Encoding: chunked`, sans `Content-Length` :
 * `fetch` ne sait pas le faire avec une chaîne.
 */
function chunkedPost(
  path: string,
  body: string,
  ip = freshIp(),
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${ctx.baseUrl}${path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
          'x-forwarded-for': ip,
        },
      },
      (response) => {
        let text = ''
        response.on('data', (chunk: Buffer) => (text += chunk.toString()))
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, text }),
        )
      },
    )
    request.on('error', reject)
    for (let offset = 0; offset < body.length; offset += 64 * 1024) {
      request.write(body.slice(offset, offset + 64 * 1024))
    }
    request.end()
  })
}

// ── Publication et lectures ───────────────────────────────────────────────────

interface Published {
  template: PublicTemplate
  token: string
}

async function payloadOf(days: DayItinerary[]): Promise<string> {
  return compressItinerary(days)
}

/** Payload hors du dialecte de `compressItinerary` : n'importe quelle valeur msgpack. */
function packed(value: unknown): string {
  return deflate(Buffer.from(encode(value)))
}

function deflate(bytes: Buffer): string {
  return deflateRawSync(bytes).toString('base64url')
}

const NESTED_MARKER = '__imbrication__'

/**
 * `value` encodé en msgpack, où la chaîne `NESTED_MARKER` est remplacée par
 * `depth` listes imbriquées : l'encodeur refuse d'aller au-delà de 100
 * niveaux, un client hostile n'a pas cette politesse.
 */
function packedWithNesting(value: unknown, depth: number): string {
  const bytes = Buffer.from(encode(value))
  const marker = Buffer.from(encode(NESTED_MARKER))
  const at = bytes.indexOf(marker)
  check(at >= 0, 'marqueur d’imbrication introuvable')
  const nested = Buffer.concat([
    Buffer.alloc(depth, 0x91),
    Buffer.from(encode('fond')),
  ])
  return deflate(
    Buffer.concat([
      bytes.subarray(0, at),
      nested,
      bytes.subarray(at + marker.length),
    ]),
  )
}

function rememberPublication(reply: Reply): Published {
  equal(reply.status, 201, `publication refusée (${reply.text.slice(0, 200)})`)
  const template = reply.body?.template as PublicTemplate
  const token = reply.body?.ownerToken as string
  check(
    templateClient.isPublicTemplate(template),
    'la publication doit renvoyer un modèle public valide',
  )
  check(
    typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token),
    'le jeton propriétaire doit faire 43 caractères base64url',
  )
  issuedTokens.add(token)
  return { template, token }
}

async function publish(
  days: DayItinerary[],
  fields: Record<string, unknown> = {},
  ip?: string,
): Promise<Published> {
  const reply = await call('POST', '/api/templates', {
    body: { data: await payloadOf(days), country: 'JP', ...fields },
    ip,
  })
  return rememberPublication(reply)
}

async function getTemplate(id: string): Promise<Reply> {
  return call('GET', `/api/templates/${id}`)
}

async function indexEntries(): Promise<TemplateIndexEntry[]> {
  const reply = await call('GET', '/api/templates/index')
  equal(reply.status, 200, 'lecture de l’index')
  check(Array.isArray(reply.body?.entries), 'l’index doit porter entries[]')
  return reply.body.entries as TemplateIndexEntry[]
}

function entryOf(template: PublicTemplate): TemplateIndexEntry {
  return {
    id: template.id,
    slug: template.slug,
    title: template.title,
    country: template.country,
    dayCount: template.dayCount,
    cities: template.cities,
    updatedAt: template.updatedAt,
  }
}

async function expectInIndex(template: PublicTemplate, message: string) {
  const entry = (await indexEntries()).find((item) => item.id === template.id)
  check(entry, `${message} : le modèle doit figurer dans l’index`)
  deepEqual(Object.keys(entry).sort(), INDEX_ENTRY_KEYS, `${message} : champs`)
  deepEqual(entry, entryOf(template), `${message} : ligne d’index`)
}

async function expectNotInIndex(id: string, message: string) {
  const entries = await indexEntries()
  check(
    !entries.some((item) => item.id === id),
    `${message} : le modèle ne doit pas figurer dans l’index`,
  )
}

// ── Faux S3 ───────────────────────────────────────────────────────────────────

/** Contenu (`data`) d'un snapshot stocké sous `templates/<key>`, ou `null`. */
function stored(key: string): Json {
  const object = ctx.s3.object(ctx.bucket, `templates/${key}`)
  if (!object) return null
  const envelope = JSON.parse(gunzipSync(object.body).toString('utf8'))
  return envelope.data
}

function storedKeys(prefix = ''): string[] {
  return ctx.s3
    .keys(ctx.bucket)
    .map((item) => item.key)
    .filter((key) => key.startsWith(`templates/${prefix}`))
}

function metaIds(): string[] {
  return storedKeys()
    .map((key) => /^templates\/([0-9a-z]{16})\/meta$/.exec(key)?.[1])
    .filter((id): id is string => id !== undefined)
}

/** Un snapshot s3nd tel que `putSnapshot` l'écrit, pour corrompre ou restaurer. */
function envelope(data: unknown, version = 1): Buffer {
  return gzipSync(
    Buffer.from(
      JSON.stringify({
        s3nd: 1,
        app: 'tripbrain',
        version,
        createdAt: new Date().toISOString(),
        data,
      }),
    ),
  )
}

function storedContains(text: string): string[] {
  const hits: string[] = []
  for (const { key } of ctx.s3.keys(ctx.bucket)) {
    const object = ctx.s3.object(ctx.bucket, key)
    if (!object) continue
    let content: string
    try {
      content = gunzipSync(object.body).toString('utf8')
    } catch {
      content = object.body.toString('utf8')
    }
    if (content.includes(text)) hits.push(key)
  }
  return hits
}

// ── Inspection d'un itinéraire ────────────────────────────────────────────────

/** Chemins où l'une de ces clés apparaît. */
function keyPaths(
  value: unknown,
  names: readonly string[],
  at = '$',
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      keyPaths(item, names, `${at}[${index}]`),
    )
  }
  if (!isPlainObject(value)) return []
  const found: string[] = []
  for (const [key, item] of Object.entries(value)) {
    if (names.includes(key)) found.push(`${at}.${key}`)
    found.push(...keyPaths(item, names, `${at}.${key}`))
  }
  return found
}

/** Ni demi-emoji ni surrogate isolé. */
function isWellFormedText(text: string): boolean {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    text,
  )
}

// ── Voyages ───────────────────────────────────────────────────────────────────

function addDays(iso: string, offset: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + offset))
    .toISOString()
    .slice(0, 10)
}

interface Stop {
  city: string
  coordinates: [number, number]
  days: number
}

/** Une journée par jour d'étape, une activité chacune : le strict nécessaire. */
function tripOf(
  stops: readonly Stop[],
  prefix: string,
  start = '2026-04-01',
): DayItinerary[] {
  const days: DayItinerary[] = []
  for (const stop of stops) {
    for (let index = 0; index < stop.days; index++) {
      const n = days.length + 1
      days.push({
        id: `${prefix}-d${n}`,
        date: addDays(start, n - 1),
        dayNumber: n,
        city: stop.city,
        title: `${stop.city}, jour ${index + 1}`,
        activities: [
          {
            id: `${prefix}-d${n}-a1`,
            name: `Promenade à ${stop.city}`,
            type: 'visit',
          },
        ],
        coordinates: stop.coordinates,
      })
    }
  }
  return days
}

const TOKYO: [number, number] = [35.6762, 139.6503]

const JAPAN_STOPS: readonly Stop[] = [
  { city: 'Tokyo', coordinates: TOKYO, days: 4 },
  { city: 'Hakone', coordinates: [35.2324, 139.1069], days: 1 },
  { city: 'Kyoto', coordinates: [35.0116, 135.7681], days: 4 },
  { city: 'Nara', coordinates: [34.6851, 135.8048], days: 1 },
  { city: 'Osaka', coordinates: [34.6937, 135.5023], days: 3 },
  { city: 'Tokyo', coordinates: TOKYO, days: 1 },
]

/**
 * Deux semaines au Japon, telles qu'un auteur les a vraiment vécues : vols,
 * trains et hôtels réservés (références, sièges, portes, statuts, liens de
 * confirmation), prix payés, notes avec digicode et téléphone, et des clés
 * qu'aucun type ne connaît. Pas nettoyé : le serveur doit le faire.
 */
function japanTrip(prefix = 'jp'): DayItinerary[] {
  const days = tripOf(JAPAN_STOPS, prefix)
  for (const day of days) {
    day.notes = `Digicode 4821, appeler Kenji au +81 90 1234 5678 (jour ${day.dayNumber}).`
    day.highlights = [`Quartiers de ${day.city}`]
    day.tips = ['Recharger la carte Suica']
    day.foodRecommendations = ['Ramen au comptoir']
    day.images = [
      { url: `https://images.example.com/${day.id}.jpg`, caption: day.city },
    ]
    day.activities = [
      {
        id: `${day.id}-a1`,
        name: `Temple de ${day.city}`,
        type: 'visit',
        price: 500,
        currency: 'JPY',
        status: 'done',
        openAt: '09:00–17:00',
        coordinates: day.coordinates,
        images: ['https://images.example.com/temple.jpg'],
        tips: 'Arriver avant 9 h',
      },
      {
        id: `${day.id}-a2`,
        name: `Dîner à ${day.city}`,
        type: 'food',
        price: 3200,
        currency: 'JPY',
        status: 'planned',
        bookingUrl: 'https://tabelog.com/fr/tokyo/',
        reservationRequired: true,
      },
    ]
  }
  days[0].transport = {
    id: `${prefix}-t1`,
    type: 'plane',
    from: 'Paris CDG',
    to: 'Tokyo Haneda',
    departureTime: '2026-03-31T11:30',
    arrivalTime: '2026-04-01T07:45',
    provider: 'Air France',
    bookingReference: 'AF7K2Q',
    seat: '32A',
    gate: 'K45',
    terminal: '2E',
    status: 'booked',
    price: 890,
    currency: 'EUR',
    notes: 'Bagage en soute payé, client 99812',
    bookingUrl: 'https://wwws.airfrance.fr/fr/manage-booking?pnr=AF7K2Q',
  }
  days[0].accommodation = Object.assign(
    {
      id: `${prefix}-h1`,
      name: 'Hotel Gracery Shinjuku',
      address: '1-19-1 Kabukicho, Shinjuku',
      bookingUrl:
        'https://www.booking.com/mybooking.html?bn=4021938475&pincode=8842',
      checkIn: '2026-04-01T15:00',
      checkOut: '2026-04-05T11:00',
      price: 620,
      currency: 'EUR',
      bookingReference: '4021938475',
      status: 'booked',
    } satisfies Accommodation,
    { confirmationCode: 'XK-2231', phone: '+81 3 6833 2489' },
  )
  days[1].activities.push({
    id: `${prefix}-d2-a3`,
    name: 'teamLab Planets',
    type: 'experience',
    bookingUrl: 'https://www.teamlab.art/e/planets/',
    price: 3800,
    currency: 'JPY',
    reservationRequired: true,
    status: 'planned',
  })
  days[4].transport = {
    id: `${prefix}-t5`,
    type: 'train',
    from: 'Tokyo',
    to: 'Hakone',
    provider: 'Odakyu Romancecar',
    bookingReference: 'RC-55120',
    seat: '7C',
    status: 'booked',
    price: 2470,
    currency: 'JPY',
    bookingUrl: 'https://www.odakyu.jp/romancecar/reservation/confirm?id=55120',
    notes: 'Voiture 7',
  }
  days[5].transport = {
    id: `${prefix}-t6`,
    type: 'train',
    from: 'Hakone',
    to: 'Kyoto',
    provider: 'JR Central',
    seat: '12D',
    status: 'booked',
    price: 11500,
    currency: 'JPY',
  }
  days[5].accommodation = {
    id: `${prefix}-h6`,
    name: 'Hiiragiya Ryokan',
    address: 'Nakahakusancho, Kyoto',
    bookingUrl: 'https://www.hiiragiya.co.jp/en/',
    checkIn: '2026-04-06',
    checkOut: '2026-04-10',
    price: 1400,
    currency: 'EUR',
    status: 'booked',
  }
  Object.assign(days[3], { secret: 'ne doit jamais partir' })
  return days
}

const PERSONAL_KEYS = [
  'bookingReference',
  'seat',
  'gate',
  'terminal',
  'status',
  'confirmationCode',
  'phone',
  'secret',
] as const

/** Trois jours à Lisbonne, publiés encore et encore. */
const LISBON_STOPS: readonly Stop[] = [
  { city: 'Lisbonne', coordinates: [38.7223, -9.1393], days: 2 },
  { city: 'Sintra', coordinates: [38.8029, -9.3817], days: 1 },
]

function minimalDay(
  n: number,
  prefix: string,
  extra: Partial<DayItinerary> = {},
) {
  return {
    id: `${prefix}-d${n}`,
    date: addDays('2026-06-01', n - 1),
    dayNumber: n,
    city: 'Reykjavik',
    title: `Jour ${n}`,
    activities: [] as Activity[],
    coordinates: [64.1466, -21.9426] as [number, number],
    ...extra,
  }
}

function manyDays(count: number, prefix: string): DayItinerary[] {
  return Array.from({ length: count }, (_, index) =>
    minimalDay(index + 1, prefix),
  )
}

// ── Scénarios ─────────────────────────────────────────────────────────────────

interface Scenario {
  name: string
  run: () => Promise<void>
}

const scenarios: Scenario[] = []

function scenario(name: string, run: () => Promise<void>): void {
  scenarios.push({ name, run })
}

// 1 ────────────────────────────────────────────────────────────────────────────
scenario(
  'Cycle de vie complet : publier, lire, mettre à jour, masquer, retirer',
  async () => {
    const days = japanTrip('cv')
    const published = await publish(days, {
      title: 'Japon au printemps — deux semaines',
      authorName: 'Yanis',
      options: { includeNotes: false, includePrices: true },
      indexable: true,
    })
    const t1 = published.template
    const token = published.token
    check(isTemplateId(t1.id), 'id de 16 caractères base32 Crockford')
    deepEqual(Object.keys(t1).sort(), PUBLIC_TEMPLATE_KEYS, 'champs publics')
    equal(t1.slug, 'japon-14-jours-tokyo-hakone-kyoto', 'slug')
    equal(t1.version, 1, 'version initiale')
    equal(t1.title, 'Japon au printemps — deux semaines', 'titre')
    equal(t1.authorName, 'Yanis', 'prénom')
    equal(t1.country, 'JP', 'pays')
    equal(t1.indexable, true, 'indexable')
    equal(t1.listed, true, 'listé')
    equal(t1.includesNotes, false, 'notes exclues')
    equal(t1.includesPrices, true, 'prix inclus')
    equal(t1.dayCount, 14, 'nombre de jours')
    deepEqual(
      t1.cities,
      ['Tokyo', 'Hakone', 'Kyoto', 'Nara', 'Osaka'],
      'villes',
    )
    equal(t1.tripYear, 2026, 'année du voyage')
    equal(t1.updatedAt, t1.publishedAt, 'updatedAt = publishedAt')
    const age = Date.now() - Date.parse(t1.publishedAt)
    check(
      age >= -5000 && age < 60_000,
      `publishedAt récent (${t1.publishedAt})`,
    )

    for (const unknown of [
      '0123456789abcdef',
      t1.id.toUpperCase(),
      t1.id.slice(1),
      'index.json',
    ]) {
      equal(
        (await getTemplate(unknown)).status,
        404,
        `GET [id] ${unknown} : 404`,
      )
    }
    const read = await getTemplate(t1.id)
    equal(read.status, 200, 'GET [id]')
    deepEqual(read.body.template, t1, 'GET [id] rend le modèle publié')
    const bySlug = await call('GET', `/api/templates/by-slug/${t1.slug}`)
    equal(bySlug.status, 200, 'GET by-slug d’un modèle listé')
    deepEqual(bySlug.body.template, t1, 'by-slug rend le même modèle')
    await expectInIndex(t1, 'après publication')

    const v1 = await call('GET', `/api/templates/${t1.id}/v/1`)
    equal(v1.status, 200, 'GET v/1')
    deepEqual(
      Object.keys(v1.body).sort(),
      ['itinerary', 'version'],
      'v/1 : champs',
    )
    equal(v1.body.version, 1, 'v/1 : version')
    deepEqual(v1.body.itinerary, t1.itinerary, 'v/1 : itinéraire publié')
    for (const n of ['2', '0', '01', '-1', '1.5', 'un', '9999999999']) {
      const missing = await call('GET', `/api/templates/${t1.id}/v/${n}`)
      equal(missing.status, 404, `v/${n} n’existe pas`)
    }

    const meta = stored(`${t1.id}/meta`)
    equal(
      meta.ownerTokenHash,
      sha256(token),
      'la méta garde le SHA-256 du jeton',
    )
    deepEqual(
      storedContains(token),
      [],
      'le jeton lui-même n’est stocké nulle part',
    )
    deepEqual(stored(`${t1.id}/v/1`).itinerary, t1.itinerary, 'v/1 stockée')
    deepEqual(stored(`slugs/${t1.slug}`), { id: t1.id }, 'slug réservé')

    // Nouvelle version : 10 jours, notes incluses, prix retirés, titre gardé.
    const v2Days = days.slice(0, 10)
    v2Days[5] = { ...v2Days[5], title: 'Kyoto, Fushimi Inari à l’aube' }
    v2Days[5].activities = [
      ...v2Days[5].activities,
      { id: 'cv-d6-a9', name: 'Fushimi Inari', type: 'visit' },
    ]
    const put = await call('PUT', `/api/templates/${t1.id}`, {
      token,
      body: {
        data: await payloadOf(v2Days),
        options: { includeNotes: true, includePrices: false },
      },
    })
    equal(put.status, 200, `PUT v2 (${put.text.slice(0, 200)})`)
    const t2 = put.body.template as PublicTemplate
    equal(t2.version, 2, 'PUT : version 2')
    equal(t2.title, t1.title, 'PUT sans titre : titre gardé')
    equal(t2.slug, t1.slug, 'PUT : slug figé')
    equal(t2.country, 'JP', 'PUT : pays figé')
    equal(t2.authorName, 'Yanis', 'PUT : prénom gardé')
    equal(t2.dayCount, 10, 'PUT : 10 jours')
    deepEqual(t2.cities, ['Tokyo', 'Hakone', 'Kyoto', 'Nara'], 'PUT : villes')
    equal(t2.includesNotes, true, 'PUT : notes incluses')
    equal(t2.includesPrices, false, 'PUT : prix exclus')
    equal(t2.publishedAt, t1.publishedAt, 'PUT : publishedAt inchangé')
    check(t2.updatedAt > t1.updatedAt, 'PUT : updatedAt avance')
    deepEqual(keyPaths(t2.itinerary, ['price', 'currency']), [], 'v2 sans prix')
    check(keyPaths(t2.itinerary, ['notes']).length > 0, 'v2 avec notes')
    equal(
      t2.itinerary[5].title,
      'Kyoto, Fushimi Inari à l’aube',
      'v2 : contenu',
    )

    const v1Again = await call('GET', `/api/templates/${t1.id}/v/1`)
    deepEqual(v1Again.body.itinerary, t1.itinerary, 'v/1 inchangée après PUT')
    const v2 = await call('GET', `/api/templates/${t1.id}/v/2`)
    equal(v2.status, 200, 'GET v/2')
    deepEqual(v2.body.itinerary, t2.itinerary, 'v/2 = version publiée')
    deepEqual((await getTemplate(t1.id)).body.template, t2, 'GET [id] = v2')
    await expectInIndex(t2, 'après PUT')

    // Titre vidé : tiré des étapes.
    const put3 = await call('PUT', `/api/templates/${t1.id}`, {
      token,
      body: {
        data: await payloadOf(v2Days),
        title: '   ',
        options: { includeNotes: true, includePrices: false },
      },
    })
    equal(put3.status, 200, 'PUT v3')
    const t3 = put3.body.template as PublicTemplate
    equal(t3.version, 3, 'PUT : version 3')
    equal(
      t3.title,
      deriveTripTitle(t2.itinerary),
      'titre vide : tiré des étapes',
    )

    const noop = await call('PATCH', `/api/templates/${t1.id}`, {
      token,
      body: { indexable: true },
    })
    equal(noop.status, 200, 'PATCH sans changement')
    equal(
      noop.body.template.updatedAt,
      t3.updatedAt,
      'PATCH sans changement : updatedAt figé',
    )

    const hidden = await call('PATCH', `/api/templates/${t1.id}`, {
      token,
      body: { indexable: false },
    })
    equal(hidden.status, 200, 'PATCH masquer')
    equal(hidden.body.template.indexable, false, 'masqué : indexable')
    equal(hidden.body.template.listed, false, 'masqué : non listé')
    equal(hidden.body.template.version, 3, 'masqué : version inchangée')
    equal(
      (await call('GET', `/api/templates/by-slug/${t1.slug}`)).status,
      404,
      'masqué : by-slug 404',
    )
    await expectNotInIndex(t1.id, 'masqué')
    equal(
      (await getTemplate(t1.id)).status,
      200,
      'masqué : lien /m/<id> lisible',
    )
    equal(
      (await call('GET', `/api/templates/${t1.id}/v/1`)).status,
      200,
      'masqué : v/1 lisible',
    )

    const shown = await call('PATCH', `/api/templates/${t1.id}`, {
      token,
      body: { indexable: true },
    })
    equal(shown.status, 200, 'PATCH réafficher')
    equal(shown.body.template.listed, true, 'réaffiché : listé')
    await expectInIndex(shown.body.template, 'réaffiché')
    equal(
      (await call('GET', `/api/templates/by-slug/${t1.slug}`)).status,
      200,
      'réaffiché : by-slug 200',
    )

    const renamed = await call('PATCH', `/api/templates/${t1.id}`, {
      token,
      body: { authorName: '  Ama \n  r  ' },
    })
    equal(renamed.body.template.authorName, 'Ama r', 'prénom nettoyé')
    const anonymous = await call('PATCH', `/api/templates/${t1.id}`, {
      token,
      body: { authorName: null },
    })
    equal(anonymous.body.template.authorName, null, 'prénom effacé')

    const retired = await call('DELETE', `/api/templates/${t1.id}`, { token })
    equal(retired.status, 200, 'DELETE')
    deepEqual(retired.body, { status: 'retired' }, 'DELETE : corps')
    const gone = await getTemplate(t1.id)
    equal(gone.status, 410, 'retiré : GET [id] 410')
    equal(gone.body.status, 'retired', 'retiré : status retired')
    equal(
      (await call('GET', `/api/templates/by-slug/${t1.slug}`)).status,
      410,
      'retiré (était listé) : by-slug 410',
    )
    for (const n of [1, 2, 3]) {
      equal(
        (await call('GET', `/api/templates/${t1.id}/v/${n}`)).status,
        410,
        `retiré : v/${n} 410`,
      )
    }
    await expectNotInIndex(t1.id, 'retiré')
    deepEqual(storedKeys(`${t1.id}/v/`), [], 'retiré : aucune version stockée')
    const tombstone = stored(`${t1.id}/meta`)
    deepEqual(
      Object.keys(tombstone).sort(),
      TOMBSTONE_KEYS,
      'pierre tombale réduite',
    )
    equal(tombstone.wasListed, true, 'pierre tombale : wasListed')
    equal(tombstone.version, 3, 'pierre tombale : dernière version')
    deepEqual(
      stored(`slugs/${t1.slug}`),
      { id: t1.id },
      'slug toujours réservé',
    )
    deepEqual(
      storedContains('Japon au printemps'),
      [],
      'le titre n’est plus stocké nulle part',
    )

    const putAfter = await call('PUT', `/api/templates/${t1.id}`, {
      token,
      body: { data: await payloadOf(v2Days) },
    })
    equal(putAfter.status, 410, 'PUT après retrait : 410')
    const patchAfter = await call('PATCH', `/api/templates/${t1.id}`, {
      token,
      body: { indexable: true },
    })
    equal(patchAfter.status, 410, 'PATCH après retrait : 410')
    const again = await call('DELETE', `/api/templates/${t1.id}`, { token })
    equal(again.status, 200, 'second DELETE : idempotent')
    const wrong = await call('DELETE', `/api/templates/${t1.id}`, {
      token: randomBytes(32).toString('base64url'),
    })
    equal(wrong.status, 403, 'DELETE d’un retiré avec un autre jeton : 403')
  },
)

// 2 ────────────────────────────────────────────────────────────────────────────
scenario('Nettoyage côté serveur : ce qui part et ce qui reste', async () => {
  const days = japanTrip('nt')
  const expectations: [TemplateOptions | undefined, TemplateOptions][] = [
    [undefined, DEFAULT_TEMPLATE_OPTIONS],
    [
      { includeNotes: true, includePrices: false },
      { includeNotes: true, includePrices: false },
    ],
  ]
  for (const [sent, options] of expectations) {
    const label = sent ? 'notes incluses, prix exclus' : 'réglages par défaut'
    const { template } = await publish(days, sent ? { options: sent } : {})
    const itinerary = template.itinerary
    equal(
      template.includesNotes,
      options.includeNotes,
      `${label} : includesNotes`,
    )
    equal(
      template.includesPrices,
      options.includePrices,
      `${label} : includesPrices`,
    )
    deepEqual(
      keyPaths(itinerary, PERSONAL_KEYS),
      [],
      `${label} : données personnelles retirées`,
    )
    const notes = keyPaths(itinerary, ['notes'])
    equal(
      notes.length,
      options.includeNotes ? keyPaths(days, ['notes']).length : 0,
      `${label} : notes de journée et de transport`,
    )
    const prices = keyPaths(itinerary, ['price', 'currency'])
    check(
      options.includePrices ? prices.length > 0 : prices.length === 0,
      `${label} : prix (${prices.length})`,
    )
    equal(
      itinerary[0].accommodation?.bookingUrl,
      '',
      `${label} : lien Booking privé vidé`,
    )
    equal(
      itinerary[0].transport?.bookingUrl,
      undefined,
      `${label} : lien de vol privé retiré`,
    )
    equal(
      itinerary[4].transport?.bookingUrl,
      undefined,
      `${label} : lien de train privé retiré`,
    )
    equal(
      itinerary[5].accommodation?.bookingUrl,
      'https://www.hiiragiya.co.jp/en/',
      `${label} : lien public du ryokan gardé`,
    )
    equal(
      itinerary[1].activities[2]?.bookingUrl,
      'https://www.teamlab.art/e/planets/',
      `${label} : lien public teamLab gardé`,
    )
    deepEqual(
      itinerary.map((day) => day.id),
      days.map((day) => day.id),
      `${label} : ids des journées conservés`,
    )
    deepEqual(
      itinerary.flatMap((day) => day.activities.map((activity) => activity.id)),
      days.flatMap((day) => day.activities.map((activity) => activity.id)),
      `${label} : ids des activités conservés`,
    )
    deepEqual(
      itinerary,
      cleanForTemplate(normalizeItineraryShape(days) ?? [], options),
      `${label} : le modèle publié est l’aperçu A2 du téléphone`,
    )
    deepEqual(
      stored(`${template.id}/v/1`).itinerary,
      itinerary,
      `${label} : v/1 stockée`,
    )
  }
})

// 3 ────────────────────────────────────────────────────────────────────────────
scenario('Voyage de démo (Chine, 20 jours) publié tel quel', async () => {
  const data = await payloadOf(demoItinerary)
  note(`payload du voyage de démo : ${data.length} caractères`)
  const { template } = await publish(demoItinerary, { country: 'CN' })
  equal(template.slug, 'chine-20-jours-shanghai-qingdao-beijing', 'slug')
  equal(
    template.title,
    'Shanghai, Qingdao et 5 autres villes',
    'titre tiré des étapes',
  )
  equal(template.dayCount, 20, 'jours')
  deepEqual(
    template.cities,
    [
      'Shanghai',
      'Qingdao',
      'Beijing',
      "Xi'an",
      'Chongqing',
      'Zhangjiajie',
      'Taipei',
    ],
    'villes',
  )
  equal(template.tripYear, 2026, 'année')
  deepEqual(
    template.itinerary,
    cleanForTemplate(
      normalizeItineraryShape(demoItinerary) ?? [],
      DEFAULT_TEMPLATE_OPTIONS,
    ),
    'itinéraire = nettoyage du téléphone',
  )
  await expectInIndex(template, 'démo')
})

// 4 ────────────────────────────────────────────────────────────────────────────
scenario('Collisions de slug : 7 publications du même voyage', async () => {
  const days = tripOf(LISBON_STOPS, 'lx')
  const base = 'portugal-3-jours-lisbonne-sintra'
  const published: Published[] = []
  for (let attempt = 0; attempt < 7; attempt++) {
    published.push(await publish(days, { country: 'PT' }))
  }
  const slugs = published.map((item) => item.template.slug)
  deepEqual(
    slugs.slice(0, 5),
    [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-5`],
    'suffixes lisibles -2 à -5',
  )
  for (const item of published.slice(5)) {
    equal(
      item.template.slug,
      idSuffixedSlug(base, item.template.id, 6),
      'au-delà de -5 : suffixe tiré de l’id',
    )
  }
  equal(new Set(slugs).size, 7, 'sept slugs distincts')
  for (const item of published) {
    check(
      isTemplateSlug(item.template.slug),
      `slug valide ${item.template.slug}`,
    )
    const reply = await call(
      'GET',
      `/api/templates/by-slug/${item.template.slug}`,
    )
    equal(reply.status, 200, `by-slug ${item.template.slug}`)
    equal(
      reply.body.template.id,
      item.template.id,
      `by-slug ${item.template.slug} → son modèle`,
    )
  }
  // Le premier est retiré : son slug reste réservé pour toujours.
  const first = published[0]
  equal(
    (
      await call('DELETE', `/api/templates/${first.template.id}`, {
        token: first.token,
      })
    ).status,
    200,
    'retrait du premier',
  )
  const eighth = await publish(days, { country: 'PT' })
  check(eighth.template.slug !== base, 'un slug retiré n’est jamais réattribué')
  equal(
    eighth.template.slug,
    idSuffixedSlug(base, eighth.template.id, 6),
    'huitième : suffixe d’id',
  )
  equal(
    (await call('GET', `/api/templates/by-slug/${base}`)).status,
    410,
    'slug du retiré : 410',
  )
})

// 5 ────────────────────────────────────────────────────────────────────────────
scenario(
  'Modèle d’une journée : jamais listé, entre et sort de l’index avec ses mises à jour',
  async () => {
    const paris: Stop = {
      city: 'Paris',
      coordinates: [48.8566, 2.3522],
      days: 1,
    }
    const oneDay = tripOf([paris], 'p1')
    const { template, token } = await publish(oneDay, {
      country: 'FR',
      indexable: true,
    })
    equal(template.dayCount, 1, '1 jour')
    equal(template.indexable, true, 'interrupteur activé')
    equal(template.listed, false, '1 jour : jamais listé')
    await expectNotInIndex(template.id, '1 jour')
    equal(
      (await call('GET', `/api/templates/by-slug/${template.slug}`)).status,
      404,
      '1 jour : by-slug 404',
    )
    equal(
      (await getTemplate(template.id)).status,
      200,
      '1 jour : lisible par son id',
    )

    const twoDays = tripOf([{ ...paris, days: 2 }], 'p1')
    const grown = await call('PUT', `/api/templates/${template.id}`, {
      token,
      body: { data: await payloadOf(twoDays) },
    })
    equal(grown.status, 200, 'PUT à 2 jours')
    equal(grown.body.template.listed, true, '2 jours : listé')
    equal(grown.body.template.slug, template.slug, 'slug figé à la publication')
    note(
      `slug figé : le modèle de 2 jours désormais listé garde l’adresse « ${template.slug} » (durée de l’URL ≠ durée affichée)`,
    )
    await expectInIndex(grown.body.template, '2 jours')
    equal(
      (await call('GET', `/api/templates/by-slug/${template.slug}`)).status,
      200,
      '2 jours : by-slug 200',
    )

    const shrunk = await call('PUT', `/api/templates/${template.id}`, {
      token,
      body: { data: await payloadOf(oneDay) },
    })
    equal(shrunk.status, 200, 'PUT ramené à 1 jour')
    equal(shrunk.body.template.listed, false, 'ramené à 1 jour : plus listé')
    await expectNotInIndex(template.id, 'ramené à 1 jour')
    equal(
      (await call('GET', `/api/templates/by-slug/${template.slug}`)).status,
      404,
      'ramené à 1 jour : by-slug 404',
    )

    equal(
      (await call('DELETE', `/api/templates/${template.id}`, { token })).status,
      200,
      'retrait',
    )
    equal(
      stored(`${template.id}/meta`).wasListed,
      false,
      'pierre tombale : wasListed false',
    )
    equal(
      (await call('GET', `/api/templates/by-slug/${template.slug}`)).status,
      404,
      'jamais listé au retrait : by-slug 404, pas 410',
    )
    equal((await getTemplate(template.id)).status, 410, 'retiré : GET [id] 410')

    // Lien seulement, 3 jours : même règle.
    const hidden = await publish(tripOf([{ ...paris, days: 3 }], 'p3'), {
      country: 'FR',
      indexable: false,
    })
    equal(hidden.template.listed, false, 'lien seulement : non listé')
    await expectNotInIndex(hidden.template.id, 'lien seulement')
    equal(
      (await call('GET', `/api/templates/by-slug/${hidden.template.slug}`))
        .status,
      404,
      'lien seulement : by-slug 404',
    )
    await call('DELETE', `/api/templates/${hidden.template.id}`, {
      token: hidden.token,
    })
    equal(
      (await call('GET', `/api/templates/by-slug/${hidden.template.slug}`))
        .status,
      404,
      'lien seulement retiré : by-slug 404',
    )
  },
)

// 6 ────────────────────────────────────────────────────────────────────────────
scenario('Authentification des écritures (401, 403, 404)', async () => {
  const days = tripOf(LISBON_STOPS, 'au')
  const a = await publish(days, { country: 'PT' })
  const b = await publish(days, { country: 'PT' })
  const id = a.template.id
  const data = await payloadOf(days)
  const bodies: Record<string, unknown> = {
    PUT: { data },
    PATCH: { authorName: 'Pirate' },
    DELETE: undefined,
  }
  const messages = new Set<string>()
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const body = bodies[method]
    const cases: [string, CallOptions, number][] = [
      ['sans en-tête', {}, 401],
      ['jeton trop court', { authorization: 'Bearer abc' }, 401],
      ['schéma Basic', { authorization: `Basic ${a.token}` }, 401],
      ['jeton collé', { authorization: `Bearer${a.token}` }, 401],
      ['jeton d’un autre modèle', { token: b.token }, 403],
      [
        'jeton inconnu bien formé',
        { token: randomBytes(32).toString('base64url') },
        403,
      ],
    ]
    for (const [label, options, status] of cases) {
      const reply = await call(method, `/api/templates/${id}`, {
        ...options,
        body,
      })
      equal(reply.status, status, `${method} ${label}`)
      messages.add(reply.body?.error)
    }
    const inQuery = await call(
      method,
      `/api/templates/${id}?token=${a.token}`,
      { body },
    )
    equal(inQuery.status, 401, `${method} jeton dans l’URL : ignoré`)
    const unknown = await call(method, `/api/templates/0123456789abcdef`, {
      token: a.token,
      body,
    })
    equal(unknown.status, 404, `${method} id inconnu`)
    const malformed = await call(method, `/api/templates/PAS-UN-ID`, {
      token: a.token,
      body,
    })
    equal(malformed.status, 404, `${method} id mal formé`)
  }
  equal(
    messages.size,
    1,
    '401 et 403 : même message, rien ne dit ce qui manquait',
  )

  // Le jeton est vérifié avant de lire le corps : pas de 413 sans le bon jeton.
  const heavy = 'A'.repeat(2 * 1024 * 1024 + 100 * 1024)
  const heavyReply = await call('PUT', `/api/templates/${id}`, {
    token: b.token,
    raw: `{"data":"${heavy}"}`,
  })
  equal(
    heavyReply.status,
    403,
    'PUT lourd avec un mauvais jeton : 403 avant toute lecture',
  )

  const lowercase = await call('PATCH', `/api/templates/${id}`, {
    authorization: `bearer   ${a.token}`,
    body: { authorName: 'Yanis' },
  })
  equal(
    lowercase.status,
    200,
    'schéma « bearer » en minuscules accepté (RFC 9110)',
  )
  const after = (await getTemplate(id)).body.template
  equal(after.version, 1, 'aucune écriture refusée n’a créé de version')
  equal(after.authorName, 'Yanis', 'seule l’écriture autorisée a pris effet')
  equal(
    (await getTemplate(b.template.id)).body.template.authorName,
    null,
    'B intact',
  )
})

// 7 ────────────────────────────────────────────────────────────────────────────
scenario('Corps JSON hostiles sur POST', async () => {
  const days = tripOf(LISBON_STOPS, 'hp')
  const data = await payloadOf(days)
  const day = days[0]
  const metasBefore = metaIds().length
  const refused: [string, CallOptions, number, string?][] = [
    ['corps non JSON', { raw: 'pas du json' }, 400, 'Requête illisible.'],
    ['JSON tronqué', { raw: '{"data":' }, 400, 'Requête illisible.'],
    ['tableau', { raw: '[]' }, 400, 'Requête illisible.'],
    ['null', { raw: 'null' }, 400, 'Requête illisible.'],
    ['nombre', { raw: '42' }, 400],
    ['chaîne', { raw: '"JP"' }, 400],
    ['corps vide', { raw: '' }, 400],
    ['objet vide', { body: {} }, 400, 'Aucun itinéraire à publier.'],
    ['data nombre', { body: { data: 123, country: 'JP' } }, 400],
    ['data vide', { body: { data: '', country: 'JP' } }, 400],
    ['data tableau', { body: { data: [data], country: 'JP' } }, 400],
    ['data objet', { body: { data: { a: 1 }, country: 'JP' } }, 400],
    ['data null', { body: { data: null, country: 'JP' } }, 400],
    [
      'data pas du base64',
      { body: { data: '%%%%', country: 'JP' } },
      400,
      'Itinéraire illisible.',
    ],
    [
      'data qui ne se décompresse pas',
      {
        body: {
          data: Buffer.from('bonjour tout le monde').toString('base64url'),
          country: 'JP',
        },
      },
      400,
      'Itinéraire illisible.',
    ],
    [
      'msgpack objet',
      { body: { data: packed({ a: 1 }), country: 'JP' } },
      400,
      'Itinéraire illisible.',
    ],
    ['msgpack chaîne', { body: { data: packed('Tokyo'), country: 'JP' } }, 400],
    [
      'msgpack liste vide',
      { body: { data: packed([]), country: 'JP' } },
      400,
      'Le modèle doit contenir au moins une journée.',
    ],
    [
      'journée sans ville',
      { body: { data: packed([{ ...day, city: undefined }]), country: 'JP' } },
      400,
    ],
    ['journée nulle', { body: { data: packed([null]), country: 'JP' } }, 400],
    [
      'coordonnées en texte',
      {
        body: {
          data: packed([{ ...day, coordinates: ['38', '-9'] }]),
          country: 'JP',
        },
      },
      400,
    ],
    [
      'coordonnées à 3 nombres',
      {
        body: {
          data: packed([{ ...day, coordinates: [1, 2, 3] }]),
          country: 'JP',
        },
      },
      400,
    ],
    [
      'dayNumber infini',
      {
        body: {
          data: packed([{ ...day, dayNumber: Infinity }]),
          country: 'JP',
        },
      },
      400,
    ],
    [
      'activities objet',
      { body: { data: packed([{ ...day, activities: {} }]), country: 'JP' } },
      400,
    ],
    ['pays absent', { body: { data } }, 400, 'Pays du voyage invalide.'],
    ['pays en minuscules', { body: { data, country: 'jp' } }, 400],
    ['pays inconnu', { body: { data, country: 'ZZ' } }, 400],
    ['pays nombre', { body: { data, country: 81 } }, 400],
    ['pays tableau', { body: { data, country: ['JP'] } }, 400],
    ['pays d’un Mio', { body: { data, country: 'J'.repeat(1 << 20) } }, 400],
    [
      'titre nombre',
      { body: { data, country: 'JP', title: 42 } },
      400,
      'Titre du modèle invalide.',
    ],
    ['titre objet', { body: { data, country: 'JP', title: { fr: 'x' } } }, 400],
    [
      'prénom nombre',
      { body: { data, country: 'JP', authorName: 7 } },
      400,
      'Prénom invalide.',
    ],
    [
      'prénom tableau',
      { body: { data, country: 'JP', authorName: ['Yanis'] } },
      400,
    ],
    [
      'options tableau',
      { body: { data, country: 'JP', options: [] } },
      400,
      'Réglages du modèle invalides.',
    ],
    ['options null', { body: { data, country: 'JP', options: null } }, 400],
    [
      'includeNotes texte',
      { body: { data, country: 'JP', options: { includeNotes: 'oui' } } },
      400,
    ],
    [
      'includePrices nombre',
      { body: { data, country: 'JP', options: { includePrices: 1 } } },
      400,
    ],
    [
      'indexable texte',
      { body: { data, country: 'JP', indexable: 'true' } },
      400,
      'Visibilité du modèle invalide.',
    ],
    ['indexable null', { body: { data, country: 'JP', indexable: null } }, 400],
  ]
  for (const [label, options, status, message] of refused) {
    const reply = await call('POST', '/api/templates', options)
    equal(reply.status, status, `POST ${label}`)
    if (message) equal(reply.body?.error, message, `POST ${label} : message`)
  }
  equal(metaIds().length, metasBefore, 'aucun refus n’a créé de modèle')

  // Champs inconnus : ignorés, jamais repris dans le modèle.
  const forged = await call('POST', '/api/templates', {
    body: {
      data,
      country: 'PT',
      id: '0123456789abcdef',
      slug: 'pirate-1-jours',
      version: 99,
      ownerToken: 'x'.repeat(43),
      ownerTokenHash: '0'.repeat(64),
      retiredAt: '2020-01-01T00:00:00.000Z',
      listed: false,
      publishedAt: '2000-01-01T00:00:00.000Z',
      dayCount: 99,
      cities: ['Pirate'],
      tripYear: 1999,
      includesNotes: true,
      itinerary: [],
    },
  })
  const forgedTemplate = rememberPublication(forged)
  check(forgedTemplate.template.id !== '0123456789abcdef', 'id imposé ignoré')
  check(
    forgedTemplate.template.slug.startsWith('portugal-3-jours'),
    'slug imposé ignoré',
  )
  equal(forgedTemplate.template.version, 1, 'version imposée ignorée')
  check(forgedTemplate.token !== 'x'.repeat(43), 'jeton imposé ignoré')
  equal(forgedTemplate.template.dayCount, 3, 'dayCount imposé ignoré')
  equal(
    forgedTemplate.template.includesNotes,
    false,
    'includesNotes hors options ignoré',
  )
  check(
    forgedTemplate.template.publishedAt > '2026',
    'publishedAt imposé ignoré',
  )
  equal(
    stored(`${forgedTemplate.template.id}/meta`).ownerTokenHash,
    sha256(forgedTemplate.token),
    'empreinte imposée ignorée',
  )

  const proto = await call('POST', '/api/templates', {
    raw: `{"data":"${data}","country":"PT","__proto__":{"indexable":false,"country":"FR"},"constructor":{"prototype":{"indexable":false}}}`,
  })
  const protoTemplate = rememberPublication(proto).template
  equal(protoTemplate.indexable, true, '__proto__ : indexable non pollué')
  equal(protoTemplate.country, 'PT', '__proto__ : pays non pollué')

  const huge = 'é'.repeat(512 * 1024)
  const big = rememberPublication(
    await call('POST', '/api/templates', {
      body: { data, country: 'PT', title: huge, authorName: huge },
    }),
  ).template
  equal(
    big.title.length,
    MAX_TEMPLATE_TITLE_LENGTH,
    'titre d’un Mio borné à 120',
  )
  equal(big.authorName?.length, 40, 'prénom d’un Mio borné à 40')

  const spaced = rememberPublication(
    await call('POST', '/api/templates', {
      body: {
        data,
        country: 'PT',
        title: '  Lisbonne\n\tet   Sintra  ',
        authorName: '   ',
      },
    }),
  ).template
  equal(spaced.title, 'Lisbonne et Sintra', 'titre : espaces resserrés')
  equal(spaced.authorName, null, 'prénom blanc : absent')

  const blank = rememberPublication(
    await call('POST', '/api/templates', {
      body: { data, country: 'PT', title: '' },
    }),
  ).template
  equal(blank.title, 'Lisbonne et Sintra', 'titre vide : tiré des étapes')

  const padded = await call('POST', '/api/templates', {
    body: { data, country: 'PT', junk: 'x'.repeat(1536 * 1024) },
  })
  equal(
    padded.status,
    201,
    'champ inconnu de 1,5 Mio sous le plafond du corps : accepté',
  )
  rememberPublication(padded)

  const depth = 100_000
  const deep = await call('POST', '/api/templates', {
    raw: `{"data":"${data}","country":"PT","x":${'['.repeat(depth)}${']'.repeat(depth)}}`,
  })
  check(
    deep.status < 500,
    `JSON imbriqué sur ${depth} niveaux : pas d’erreur serveur (${deep.status})`,
  )
  if (deep.status === 201) rememberPublication(deep)
  equal(
    (await call('GET', '/api/templates/index')).status,
    200,
    'serveur toujours debout',
  )
})

// 8 ────────────────────────────────────────────────────────────────────────────
scenario('Corps hostiles sur PUT et PATCH', async () => {
  const days = tripOf(LISBON_STOPS, 'hw')
  const { template, token } = await publish(days, {
    country: 'PT',
    authorName: 'Inès',
  })
  const id = template.id
  const data = await payloadOf(days)
  const patches: [string, CallOptions, number, string?][] = [
    ['non JSON', { raw: 'x' }, 400, 'Requête illisible.'],
    ['tableau', { raw: '[]' }, 400],
    ['null', { raw: 'null' }, 400],
    ['objet vide', { body: {} }, 400, 'Aucun réglage à modifier.'],
    [
      'champ inconnu seul',
      { body: { foo: 1 } },
      400,
      'Aucun réglage à modifier.',
    ],
    ['indexable texte', { body: { indexable: 'false' } }, 400],
    ['indexable null', { body: { indexable: null } }, 400],
    ['prénom nombre', { body: { authorName: 5 } }, 400],
    ['prénom tableau', { body: { authorName: ['a'] } }, 400],
  ]
  for (const [label, options, status, message] of patches) {
    const reply = await call('PATCH', `/api/templates/${id}`, {
      ...options,
      token,
    })
    equal(reply.status, status, `PATCH ${label}`)
    if (message) equal(reply.body?.error, message, `PATCH ${label} : message`)
  }
  const puts: [string, CallOptions, number][] = [
    ['non JSON', { raw: 'x' }, 400],
    ['objet vide', { body: {} }, 400],
    ['data nombre', { body: { data: 5 } }, 400],
    ['data illisible', { body: { data: '%%%' } }, 400],
    ['liste vide', { body: { data: packed([]) } }, 400],
    ['titre nombre', { body: { data, title: 5 } }, 400],
    ['options tableau', { body: { data, options: [] } }, 400],
    [
      'includePrices texte',
      { body: { data, options: { includePrices: 'non' } } },
      400,
    ],
  ]
  for (const [label, options, status] of puts) {
    const reply = await call('PUT', `/api/templates/${id}`, {
      ...options,
      token,
    })
    equal(reply.status, status, `PUT ${label}`)
  }
  deepEqual(
    storedKeys(`${id}/v/`),
    [`templates/${id}/v/1`],
    'aucun PUT refusé n’a écrit de version',
  )

  const patched = await call('PATCH', `/api/templates/${id}`, {
    token,
    body: {
      indexable: false,
      slug: 'pirate-1-jours',
      version: 9,
      title: 'Pirate',
      country: 'FR',
      ownerTokenHash: '0'.repeat(64),
      retiredAt: '2020-01-01',
    },
  })
  equal(patched.status, 200, 'PATCH avec champs en trop')
  const p = patched.body.template
  equal(p.slug, template.slug, 'PATCH : slug intouchable')
  equal(p.version, 1, 'PATCH : version intouchable')
  equal(p.title, template.title, 'PATCH : titre intouchable')
  equal(p.country, 'PT', 'PATCH : pays intouchable')
  equal(
    stored(`${id}/meta`).ownerTokenHash,
    sha256(token),
    'PATCH : empreinte intouchable',
  )
  equal(
    stored(`${id}/meta`).retiredAt,
    null,
    'PATCH : pas de retrait par la bande',
  )

  const put = await call('PUT', `/api/templates/${id}`, {
    token,
    body: {
      data,
      slug: 'pirate-1-jours',
      country: 'FR',
      indexable: true,
      authorName: 'Pirate',
      version: 99,
    },
  })
  equal(put.status, 200, 'PUT avec champs en trop')
  const u = put.body.template
  equal(u.version, 2, 'PUT : version suivante, pas celle imposée')
  equal(u.slug, template.slug, 'PUT : slug figé')
  equal(u.country, 'PT', 'PUT : pays figé')
  equal(u.indexable, false, 'PUT : visibilité inchangée')
  equal(u.authorName, 'Inès', 'PUT : prénom inchangé')
})

// 9 ────────────────────────────────────────────────────────────────────────────
scenario(
  'Charges msgpack hostiles : types, NaN, liens, profondeur',
  async () => {
    const hostile = [
      {
        id: 'hm-d1',
        date: '2026-05-01',
        dayNumber: 1,
        city: 'Lisbonne',
        title: 'Jour piégé',
        coordinates: [38.72, -9.14],
        secret: 'clé inconnue',
        highlights: ['Alfama', 1, null, { x: 1 }, ['y']],
        tips: 'pas une liste',
        priority: 'must',
        source: 'pirate',
        packingTips: NESTED_MARKER,
        images: [
          { url: 'javascript:alert(1)', caption: 'x' },
          { url: 'https://ok.example/b.jpg' },
          { url: 'data:image/png;base64,AAAA', caption: 'y' },
        ],
        activities: [
          {
            id: 'a-ok',
            name: 'Tram 28',
            type: 'teleport',
            price: NaN,
            rating: Infinity,
          },
          { id: 'a-objet', name: { fr: 'Pirate' }, type: 'visit' },
          { name: 'Sans id', type: 'visit' },
          'pas une activité',
          {
            id: 'a-images',
            name: 'Belém',
            type: 'visit',
            coordinates: ['38', '-9'],
            images: [
              'javascript:alert(1)',
              'data:image/png;base64,AAAA',
              'https://ok.example/a.jpg',
              42,
            ],
            tags: 'pas une liste',
            reservationRequired: 'oui',
            price: 12,
            currency: 'EUR',
          },
        ],
        transport: { id: 't1', type: 'teleporter', from: 'Paris' },
        accommodation: { id: 'h1', name: 'Pensão Amor' },
      },
      {
        id: 'hm-d2',
        date: '2026-05-02',
        dayNumber: 2,
        city: 'Sintra',
        title: 'Jour 2',
        coordinates: [38.8, -9.38],
        activities: [],
        transport: { type: 'train', from: 'Lisbonne', to: 'Sintra' },
        accommodation: { id: 'h2', address: 'sans nom' },
      },
    ]
    // 20 000 niveaux d'imbrication : refusés avant décodage (profondeur
    // bornée à 8, conception §5), sans rien écrire.
    const metasBefore = metaIds().length
    const tooDeep = await call('POST', '/api/templates', {
      body: { data: packedWithNesting(hostile, 20_000), country: 'PT' },
    })
    equal(tooDeep.status, 413, 'imbrication sur 20 000 niveaux : 413')
    equal(metaIds().length, metasBefore, 'imbrication refusée : rien écrit')
    // 6 niveaux sous la journée (8 en tout) : acceptés, puis vidés.
    const reply = await call('POST', '/api/templates', {
      body: { data: packedWithNesting(hostile, 6), country: 'PT' },
    })
    const { template } = rememberPublication(reply)
    const [d1, d2] = template.itinerary
    equal((d1 as Json).secret, undefined, 'clé inconnue retirée')
    deepEqual(
      d1.highlights,
      ['Alfama'],
      'liste de textes : seuls les textes restent',
    )
    equal(d1.tips, undefined, 'tips mal typé retiré')
    equal(d1.priority, 'must', 'priority valide gardée')
    equal(d1.source, undefined, 'source inconnue retirée')
    deepEqual(d1.packingTips, [], 'liste imbriquée sur 6 niveaux : vidée')
    deepEqual(
      d1.images,
      [{ url: 'https://ok.example/b.jpg', caption: '' }],
      'images de journée : http(s) seulement',
    )
    deepEqual(
      d1.activities.map((activity) => activity.id),
      ['a-ok', 'a-images'],
      'activités sans id ou sans nom texte retirées',
    )
    const tram = d1.activities[0]
    equal(tram.type, 'visit', 'type inconnu : visit')
    equal(tram.price, undefined, 'prix NaN retiré')
    equal(tram.rating, undefined, 'note infinie retirée')
    const belem = d1.activities[1]
    equal(belem.coordinates, undefined, 'coordonnées en texte retirées')
    deepEqual(
      belem.images,
      ['https://ok.example/a.jpg'],
      'images d’activité : http(s) seulement',
    )
    equal(belem.tags, undefined, 'tags mal typés retirés')
    equal(belem.reservationRequired, undefined, 'booléen mal typé retiré')
    equal(belem.price, 12, 'prix valide gardé')
    equal(d1.transport, undefined, 'transport de type inconnu retiré')
    deepEqual(
      d1.accommodation,
      {
        id: 'h1',
        name: 'Pensão Amor',
        address: '',
        bookingUrl: '',
        checkIn: '',
        checkOut: '',
      },
      'hébergement nommé : champs requis vides',
    )
    equal(d2.transport, undefined, 'transport sans id retiré')
    equal(d2.accommodation, undefined, 'hébergement sans nom retiré')
    check(
      !reply.text.includes('javascript:'),
      'aucun lien javascript: dans la réponse',
    )
    check(
      !reply.text.includes('data:image'),
      'aucune image data: dans la réponse',
    )

    const withBinary = await call('POST', '/api/templates', {
      body: {
        data: packed([{ ...hostile[1], notes: new Uint8Array([1, 2, 3]) }]),
        country: 'PT',
      },
    })
    check(
      withBinary.status === 400 || withBinary.status === 413,
      `valeur binaire msgpack refusée (${withBinary.status})`,
    )
    const withDate = await call('POST', '/api/templates', {
      body: {
        data: packed([{ ...hostile[1], notes: new Date() }]),
        country: 'PT',
      },
    })
    check(
      withDate.status === 400 || withDate.status === 413,
      `extension msgpack (date) refusée (${withDate.status})`,
    )
  },
)

// 10 ───────────────────────────────────────────────────────────────────────────
scenario('Limites de taille (413)', async () => {
  const at = (count: number) => manyDays(count, `lim${count}`)
  const maxDays = await publish(at(MAX_TEMPLATE_DAYS), { country: 'IS' })
  equal(maxDays.template.dayCount, MAX_TEMPLATE_DAYS, '180 jours : accepté')
  const tooManyDays = await call('POST', '/api/templates', {
    body: { data: await payloadOf(at(MAX_TEMPLATE_DAYS + 1)), country: 'IS' },
  })
  equal(tooManyDays.status, 413, '181 jours : 413')
  equal(
    tooManyDays.body?.error,
    'Itinéraire trop volumineux pour être publié.',
    '413 : message',
  )

  const activities = (count: number): Activity[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `act-${index}`,
      name: `Activité ${index}`,
      type: 'visit' as const,
    }))
  const busy = (count: number) => [
    minimalDay(1, 'busy', { activities: activities(count) }),
    minimalDay(2, 'busy'),
  ]
  const maxActivities = await publish(busy(MAX_TEMPLATE_DAY_ACTIVITIES), {
    country: 'IS',
  })
  equal(
    maxActivities.template.itinerary[0].activities.length,
    100,
    '100 activités : accepté',
  )
  equal(
    (
      await call('POST', '/api/templates', {
        body: {
          data: await payloadOf(busy(MAX_TEMPLATE_DAY_ACTIVITIES + 1)),
          country: 'IS',
        },
      })
    ).status,
    413,
    '101 activités : 413',
  )

  const longString = (bytes: number) => [
    minimalDay(1, 'str', { notes: 'n'.repeat(bytes) }),
    minimalDay(2, 'str'),
  ]
  const okString = await call('POST', '/api/templates', {
    body: {
      data: await payloadOf(longString(32 * 1024)),
      country: 'IS',
      options: { includeNotes: true },
    },
  })
  equal(okString.status, 201, 'chaîne de 32 Kio : acceptée')
  rememberPublication(okString)
  equal(
    (
      await call('POST', '/api/templates', {
        body: {
          data: await payloadOf(longString(32 * 1024 + 1)),
          country: 'IS',
        },
      })
    ).status,
    413,
    'chaîne de 32 Kio + 1 : 413',
  )

  const wideDay = {
    ...minimalDay(1, 'wide'),
    ...Object.fromEntries(
      Array.from({ length: 70 }, (_, index) => [`k${index}`, index]),
    ),
  }
  equal(
    (
      await call('POST', '/api/templates', {
        body: { data: packed([wideDay]), country: 'IS' },
      })
    ).status,
    413,
    `objet de ${Object.keys(wideDay).length} clés (borne : 64) : 413`,
  )

  // 60 journées de 32 000 octets : 1,9 Mio décompressés, sous la borne.
  const padded = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      minimalDay(index + 1, `pad${count}`, { notes: 'p'.repeat(32_000) }),
    )
  const under = await call('POST', '/api/templates', {
    body: {
      data: await payloadOf(padded(60)),
      country: 'IS',
      options: { includeNotes: true },
    },
  })
  equal(under.status, 201, '1,9 Mio décompressés : acceptés')
  rememberPublication(under)
  const over = await call('POST', '/api/templates', {
    body: { data: await payloadOf(padded(70)), country: 'IS' },
  })
  equal(over.status, 413, '2,2 Mio décompressés : 413')

  const bombStarted = performance.now()
  const bomb = deflateRawSync(Buffer.alloc(64 * 1024 * 1024)).toString(
    'base64url',
  )
  note(`bombe deflate : ${bomb.length} caractères pour 64 Mio décompressés`)
  const bombReply = await call('POST', '/api/templates', {
    body: { data: bomb, country: 'IS' },
  })
  equal(bombReply.status, 413, 'bombe deflate : 413')
  note(
    `bombe deflate refusée en ${Math.round(bombReply.ms)} ms (préparation comprise : ${Math.round(performance.now() - bombStarted)} ms)`,
  )

  const bigPayload = 'A'.repeat(2 * 1024 * 1024 + 1)
  equal(
    (
      await call('POST', '/api/templates', {
        body: { data: bigPayload, country: 'IS' },
      })
    ).status,
    413,
    'payload de 2 Mio + 1 : 413',
  )
  equal(
    (
      await call('POST', '/api/templates', {
        raw: JSON.stringify({
          data: 'A',
          country: 'IS',
          junk: 'x'.repeat(2200 * 1024),
        }),
      })
    ).status,
    413,
    'corps annoncé au-delà de 2 Mio + 64 Kio : 413',
  )

  const { template, token } = await publish(at(3), { country: 'IS' })
  equal(
    (
      await call('PUT', `/api/templates/${template.id}`, {
        token,
        body: { data: bomb },
      })
    ).status,
    413,
    'PUT bombe deflate : 413',
  )
  equal(
    (
      await call('PUT', `/api/templates/${template.id}`, {
        token,
        body: { data: await payloadOf(at(MAX_TEMPLATE_DAYS + 1)) },
      })
    ).status,
    413,
    'PUT 181 jours : 413',
  )
  equal(
    (await getTemplate(template.id)).body.template.version,
    1,
    'les PUT refusés n’ont rien publié',
  )

  // Sans Content-Length, la borne du corps entier ne s'applique plus.
  const chunkedBody = JSON.stringify({
    data: await payloadOf(at(3)),
    country: 'IS',
    junk: 'x'.repeat(3 * 1024 * 1024),
  })
  const chunked = await chunkedPost('/api/templates', chunkedBody)
  soft(
    chunked.status === 413,
    `corps de ${(chunkedBody.length / 1024 / 1024).toFixed(1)} Mio envoyé en chunked (sans Content-Length) : ${chunked.status} au lieu de 413 — la borne TEMPLATE_MAX_BODY_BYTES ne vaut que pour un Content-Length annoncé`,
  )
  if (chunked.status === 201) {
    issuedTokens.add(JSON.parse(chunked.text).ownerToken)
  }
})

// 11 ───────────────────────────────────────────────────────────────────────────
scenario('Unicode : emoji, RTL, CJK, translittérations', async () => {
  const cases: {
    country: string
    cities: string[]
    title: string
    author?: string
    slug: string
  }[] = [
    {
      country: 'VN',
      cities: [
        'Hà Nội',
        'Vịnh Hạ Long',
        'Đà Nẵng',
        'Hội An',
        'Thành phố Hồ Chí Minh',
      ],
      title: 'Viêt Nam 🇻🇳 du nord au sud — 河内 → 會安',
      author: 'Zoë 🌸',
      slug: 'viet-nam-5-jours-ha-noi-vinh-ha-long-da-nang',
    },
    {
      country: 'JP',
      cities: ['東京', '京都', '大阪'],
      title: '日本の旅 🍣🗻',
      author: '健二',
      slug: 'japon-3-jours',
    },
    {
      country: 'IL',
      cities: ['תל אביב', 'ירושלים'],
      title: 'טיול בישראל — رحلة إلى إسرائيل',
      author: 'שרה',
      slug: 'israel-2-jours',
    },
    {
      country: 'MA',
      cities: ['مراكش', 'Fès', 'Chefchaouen'],
      title: 'Famille 👨‍👩‍👧‍👦 au Maroc',
      slug: 'maroc-3-jours-fes-chefchaouen',
    },
    {
      country: 'PL',
      cities: ['Wrocław', 'Kraków', 'Zakopane'],
      title: 'Z̤͔ͧ̑̓ä͖̭̈̇lͮ̒ͫǧ̗͚̚o̙̔ͮ̇͐̇ en Pologne',
      slug: 'pologne-3-jours-wroclaw-krakow-zakopane',
    },
    {
      country: 'IS',
      cities: ['Reykjavík', 'Þingvellir'],
      title: 'Islande ❄️',
      slug: 'islande-2-jours-reykjavik-thingvellir',
    },
    {
      country: 'TR',
      cities: ['Kızılcahamam', 'İstanbul'],
      title: 'Türkiye',
      slug: 'turquie-2-jours-kizilcahamam-istanbul',
    },
    {
      country: 'DE',
      cities: ['Garmisch-Partenkirchen', 'Gießen'],
      title: 'Straße & Schloß',
      slug: 'allemagne-2-jours-garmisch-partenkirchen-giessen',
    },
    {
      country: 'CI',
      cities: ['Abidjan', 'Grand-Bassam'],
      title: 'Côte d’Ivoire',
      slug: 'cote-d-ivoire-2-jours-abidjan-grand-bassam',
    },
    {
      country: 'KR',
      cities: ['🏝️', 'Busan'],
      title: '🏝️',
      slug: 'coree-du-sud-2-jours-busan',
    },
  ]
  for (const item of cases) {
    const days = tripOf(
      item.cities.map((city) => ({
        city,
        coordinates: [10, 10] as [number, number],
        days: 1,
      })),
      `u${item.country}`,
    )
    const { template } = await publish(days, {
      country: item.country,
      title: item.title,
      authorName: item.author,
    })
    check(
      isTemplateSlug(template.slug),
      `${item.country} : slug valide « ${template.slug} »`,
    )
    check(
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(template.slug),
      `${item.country} : slug ASCII`,
    )
    check(template.slug.length <= 80, `${item.country} : slug ≤ 80`)
    equal(template.slug, item.slug, `${item.country} : slug`)
    equal(template.title, item.title, `${item.country} : titre intact`)
    if (item.author)
      equal(template.authorName, item.author, `${item.country} : prénom intact`)
    deepEqual(template.cities, item.cities, `${item.country} : villes intactes`)
    deepEqual(
      template.itinerary.map((day) => day.city),
      item.cities,
      `${item.country} : villes des journées intactes`,
    )
    await expectInIndex(template, `${item.country} : index`)
    const bySlug = await call('GET', `/api/templates/by-slug/${template.slug}`)
    equal(
      bySlug.body.template?.title,
      item.title,
      `${item.country} : titre intact par le slug`,
    )
  }

  const longCities = [
    'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
    'Taumatawhakatangihangakoauauotamateaturipukakapikimaungahoronukupokaiwhenuakitanatahu',
    'Bangkok',
  ]
  const long = await publish(
    tripOf(
      longCities.map((city) => ({
        city,
        coordinates: [1, 1] as [number, number],
        days: 1,
      })),
      'ulong',
    ),
    { country: 'GB' },
  )
  check(
    long.template.slug.length <= 80,
    `villes très longues : slug ≤ 80 (${long.template.slug.length})`,
  )
  check(isTemplateSlug(long.template.slug), 'villes très longues : slug valide')
  check(
    long.template.cities.every((city) => city.length <= 80),
    'villes bornées à 80 caractères',
  )

  const twelve = Array.from({ length: 12 }, (_, index) => `Étape ${index + 1}`)
  const tour = await publish(
    tripOf(
      twelve.map((city) => ({
        city,
        coordinates: [1, 1] as [number, number],
        days: 1,
      })),
      'u12',
    ),
    { country: 'IT' },
  )
  deepEqual(
    tour.template.cities,
    twelve.slice(0, 10),
    '12 villes : les 10 premières dans la méta',
  )
  await expectInIndex(tour.template, '12 villes')
  equal(
    tour.template.itinerary.length,
    12,
    '12 villes : toutes les journées gardées',
  )

  // Un titre ou un prénom borné ne doit pas couper un emoji en deux.
  const cut = await publish(tripOf(LISBON_STOPS, 'ucut'), {
    country: 'PT',
    title: `${'a'.repeat(MAX_TEMPLATE_TITLE_LENGTH - 1)}😀`,
    authorName: `${'b'.repeat(39)}😀`,
  })
  soft(
    isWellFormedText(cut.template.title),
    `titre de 119 lettres + 😀 : la borne de 120 coupe l’emoji en deux (fin : ${JSON.stringify(cut.template.title.slice(-2))}, surrogate isolé stocké et servi)`,
  )
  soft(
    isWellFormedText(cut.template.authorName ?? ''),
    `prénom de 39 lettres + 😀 : la borne de 40 coupe l’emoji en deux (fin : ${JSON.stringify((cut.template.authorName ?? '').slice(-2))})`,
  )
})

// 12 ───────────────────────────────────────────────────────────────────────────
/** L'index d'un modèle suit sa méta stockée, et sa version publiée existe. */
async function settleAndCheckIndex(id: string, label: string): Promise<void> {
  const latest = await getTemplate(id)
  if (latest.status === 410) {
    await expectNotInIndex(id, `${label} : retiré`)
    deepEqual(
      storedKeys(`${id}/v/`),
      [],
      `${label} : retiré sans version stockée`,
    )
    return
  }
  equal(latest.status, 200, `${label} : modèle lisible`)
  const template = latest.body.template as PublicTemplate
  const entry = (await indexEntries()).find((item) => item.id === id)
  if (template.listed) {
    check(entry, `${label} : modèle listé absent de l’index`)
    deepEqual(entry, entryOf(template), `${label} : ligne d’index à jour`)
  } else {
    check(!entry, `${label} : modèle non listé présent dans l’index`)
  }
  for (let n = 1; n <= template.version; n++) {
    const version = await call('GET', `/api/templates/${id}/v/${n}`)
    check(
      version.status === 200 || version.status === 404,
      `${label} : v/${n} lisible ou absente (${version.status})`,
    )
  }
  equal(
    (await call('GET', `/api/templates/${id}/v/${template.version}`)).status,
    200,
    `${label} : la version publiée existe`,
  )
}

function tally(statuses: number[]): string {
  const counts = new Map<number, number>()
  for (const status of statuses)
    counts.set(status, (counts.get(status) ?? 0) + 1)
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([status, count]) => `${count}×${status}`)
    .join(', ')
}

scenario('Concurrence : 10 PATCH et PUT simultanés sur un modèle', async () => {
  const { template, token } = await publish(japanTrip('cc'), { country: 'JP' })
  const id = template.id
  const variants = [1, 3, 5, 2, 4]
  const payloads = await Promise.all(
    variants.map((count) => payloadOf(japanTrip('cc').slice(0, count))),
  )
  const requests = Array.from({ length: 10 }, (_, index) =>
    index % 2 === 0
      ? call('PATCH', `/api/templates/${id}`, {
          token,
          body: { indexable: index % 4 === 0, authorName: `Auteur ${index}` },
        })
      : call('PUT', `/api/templates/${id}`, {
          token,
          body: { data: payloads[(index - 1) / 2], title: `Version ${index}` },
        }),
  )
  const results = await Promise.all(requests)
  const statuses = results.map((reply) => reply.status)
  note(`statuts : ${tally(statuses)}`)
  for (const reply of results) {
    check(
      [200, 409, 503].includes(reply.status),
      `${reply.method} concurrent : 200, 409 ou 503 attendus (${reply.status} ${reply.text.slice(0, 120)})`,
    )
  }
  check(statuses.includes(200), 'au moins une écriture aboutit')
  if (statuses.includes(503)) {
    // L'auteur rejoue : un PATCH qui ne change rien revoit l'index.
    const current = (await getTemplate(id)).body.template as PublicTemplate
    const replay = await call('PATCH', `/api/templates/${id}`, {
      token,
      body: { indexable: current.indexable },
    })
    equal(replay.status, 200, 'rejeu après 503')
  }
  await settleAndCheckIndex(id, 'après 10 écritures simultanées')
})

// 13 ───────────────────────────────────────────────────────────────────────────
async function parallelPublications(prefix: string, label: string) {
  const stops: Stop[] = [
    { city: 'Reykjavík', coordinates: [64.14, -21.94], days: 2 },
    { city: 'Vík', coordinates: [63.41, -19.0], days: 2 },
    { city: 'Höfn', coordinates: [64.25, -15.2], days: 3 },
  ]
  const days = tripOf(stops, prefix)
  const data = await payloadOf(days)
  const replies = await Promise.all(
    Array.from({ length: 10 }, () =>
      call('POST', '/api/templates', {
        body: { data, country: 'IS', title: label },
      }),
    ),
  )
  note(`statuts : ${tally(replies.map((reply) => reply.status))}`)
  const published = replies
    .filter((reply) => reply.status === 201)
    .map(rememberPublication)
  for (const reply of replies) {
    check(
      reply.status === 201 || reply.status === 409,
      `publication concurrente : 201 ou 409 (${reply.status} ${reply.text.slice(0, 120)})`,
    )
  }
  const base = 'islande-7-jours-reykjavik-vik-hofn'
  const slugs = published.map((item) => item.template.slug)
  equal(new Set(slugs).size, slugs.length, 'slugs distincts')
  for (const item of published) {
    const { slug, id } = item.template
    check(
      slug === base ||
        /-[2-5]$/.test(slug) ||
        slug === idSuffixedSlug(base, id, 6) ||
        slug === idSuffixedSlug(base, id, 16),
      `slug inattendu ${slug}`,
    )
    deepEqual(stored(`slugs/${slug}`), { id }, `slugs/${slug} → ${id}`)
  }
  return published
}

/** Lignes du journal serveur qui avouent un index abandonné pour ces ids. */
function abandonedIndexIds(ids: string[]): string[] {
  const log = ctx.serverLog()
  return ids.filter((id) =>
    log.includes(`${id} attendra sa prochaine écriture`),
  )
}

scenario(
  'Concurrence : 10 publications simultanées du même voyage',
  async () => {
    const published = await parallelPublications('pp', 'Islande en parallèle')
    equal(published.length, 10, 'les 10 publications aboutissent')
    const entries = await indexEntries()
    const missing = published.filter(
      (item) => !entries.some((entry) => entry.id === item.template.id),
    )
    const abandoned = abandonedIndexIds(missing.map((item) => item.template.id))
    note(
      `absents de l’index : ${missing.length} / 10 (dont ${abandoned.length} abandonnés après 5 conflits, journalisés)`,
    )
    equal(
      missing.length,
      abandoned.length,
      'un modèle publié manque à l’index sans que le serveur l’ait journalisé',
    )
    // Sans latence, la perte dépend de l'ordonnancement (0 ou 1 sur 10) : le
    // scénario suivant, sous latence, la rend reproductible et l'affirme.
    for (const item of published) {
      const entry = entries.find((line) => line.id === item.template.id)
      if (entry)
        deepEqual(
          entry,
          entryOf(item.template),
          `ligne d’index de ${item.template.slug}`,
        )
    }
  },
)

// 14 ───────────────────────────────────────────────────────────────────────────
scenario(
  'Concurrence sous latence S3 (25 ms par requête) : 10 publications simultanées',
  async () => {
    ctx.s3.setLatency(25)
    let published: Published[]
    try {
      published = await parallelPublications('pl', 'Islande sous latence')
    } finally {
      ctx.s3.setLatency(0)
    }
    const entries = await indexEntries()
    const missing = published.filter(
      (item) => !entries.some((entry) => entry.id === item.template.id),
    )
    const abandoned = abandonedIndexIds(missing.map((item) => item.template.id))
    note(
      `publiés : ${published.length} / 10 · absents de l’index : ${missing.length} (dont ${abandoned.length} journalisés « attendra sa prochaine écriture »)`,
    )
    equal(
      missing.length,
      abandoned.length,
      'un modèle publié manque à l’index sans que le serveur l’ait journalisé',
    )
    soft(
      missing.length === 0,
      `sous 25 ms de latence S3, ${missing.length} modèle(s) indexable(s) sur ${published.length} publiés ensemble manquent à l’index (et au sitemap) jusqu’à leur prochaine écriture`,
    )
    // L'auteur qui touche à son modèle le fait entrer : rattrapage prévu par la conception.
    for (const item of missing) {
      const replay = await call('PATCH', `/api/templates/${item.template.id}`, {
        token: item.token,
        body: { authorName: 'Rattrapage' },
      })
      equal(replay.status, 200, 'écriture suivante')
      await expectInIndex(replay.body.template, 'après l’écriture suivante')
    }
  },
)

// 15 ───────────────────────────────────────────────────────────────────────────
scenario('Concurrence : retrait pendant des mises à jour', async () => {
  for (let round = 1; round <= 3; round++) {
    const { template, token } = await publish(japanTrip(`rt${round}`), {
      country: 'JP',
    })
    const id = template.id
    const data = await payloadOf(japanTrip(`rt${round}`).slice(0, 4))
    const requests: Promise<Reply>[] = []
    for (let index = 0; index < 9; index++) {
      requests.push(
        index % 2 === 0
          ? call('PUT', `/api/templates/${id}`, { token, body: { data } })
          : call('PATCH', `/api/templates/${id}`, {
              token,
              body: { indexable: index % 3 !== 0 },
            }),
      )
      if (index === round + 2) {
        requests.push(call('DELETE', `/api/templates/${id}`, { token }))
      }
    }
    const results = await Promise.all(requests)
    note(`tour ${round} : ${tally(results.map((reply) => reply.status))}`)
    for (const reply of results) {
      // Un modèle retiré entre-temps répond 410 : la conception ne prévoit
      // pas de 500 pour une écriture qui croise un retrait.
      soft(
        [200, 409, 410, 503].includes(reply.status),
        `${reply.method} concurrent d’un DELETE → ${reply.status} « ${reply.body?.error} » au lieu de 200, 409 ou 410`,
      )
    }
    const removal = results.find((reply) => reply.method === 'DELETE')
    if (removal?.status !== 200) {
      equal(
        (await call('DELETE', `/api/templates/${id}`, { token })).status,
        200,
        `tour ${round} : retrait rejoué`,
      )
    }
    equal((await getTemplate(id)).status, 410, `tour ${round} : retiré`)
    await expectNotInIndex(id, `tour ${round}`)
    deepEqual(
      storedKeys(`${id}/v/`),
      [],
      `tour ${round} : aucune version ne survit au retrait`,
    )
    deepEqual(
      Object.keys(stored(`${id}/meta`)).sort(),
      TOMBSTONE_KEYS,
      `tour ${round} : pierre tombale réduite`,
    )
  }
})

// 16 ───────────────────────────────────────────────────────────────────────────
scenario('Limiteur de débit : 429 et Retry-After', async () => {
  const ip = '203.0.113.50'
  const statuses: number[] = []
  for (let attempt = 0; attempt < 10; attempt++) {
    statuses.push(
      (await call('POST', '/api/templates', { body: {}, ip })).status,
    )
  }
  deepEqual(
    statuses,
    Array(10).fill(400),
    '10 premières publications : traitées (400, corps vide)',
  )
  const limited = await call('POST', '/api/templates', { body: {}, ip })
  equal(limited.status, 429, '11e publication de la même IP : 429')
  const retryAfter = Number(limited.headers.get('retry-after'))
  check(
    Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60,
    `Retry-After en secondes, entre 1 et 60 (${limited.headers.get('retry-after')})`,
  )
  equal(
    limited.body?.error,
    'Trop de tentatives. Réessayez dans un instant.',
    '429 : message',
  )
  const chained = await call('POST', '/api/templates', {
    body: {},
    headers: { 'x-forwarded-for': `${ip}, 10.9.9.9` },
  })
  equal(chained.status, 429, 'x-forwarded-for chaîné : la première IP compte')
  equal(
    (await call('POST', '/api/templates', { body: {}, ip: '203.0.113.51' }))
      .status,
    400,
    'une autre IP n’est pas limitée',
  )

  const writer = '203.0.113.60'
  const writes: number[] = []
  for (let attempt = 0; attempt < 30; attempt++) {
    writes.push(
      (
        await call('PATCH', '/api/templates/0123456789abcdef', {
          ip: writer,
          token: randomBytes(32).toString('base64url'),
          body: { indexable: true },
        })
      ).status,
    )
  }
  check(!writes.includes(429), '30 écritures par minute : aucune limitée')
  const writeLimited = await call('DELETE', '/api/templates/0123456789abcdef', {
    ip: writer,
    token: randomBytes(32).toString('base64url'),
  })
  equal(
    writeLimited.status,
    429,
    '31e écriture de la même IP (toutes méthodes) : 429',
  )
  check(writeLimited.headers.get('retry-after'), '429 d’écriture : Retry-After')
  equal(
    (await call('GET', '/api/templates/index', { ip: writer })).status,
    200,
    'les lectures ne sont pas limitées',
  )
})

// 17 ───────────────────────────────────────────────────────────────────────────
/** Tous les morceaux de l'index (`templates/index/<c>`, un par premier caractère d'id). */
const INDEX_KEYS = /^templates\/index\//
/** Le morceau d'index d'un modèle. */
const indexKeyOf = (id: string) => `templates/index/${id.charAt(0)}`

scenario(
  'Index qui ne suit pas une sortie : 503, puis rattrapage',
  async () => {
    const { template, token } = await publish(tripOf(LISBON_STOPS, 'ix'), {
      country: 'PT',
    })
    await expectInIndex(template, 'avant la panne')
    ctx.s3.addFault({ op: 'PutObject', key: INDEX_KEYS, status: 412 })
    try {
      const hide = await call('PATCH', `/api/templates/${template.id}`, {
        token,
        body: { indexable: false },
      })
      equal(hide.status, 503, 'masquer sans index : 503')
      equal(
        hide.body?.error,
        'Le modèle n’a pas pu être retiré de la liste publique de tripbrain.fr. Réessayez.',
        '503 index : message',
      )
      const now = (await getTemplate(template.id)).body.template
      equal(now.indexable, false, 'la méta est écrite malgré le 503')
      equal(
        (await call('GET', `/api/templates/by-slug/${template.slug}`)).status,
        404,
        'by-slug suit déjà la méta : 404',
      )
      const stale = (await indexEntries()).find(
        (entry) => entry.id === template.id,
      )
      check(
        stale,
        'l’index n’a pas suivi (comportement documenté jusqu’au rejeu)',
      )
    } finally {
      ctx.s3.clearFaults()
    }
    const replay = await call('PATCH', `/api/templates/${template.id}`, {
      token,
      body: { indexable: false },
    })
    equal(replay.status, 200, 'rejeu du masquage : 200')
    await expectNotInIndex(template.id, 'après rejeu')

    // Même chose pour un retrait : le titre ne doit pas rester public.
    const shown = await call('PATCH', `/api/templates/${template.id}`, {
      token,
      body: { indexable: true },
    })
    await expectInIndex(shown.body.template, 'réaffiché')
    ctx.s3.addFault({ op: 'PutObject', key: INDEX_KEYS, status: 412 })
    try {
      const retire = await call('DELETE', `/api/templates/${template.id}`, {
        token,
      })
      equal(retire.status, 503, 'retrait sans index : 503')
      equal(
        (await getTemplate(template.id)).status,
        410,
        'pierre tombale déjà en place',
      )
    } finally {
      ctx.s3.clearFaults()
    }
    equal(
      (await call('DELETE', `/api/templates/${template.id}`, { token })).status,
      200,
      'rejeu du retrait : 200',
    )
    await expectNotInIndex(template.id, 'après rejeu du retrait')
  },
)

// 18 ───────────────────────────────────────────────────────────────────────────
scenario(
  'Versions non supprimées au retrait : 503, puis rattrapage',
  async () => {
    const days = tripOf(LISBON_STOPS, 'vd')
    const { template, token } = await publish(days, { country: 'PT' })
    await call('PUT', `/api/templates/${template.id}`, {
      token,
      body: { data: await payloadOf(days) },
    })
    for (const [label, rule] of [
      [
        'requête DeleteObjects en échec',
        { op: 'DeleteObjects' as const, status: 500 },
      ],
      [
        'une clé refusée dans DeleteObjects',
        { op: 'DeleteObjects' as const, key: /\/v\/1$/, perKey: true },
      ],
    ] as const) {
      ctx.s3.addFault(rule)
      try {
        const retire = await call('DELETE', `/api/templates/${template.id}`, {
          token,
        })
        equal(retire.status, 503, `${label} : 503`)
        equal(
          retire.body?.error,
          'Le modèle est retiré, mais son contenu n’a pas pu être effacé. Réessayez.',
          `${label} : message`,
        )
        equal(
          (await getTemplate(template.id)).status,
          410,
          `${label} : déjà 410`,
        )
        await expectNotInIndex(
          template.id,
          `${label} : index accordé malgré tout`,
        )
        check(
          storedKeys(`${template.id}/v/`).length > 0,
          `${label} : versions encore stockées`,
        )
      } finally {
        ctx.s3.clearFaults()
      }
    }
    equal(
      (await call('DELETE', `/api/templates/${template.id}`, { token })).status,
      200,
      'rejeu : 200',
    )
    deepEqual(storedKeys(`${template.id}/v/`), [], 'rejeu : versions effacées')
  },
)

// 19 ───────────────────────────────────────────────────────────────────────────
scenario(
  'Index en échec à la publication : 201, puis entrée à l’écriture suivante',
  async () => {
    ctx.s3.addFault({ op: 'PutObject', key: INDEX_KEYS, status: 500 })
    let published: Published
    try {
      published = await publish(tripOf(LISBON_STOPS, 'ip'), { country: 'PT' })
    } finally {
      ctx.s3.clearFaults()
    }
    equal(published.template.listed, true, 'publié et listé')
    await expectNotInIndex(
      published.template.id,
      'index en panne à la publication',
    )
    equal(
      (await call('GET', `/api/templates/by-slug/${published.template.slug}`))
        .status,
      200,
      'la page by-slug existe déjà',
    )
    const touched = await call(
      'PATCH',
      `/api/templates/${published.template.id}`,
      {
        token: published.token,
        body: { authorName: 'Ana' },
      },
    )
    equal(touched.status, 200, 'écriture suivante')
    await expectInIndex(touched.body.template, 'après l’écriture suivante')
  },
)

// 20 ───────────────────────────────────────────────────────────────────────────
scenario(
  'Réponse S3 perdue : l’écriture a lieu, la réponse se perd',
  async () => {
    const days = tripOf(
      [{ city: 'Porto', coordinates: [41.15, -8.61], days: 2 }],
      'lost',
    )
    const base = 'portugal-2-jours-porto'

    // a. La méta de publication : le SDK rejoue et reçoit 412 pour sa propre écriture.
    const metasBefore = new Set(metaIds())
    ctx.s3.addFault({
      op: 'PutObject',
      key: /\/meta$/,
      resetAfter: true,
      times: 1,
    })
    const first = await call('POST', '/api/templates', {
      body: { data: await payloadOf(days), country: 'PT', title: 'Porto' },
    })
    ctx.s3.clearFaults()
    const created = metaIds().filter((id) => !metasBefore.has(id))
    note(
      `publication dont la réponse de méta se perd : ${first.status}, ${created.length} méta(s) créée(s)`,
    )
    if (first.status === 201) {
      rememberPublication(first)
    } else {
      const orphan = created[0]
      const bySlug = await call('GET', `/api/templates/by-slug/${base}`)
      soft(
        created.length === 0,
        `POST → ${first.status} « ${first.body?.error} », mais le modèle ${orphan ?? '?'} est bel et bien stocké : listé, servi par by-slug (${bySlug.status}), sans jeton côté auteur (ni PUT, ni PATCH, ni DELETE possibles), absent de l’index`,
      )
      const retry = await publish(days, { country: 'PT', title: 'Porto' })
      soft(
        retry.template.slug === base,
        `l’auteur qui réessaie obtient « ${retry.template.slug} » : « ${base} » reste au modèle orphelin`,
      )
      if (orphan) {
        // Ménage, par le chemin de l'opérateur, pour la cohérence finale.
        const script = await runRetireScript([orphan])
        equal(script.code, 0, 'orphelin retiré par l’opérateur')
      }
    }

    // b. La méta d'une mise à jour : la version se décale, rien ne casse.
    const { template, token } = await publish(
      tripOf(
        [{ city: 'Braga', coordinates: [41.55, -8.42], days: 2 }],
        'lostb',
      ),
      { country: 'PT' },
    )
    ctx.s3.addFault({
      op: 'PutObject',
      key: `templates/${template.id}/meta`,
      resetAfter: true,
      times: 1,
    })
    const put = await call('PUT', `/api/templates/${template.id}`, {
      token,
      body: { data: await payloadOf(days) },
    })
    ctx.s3.clearFaults()
    equal(put.status, 200, 'PUT dont la réponse de méta se perd : 200')
    const version = put.body.template.version
    note(
      `PUT dont la réponse de méta se perd : version publiée ${version}, v/2 → ${(await call('GET', `/api/templates/${template.id}/v/2`)).status}`,
    )
    equal(
      (await call('GET', `/api/templates/${template.id}/v/${version}`)).status,
      200,
      'la version annoncée existe',
    )

    // c. La réservation du slug : un slug brûlé, le modèle prend le suivant.
    ctx.s3.addFault({
      op: 'PutObject',
      key: /\/slugs\//,
      resetAfter: true,
      times: 1,
    })
    const coimbra = await publish(
      tripOf(
        [{ city: 'Coimbra', coordinates: [40.2, -8.41], days: 2 }],
        'lostc',
      ),
      { country: 'PT' },
    )
    ctx.s3.clearFaults()
    note(
      `publication dont la réponse du slug se perd : slug « ${coimbra.template.slug} »`,
    )
    await expectInIndex(coimbra.template, 'slug perdu')
  },
)

// 21 ───────────────────────────────────────────────────────────────────────────
scenario(
  'Méta et index illisibles, snapshot d’un format plus récent',
  async () => {
    const { template, token } = await publish(tripOf(LISBON_STOPS, 'cr'), {
      country: 'PT',
    })
    const metaKey = `templates/${template.id}/meta`
    const metaData = stored(`${template.id}/meta`)
    const metaBackup = ctx.s3.object(ctx.bucket, metaKey)
    check(metaBackup, 'méta stockée')
    const restoreMeta = () =>
      ctx.s3.putObject(
        ctx.bucket,
        metaKey,
        metaBackup.body,
        metaBackup.contentType,
      )

    ctx.s3.putObject(
      ctx.bucket,
      metaKey,
      envelope({ pas: 'une méta' }),
      'application/gzip',
    )
    for (const [method, path, body] of [
      ['GET', `/api/templates/${template.id}`, undefined],
      ['GET', `/api/templates/by-slug/${template.slug}`, undefined],
      ['GET', `/api/templates/${template.id}/v/1`, undefined],
      ['PATCH', `/api/templates/${template.id}`, { indexable: false }],
      ['DELETE', `/api/templates/${template.id}`, undefined],
    ] as const) {
      const reply = await call(method, path, { token, body })
      equal(
        reply.status,
        500,
        `méta illisible : ${method} ${path.split('/').slice(3).join('/')} → 500, jamais 404`,
      )
    }
    ctx.s3.putObject(
      ctx.bucket,
      metaKey,
      Buffer.from('ni gzip ni JSON'),
      'application/gzip',
    )
    equal((await getTemplate(template.id)).status, 500, 'objet illisible : 500')

    ctx.s3.putObject(
      ctx.bucket,
      metaKey,
      envelope(metaData, 2),
      'application/gzip',
    )
    const tooNew = await getTemplate(template.id)
    equal(tooNew.status, 409, 'format plus récent : 409')
    equal(
      tooNew.body?.error,
      'Ce modèle vient d’une version plus récente de TripBrain. Mettez l’application à jour.',
      'format plus récent : message',
    )
    restoreMeta()
    equal((await getTemplate(template.id)).status, 200, 'méta restaurée')

    const indexKey = indexKeyOf(template.id)
    const indexBackup = ctx.s3.object(ctx.bucket, indexKey)
    check(indexBackup, 'index stocké')
    const unreadable = envelope({ entries: 'oups' })
    ctx.s3.putObject(ctx.bucket, indexKey, unreadable, 'application/gzip')
    try {
      const index = await call('GET', '/api/templates/index')
      equal(index.status, 500, 'index illisible : 500, jamais une liste vide')
      const hide = await call('PATCH', `/api/templates/${template.id}`, {
        token,
        body: { indexable: false },
      })
      equal(hide.status, 503, 'masquer avec un index illisible : 503')
      check(
        ctx.s3.object(ctx.bucket, indexKey)?.body.equals(unreadable),
        'un index illisible n’est jamais réécrit',
      )
    } finally {
      ctx.s3.putObject(
        ctx.bucket,
        indexKey,
        indexBackup.body,
        indexBackup.contentType,
      )
    }
    const replay = await call('PATCH', `/api/templates/${template.id}`, {
      token,
      body: { indexable: false },
    })
    equal(replay.status, 200, 'index restauré : rejeu 200')
    await expectNotInIndex(template.id, 'index restauré')
  },
)

// 22 ───────────────────────────────────────────────────────────────────────────
scenario('Stockage S3 hors service, puis rétabli', async () => {
  const days = tripOf(LISBON_STOPS, 'down')
  const { template, token } = await publish(days, { country: 'PT' })
  const data = await payloadOf(days)
  const keysBefore = storedKeys().length
  await ctx.s3.stop()
  const timings: string[] = []
  try {
    const attempts: [string, string, CallOptions][] = [
      ['POST', '/api/templates', { body: { data, country: 'PT' } }],
      ['GET', `/api/templates/${template.id}`, {}],
      ['GET', `/api/templates/${template.id}/v/1`, {}],
      ['GET', `/api/templates/by-slug/${template.slug}`, {}],
      ['GET', '/api/templates/index', {}],
      ['PUT', `/api/templates/${template.id}`, { token, body: { data } }],
      [
        'PATCH',
        `/api/templates/${template.id}`,
        { token, body: { indexable: false } },
      ],
      ['DELETE', `/api/templates/${template.id}`, { token }],
    ]
    for (const [method, path, options] of attempts) {
      const reply = await call(method, path, options)
      timings.push(
        `${reply.kind} ${reply.status} en ${Math.round(reply.ms)} ms`,
      )
      check(
        reply.status === 500 || reply.status === 503,
        `S3 hors service : ${reply.kind} → ${reply.status} (5xx attendu)`,
      )
      check(
        /Réessayez/.test(reply.body?.error ?? ''),
        `S3 hors service : ${reply.kind} invite à réessayer (« ${reply.body?.error} »)`,
      )
      check(
        reply.ms < 15_000,
        `S3 hors service : ${reply.kind} répond en moins de 15 s`,
      )
    }
  } finally {
    await ctx.s3.start()
  }
  note(timings.join(' · '))
  equal(storedKeys().length, keysBefore, 'rien n’a été écrit pendant la panne')
  const back = await getTemplate(template.id)
  equal(back.status, 200, 'S3 rétabli : lecture')
  deepEqual(back.body.template, template, 'S3 rétabli : modèle intact')
  const write = await call('PATCH', `/api/templates/${template.id}`, {
    token,
    body: { authorName: 'Après la panne' },
  })
  equal(write.status, 200, 'S3 rétabli : écriture')
})

// 23 ───────────────────────────────────────────────────────────────────────────
interface ScriptRun {
  code: number | null
  stdout: string
  stderr: string
  ms: number
}

function runRetireScript(
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<ScriptRun> {
  const started = performance.now()
  // Seules les variables du shell comptent : PATH, HOME et R2 (NODE_ENV,
  // que les types de Next exigent, n'est pas lu par le script).
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    ...ctx.r2Env,
    ...extraEnv,
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      'bun',
      ['--no-env-file', 'scripts/retire-template.ts', ...args],
      { cwd: ctx.root, env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('exit', (code) =>
      resolve({ code, stdout, stderr, ms: performance.now() - started }),
    )
  })
}

scenario(
  'Script de retrait opérateur (scripts/retire-template.ts)',
  async () => {
    const usage = await runRetireScript([])
    equal(usage.code, 2, 'sans argument : code 2')
    check(usage.stderr.includes('Usage'), 'sans argument : usage affiché')
    equal(
      (await runRetireScript(['pas un slug'])).code,
      2,
      'argument mal formé : code 2',
    )
    equal(
      (await runRetireScript(['a', 'b'])).code,
      2,
      'deux arguments : code 2',
    )
    const help = await runRetireScript(['--help'])
    equal(help.code, 0, '--help : code 0')
    const unknown = await runRetireScript(['japon-99-jours-inconnu'])
    equal(unknown.code, 1, 'slug inconnu : code 1')
    check(unknown.stderr.includes('Aucun modèle'), 'slug inconnu : message')

    const days = tripOf(
      [{ city: 'Sevilla', coordinates: [37.38, -5.98], days: 3 }],
      'op',
    )
    const listed = await publish(days, {
      country: 'ES',
      title: 'Séville signalée',
      authorName: 'Lola',
    })
    const hash = sha256(listed.token)
    const bySlug = await runRetireScript([listed.template.slug])
    equal(bySlug.code, 0, `retrait par slug : code 0 (${bySlug.stderr.trim()})`)
    check(
      bySlug.stdout.includes('Bucket R2 : e2e (préfixe templates/)'),
      'bucket visé affiché',
    )
    check(
      bySlug.stdout.includes('« Séville signalée » · Lola · ES'),
      'état avant : titre, prénom, pays',
    )
    check(bySlug.stdout.includes(`id ${listed.template.id}`), 'id affiché')
    check(bySlug.stdout.includes('Retiré.'), 'retrait annoncé')
    check(
      bySlug.stdout.includes('versions : aucune, contenu effacé'),
      'contenu effacé',
    )
    check(
      !bySlug.stdout.includes(hash) && !bySlug.stderr.includes(hash),
      'empreinte du jeton jamais affichée',
    )
    check(!bySlug.stdout.includes(listed.token), 'jeton jamais affiché')
    note(`retrait par slug en ${Math.round(bySlug.ms)} ms`)
    equal((await getTemplate(listed.template.id)).status, 410, 'API : 410')
    equal(
      (await call('GET', `/api/templates/by-slug/${listed.template.slug}`))
        .status,
      410,
      'by-slug : 410 (était listé)',
    )
    await expectNotInIndex(listed.template.id, 'retrait opérateur')
    deepEqual(
      storedKeys(`${listed.template.id}/v/`),
      [],
      'aucune version stockée',
    )
    deepEqual(
      Object.keys(stored(`${listed.template.id}/meta`)).sort(),
      TOMBSTONE_KEYS,
      'pierre tombale réduite',
    )
    equal(
      (
        await call('PUT', `/api/templates/${listed.template.id}`, {
          token: listed.token,
          body: { data: await payloadOf(days) },
        })
      ).status,
      410,
      'l’auteur ne peut plus mettre à jour',
    )
    equal(
      (
        await call('DELETE', `/api/templates/${listed.template.id}`, {
          token: listed.token,
        })
      ).status,
      200,
      'l’auteur peut encore « retirer » (idempotent)',
    )

    const rerun = await runRetireScript([listed.template.slug])
    equal(rerun.code, 0, 'relance : code 0')
    check(rerun.stdout.includes('Déjà retiré'), 'relance : déjà retiré')

    const unlisted = await publish(days, { country: 'ES', indexable: false })
    const byLink = await runRetireScript([
      `https://app.tripbrain.fr/m/${unlisted.template.id.toUpperCase()}`,
    ])
    equal(
      byLink.code,
      0,
      `retrait par lien /m/<ID> en majuscules : code 0 (${byLink.stderr.trim()})`,
    )
    check(byLink.stdout.includes('n’était pas listé'), 'non listé : annoncé')
    equal(
      (await call('GET', `/api/templates/by-slug/${unlisted.template.slug}`))
        .status,
      404,
      'non listé retiré : by-slug 404',
    )

    const third = await publish(days, { country: 'ES' })
    const bySiteLink = await runRetireScript([
      `https://tripbrain.fr/itineraires/${third.template.slug}`,
    ])
    equal(bySiteLink.code, 0, 'retrait par lien tripbrain.fr : code 0')
    equal(
      (await getTemplate(third.template.id)).status,
      410,
      'lien tripbrain.fr : 410',
    )

    const faulty = await publish(days, { country: 'ES' })
    ctx.s3.addFault({ op: 'PutObject', key: INDEX_KEYS, status: 412 })
    const indexFail = await runRetireScript([faulty.template.id])
    ctx.s3.clearFaults()
    equal(indexFail.code, 1, 'index en panne : code 1')
    check(
      indexFail.stderr.includes('l’index public n’a pas suivi'),
      'index en panne : message',
    )
    ctx.s3.addFault({ op: 'DeleteObjects', status: 500 })
    const versionsFail = await runRetireScript([faulty.template.id])
    ctx.s3.clearFaults()
    equal(versionsFail.code, 1, 'versions non supprimées : code 1')
    check(
      versionsFail.stderr.includes('n’ont pas été supprimées'),
      'versions non supprimées : message',
    )
    const fixed = await runRetireScript([faulty.template.id])
    equal(fixed.code, 0, 'relance après pannes : code 0')
    await expectNotInIndex(faulty.template.id, 'relance après pannes')
    deepEqual(
      storedKeys(`${faulty.template.id}/v/`),
      [],
      'relance après pannes : versions effacées',
    )

    const victim = await publish(days, { country: 'ES' })
    await ctx.s3.stop()
    let down: ScriptRun
    try {
      down = await runRetireScript([victim.template.id])
    } finally {
      await ctx.s3.start()
    }
    equal(down.code, 1, 'S3 hors service : code 1')
    check(down.stderr.includes('Échec'), 'S3 hors service : message d’échec')
    equal(
      (await getTemplate(victim.template.id)).status,
      200,
      'S3 hors service : rien n’a changé',
    )

    const missingEnv = await runRetireScript([victim.template.id], {
      R2_BUCKET_NAME: '',
    })
    equal(missingEnv.code, 1, 'variable R2 manquante : code 1')
    check(
      missingEnv.stderr.includes('R2_BUCKET_NAME'),
      'variable R2 manquante : nommée',
    )
  },
)

// 24 ───────────────────────────────────────────────────────────────────────────
scenario(
  'Client navigateur (template-api.ts) contre le vrai serveur',
  async () => {
    const realFetch = globalThis.fetch
    const ip = freshIp()
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' && input.startsWith('/')
          ? `${ctx.baseUrl}${input}`
          : input
      const headers = new Headers(init?.headers)
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', ip)
      return realFetch(url, { ...init, headers })
    }) as typeof fetch
    try {
      const days = japanTrip('cl')
      const options = { includeNotes: false, includePrices: true }
      const publication = await templateClient.publishTemplate(days, {
        title: '',
        authorName: 'Yanis',
        country: 'JP',
        options,
        indexable: true,
      })
      issuedTokens.add(publication.ownerToken)
      const { template, ownerToken } = publication
      check(
        template.slug.startsWith('japon-14-jours-tokyo-hakone-kyoto') &&
          template.slug !== 'japon-14-jours-tokyo-hakone-kyoto',
        `slug suffixé : le cycle de vie a réservé le premier (${template.slug})`,
      )
      deepEqual(
        template.itinerary,
        cleanForTemplate(days, options),
        'nettoyé sur le téléphone, renettoyé à l’identique sur le serveur',
      )
      deepEqual(
        await templateClient.fetchTemplate(template.id),
        template,
        'fetchTemplate',
      )
      const v1 = await templateClient.fetchTemplateVersion(template.id, 1)
      deepEqual(
        v1,
        { version: 1, itinerary: template.itinerary },
        'fetchTemplateVersion',
      )
      const updated = await templateClient.updateTemplate(
        template.id,
        ownerToken,
        days.slice(0, 7),
        {
          options: {
            includeNotes: template.includesNotes,
            includePrices: template.includesPrices,
          },
        },
      )
      equal(updated.version, 2, 'updateTemplate : version 2')
      equal(updated.dayCount, 7, 'updateTemplate : 7 jours')
      const hidden = await templateClient.patchTemplate(
        template.id,
        ownerToken,
        { indexable: false },
      )
      equal(hidden.listed, false, 'patchTemplate : masqué')

      const expectError = async (
        label: string,
        run: () => Promise<unknown>,
        kind: new (...args: never[]) => Error,
        reason?: string,
      ) => {
        try {
          await run()
          check(false, `${label} : une erreur était attendue`)
        } catch (error) {
          if (error instanceof AssertionFailure) throw error
          check(
            error instanceof kind,
            `${label} : ${kind.name} attendue, obtenu ${String(error)}`,
          )
          if (reason) {
            equal(
              templateClient.templateFailureReason(error),
              reason,
              `${label} : cause mesurée`,
            )
          }
          return error as Error
        }
      }
      await expectError(
        'mauvais jeton',
        () =>
          templateClient.patchTemplate(
            template.id,
            randomBytes(32).toString('base64url'),
            { indexable: true },
          ),
        templateClient.TemplateForbiddenError,
      )
      await expectError(
        '181 jours',
        () =>
          templateClient.updateTemplate(
            template.id,
            ownerToken,
            manyDays(181, 'cl181'),
            { options },
          ),
        templateClient.TemplateTooLargeError,
        'too_large',
      )
      const invalid = await expectError(
        'pays inconnu',
        () =>
          templateClient.publishTemplate(days, {
            title: '',
            authorName: null,
            country: 'ZZ',
            options,
            indexable: true,
          }),
        templateClient.TemplateInvalidError,
        'invalid',
      )
      equal(
        invalid?.message,
        'Pays du voyage invalide.',
        'message du serveur repris',
      )
      await expectError(
        'id inconnu',
        () => templateClient.fetchTemplate('0123456789abcdef'),
        templateClient.TemplateNotFoundError,
      )
      await templateClient.retireTemplate(template.id, ownerToken)
      await templateClient.retireTemplate(template.id, ownerToken)
      const retired = await expectError(
        'modèle retiré',
        () => templateClient.fetchTemplate(template.id),
        templateClient.TemplateRetiredError,
      )
      equal(
        templateClient.templateTakeFailureReason(retired),
        'retired',
        'cause de reprise : retired',
      )
      await expectError(
        'version d’un modèle retiré',
        () => templateClient.fetchTemplateVersion(template.id, 1),
        templateClient.TemplateRetiredError,
      )

      // 429 : le client le range parmi les indisponibilités.
      for (let attempt = 0; attempt < 10; attempt++) {
        await realFetch(`${ctx.baseUrl}/api/templates`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: '{}',
        })
      }
      const limited = await expectError(
        '429',
        () =>
          templateClient.publishTemplate(days, {
            title: '',
            authorName: null,
            country: 'JP',
            options,
            indexable: true,
          }),
        templateClient.TemplateUnavailableError,
        'unavailable',
      )
      equal(
        (limited as templateClient.TemplateUnavailableError | undefined)
          ?.status,
        429,
        '429 : statut gardé',
      )
    } finally {
      globalThis.fetch = realFetch
    }
  },
)

// 25 ───────────────────────────────────────────────────────────────────────────
scenario('Faux S3 : la route de débogage GET /__keys', async () => {
  const response = await fetch(`${ctx.s3.url}/__keys?bucket=${ctx.bucket}`)
  equal(response.status, 200, 'GET /__keys')
  const body = (await response.json()) as {
    keys: { key: string; size: number }[]
  }
  deepEqual(
    body.keys.map((item) => item.key),
    ctx.s3.keys(ctx.bucket).map((item) => item.key),
    '/__keys = état en mémoire',
  )
  check(
    body.keys.every((item) => item.size > 0),
    'chaque objet a une taille',
  )
  const stats = ctx.s3.stats()
  note(
    `requêtes S3 reçues : ${Object.entries(stats)
      .map(([op, count]) => `${op} ${count}`)
      .join(', ')} · ${body.keys.length} objets`,
  )
  check(
    !stats['GET (non géré)'] && !stats['POST (non géré)'],
    'aucune opération S3 non gérée',
  )
})

// 26 ───────────────────────────────────────────────────────────────────────────
scenario('Cache-Control : chaque route, chaque statut', async () => {
  const seen = new Map<string, Set<string>>()
  for (const record of replies) {
    const key = `${record.kind} ${record.status}`
    const values = seen.get(key) ?? new Set<string>()
    values.add(record.cacheControl ?? '(absent)')
    seen.set(key, values)
  }
  const required = [
    'POST /api/templates 201',
    'POST /api/templates 400',
    'POST /api/templates 413',
    'POST /api/templates 429',
    'POST /api/templates 500',
    'GET [id] 200',
    'GET [id] 404',
    'GET [id] 409',
    'GET [id] 410',
    'GET [id] 500',
    'PUT [id] 200',
    'PUT [id] 400',
    'PUT [id] 401',
    'PUT [id] 403',
    'PUT [id] 404',
    'PUT [id] 410',
    'PUT [id] 413',
    'PATCH [id] 200',
    'PATCH [id] 400',
    'PATCH [id] 401',
    'PATCH [id] 403',
    'PATCH [id] 404',
    'PATCH [id] 410',
    'PATCH [id] 503',
    'DELETE [id] 200',
    'DELETE [id] 401',
    'DELETE [id] 403',
    'DELETE [id] 404',
    'DELETE [id] 429',
    'DELETE [id] 503',
    'GET v/n 200',
    'GET v/n 404',
    'GET v/n 410',
    'GET by-slug 200',
    'GET by-slug 404',
    'GET by-slug 410',
    'GET index 200',
    'GET index 500',
  ]
  const absent = required.filter((key) => !seen.has(key))
  if (ctx.only && absent.length > 0) {
    skip(
      `campagne partielle (E2E_ONLY) : ${absent.length} combinaisons non jouées`,
    )
  }
  deepEqual(absent, [], 'combinaisons route × statut jouées')
  const lines = [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, values]) => `${key} → ${[...values].join(' | ')}`)
  note(`matrice observée :\n      ${lines.join('\n      ')}`)
  for (const [key, values] of seen) {
    const status = Number(key.split(' ').at(-1))
    if (status >= 400 && !/^(GET v\/n|GET by-slug) 410$/.test(key)) {
      check(
        [...values].every((value) => !value.includes('public')),
        `${key} : une erreur ne doit jamais être en cache public (${[...values].join(', ')})`,
      )
    }
  }
})

// 27 ───────────────────────────────────────────────────────────────────────────
scenario('Cohérence finale : index public ↔ métas stockées', async () => {
  const entries = await indexEntries()
  const ids = new Set(entries.map((entry) => entry.id))
  equal(ids.size, entries.length, 'aucun id en double dans l’index')
  const sorted = [...entries].sort((a, b) =>
    a.updatedAt !== b.updatedAt
      ? a.updatedAt < b.updatedAt
        ? 1
        : -1
      : a.id < b.id
        ? -1
        : 1,
  )
  deepEqual(
    entries.map((entry) => entry.id),
    sorted.map((entry) => entry.id),
    'index trié du plus récent au plus ancien',
  )
  let listed = 0
  const unexplained: string[] = []
  for (const id of metaIds()) {
    const meta = stored(`${id}/meta`)
    const entry = entries.find((item) => item.id === id)
    if (meta.retiredAt !== null) {
      check(!entry, `${id} retiré mais présent dans l’index`)
      deepEqual(
        Object.keys(meta).sort(),
        TOMBSTONE_KEYS,
        `${id} : pierre tombale réduite`,
      )
      deepEqual(storedKeys(`${id}/v/`), [], `${id} : retiré sans version`)
      continue
    }
    const isListed = meta.indexable && meta.dayCount >= 2
    if (!isListed) {
      check(!entry, `${id} non listé mais présent dans l’index`)
      continue
    }
    listed += 1
    if (!entry) {
      if (abandonedIndexIds([id]).length === 0) unexplained.push(id)
      continue
    }
    deepEqual(
      entry,
      {
        id,
        slug: meta.slug,
        title: meta.title,
        country: meta.country,
        dayCount: meta.dayCount,
        cities: meta.cities,
        updatedAt: meta.updatedAt,
      },
      `${id} : ligne d’index = méta stockée`,
    )
    check(
      storedKeys(`${id}/v/${meta.version}`).length === 1,
      `${id} : version publiée stockée`,
    )
  }
  for (const entry of entries) {
    check(metaIds().includes(entry.id), `${entry.id} dans l’index sans méta`)
  }
  for (const key of storedKeys('slugs/')) {
    const slug = key.slice('templates/slugs/'.length)
    const pointer = stored(`slugs/${slug}`)
    check(isTemplateId(pointer?.id), `slugs/${slug} pointe vers un id`)
  }
  note(
    `${metaIds().length} modèles stockés, ${listed} listés, ${entries.length} dans l’index`,
  )
  deepEqual(
    unexplained,
    [],
    'modèles listés absents de l’index sans explication',
  )
})

// ── Lancement ─────────────────────────────────────────────────────────────────

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

export async function runTemplateScenarios(
  options: E2EOptions,
): Promise<E2EReport> {
  ctx = options
  const started = performance.now()
  const report: E2EReport = {
    passed: 0,
    failed: 0,
    skipped: 0,
    assertions: 0,
    ms: 0,
  }
  const selected = scenarios.filter(
    (item) =>
      !options.only ||
      item.name.toLowerCase().includes(options.only.toLowerCase()),
  )
  console.log(`\n${selected.length} scénario(s) de bout en bout\n`)
  for (const [index, item] of selected.entries()) {
    current = { name: item.name, assertions: 0, failures: [], notes: [] }
    const scenarioStarted = performance.now()
    let status: 'ok' | 'failed' | 'skipped' = 'ok'
    let reason = ''
    try {
      await item.run()
      if (current.failures.length > 0) status = 'failed'
    } catch (error) {
      if (error instanceof SkipScenario) {
        status = 'skipped'
        reason = error.message
      } else {
        status = 'failed'
        current.failures.unshift(
          error instanceof AssertionFailure
            ? error.message
            : `erreur inattendue : ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        )
      }
    } finally {
      ctx.s3.clearFaults()
      ctx.s3.setLatency(0)
      await ctx.s3.start()
    }
    const ms = performance.now() - scenarioStarted
    report.assertions += current.assertions
    const mark = status === 'ok' ? '✔' : status === 'failed' ? '✘' : '–'
    console.log(
      `${mark} ${String(index + 1).padStart(2)}. ${item.name} (${current.assertions} assertions, ${Math.round(ms)} ms)`,
    )
    if (status === 'skipped') console.log(`      sauté : ${reason}`)
    for (const failure of current.failures) console.log(`      ✘ ${failure}`)
    for (const line of current.notes) console.log(`      · ${line}`)
    if (status === 'ok') report.passed += 1
    else if (status === 'failed') report.failed += 1
    else report.skipped += 1
  }
  report.ms = performance.now() - started
  console.log(
    `\nRésumé : ${selected.length} scénarios · ${report.passed} réussis · ${report.failed} en échec · ${report.skipped} sautés · ${report.assertions} assertions · ${replies.length} requêtes HTTP · ${seconds(report.ms)}`,
  )
  return report
}
