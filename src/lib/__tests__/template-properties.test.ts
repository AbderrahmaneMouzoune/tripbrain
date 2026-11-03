// Tests de propriétés des modules purs des itinéraires modèles : chaque
// propriété est vérifiée sur des centaines de voyages tirés au hasard, à
// graine fixe (`FUZZ_SEED`), et minimise son contre-exemple en cas d'échec.
//
//   FUZZ_RUNS=5000 FUZZ_SEED=autre bunx vitest run src/lib/__tests__/template-properties.test.ts
//
// Règles vérifiées : `docs/itineraire-modele-technique.md` §2.1 (slug), §3.1
// (nettoyage, extraits de notes), §3.2 (recalage), §4 (forme des valeurs),
// §5 (décompression bornée), §6 (liens).

import { encode } from '@msgpack/msgpack'
import { deflateSync } from 'fflate'
import type { Accommodation, DayItinerary } from '@/lib/itinerary-data'
import {
  addDays,
  daysBetween,
  fromDayNumber,
  isIsoDate,
  shiftIsoDateValue,
  splitIsoDateValue,
  toDayNumber,
} from '@/lib/iso-date'
import {
  NOTE_EXCERPT_LENGTH,
  cleanForTemplate,
  isPrivateBookingUrl,
  noteExcerpts,
  sensitiveSpans,
  summarizeTemplateCleaning,
  templateKnownPlaces,
  type SensitiveSpan,
} from '@/lib/template-clean'
import {
  getTemplateTakeUrl,
  getTemplateUrl,
  readIncomingTemplate,
  readTemplatePath,
} from '@/lib/template-links'
import {
  COUNTRY_CODES,
  MAX_SLUG_LENGTH,
  MAX_TEMPLATE_CITIES,
  MAX_TEMPLATE_CITY_LENGTH,
  MAX_TEMPLATE_DAYS,
  MAX_TEMPLATE_DAY_ACTIVITIES,
  TEMPLATE_ID_ALPHABET,
  countrySlug,
  createTemplateId,
  idSuffixedSlug,
  isTemplateId,
  isTemplateSlug,
  slugify,
  suffixedSlug,
  templateCities,
  templateSlug,
  tripYear,
  type TemplateOptions,
} from '@/lib/template-model'
import {
  buildTemplateOrigin,
  durationChoice,
  groupDaysByCity,
  looksLikeRestDay,
  retimeTemplate,
  suggestKeptDayIds,
  templateTodo,
} from '@/lib/template-redate'
import {
  parseTemplatePublish,
  parseTemplateUpdate,
} from '@/lib/template-request'
import { normalizeItineraryShape } from '@/lib/template-shape'
import { findStay } from '@/components/day/day-logic'
import {
  compressedBytes,
  day as fixtureDay,
  hotel as fixtureHotel,
} from './helpers/template-fixtures'
import {
  CITY_POOL,
  CODES,
  EMAILS,
  FUZZ_RUNS,
  INVALID_DATES,
  MAX_DAY_NUMBER,
  MIN_DAY_NUMBER,
  PHONES,
  arbitraryJson,
  checkProperty,
  hostileItinerary,
  randomBase64Url,
  randomBytes,
  randomClock,
  randomIsoDate,
  randomItinerary,
  randomNote,
  randomUnicode,
  refIsIsoDate,
  refIsoDate,
  refShiftDeep,
  refShiftValue,
  refToDayNumber,
  type Rng,
} from './helpers/random-itinerary'

// Une propriété peut prendre quelques secondes à 5000 cas.
const TIMEOUT = Math.max(20_000, FUZZ_RUNS * 40)

// ── Outils ────────────────────────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

/** Tous les objets et tableaux d'une structure, pour vérifier qu'aucun n'est partagé. */
function objectsOf(value: unknown, into = new Set<object>()): Set<object> {
  if (value && typeof value === 'object' && !into.has(value)) {
    into.add(value)
    for (const item of Object.values(value)) objectsOf(item, into)
  }
  return into
}

/** Copie où chaque -0 devient 0, comme après un passage par JSON. */
function withoutNegativeZero(value: unknown): unknown {
  if (Object.is(value, -0)) return 0
  if (Array.isArray(value)) return value.map(withoutNegativeZero)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        withoutNegativeZero(item),
      ]),
    )
  }
  return value
}

function expectNoSharedObject(output: unknown, input: unknown): void {
  const inputs = objectsOf(input)
  for (const object of objectsOf(output)) {
    if (inputs.has(object)) {
      throw new Error(
        `objet partagé avec l'entrée : ${JSON.stringify(object).slice(0, 200)}`,
      )
    }
  }
}

function randomOptions(rng: Rng): TemplateOptions {
  return { includeNotes: rng.bool(), includePrices: rng.bool() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ── Forme attendue (`itinerary-data.ts`) ──────────────────────────────────────

type FieldCheck = (value: unknown) => boolean

const isText: FieldCheck = (value) => typeof value === 'string'
const isFinite: FieldCheck = (value) =>
  typeof value === 'number' && Number.isFinite(value)
const isFlag: FieldCheck = (value) => typeof value === 'boolean'
const isTexts: FieldCheck = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const isPair: FieldCheck = (value) =>
  Array.isArray(value) && value.length === 2 && value.every(isFinite)
const oneOf =
  (...allowed: string[]): FieldCheck =>
  (value) =>
    typeof value === 'string' && allowed.includes(value)
const isSource = oneOf('user', 'import', 'ai')
const isPriority = oneOf('must', 'nice', 'optional')
const isBookingStatus = oneOf('planned', 'booked', 'checked-in', 'completed')

interface EntityShape {
  required: Record<string, FieldCheck>
  optional: Record<string, FieldCheck>
}

const ACTIVITY_SHAPE: EntityShape = {
  required: {
    id: isText,
    name: isText,
    type: oneOf('visit', 'transport', 'food', 'experience', 'shopping'),
  },
  optional: {
    description: isText,
    duration: isText,
    coordinates: isPair,
    openAt: isText,
    address: isText,
    bookingUrl: isText,
    reservationRequired: isFlag,
    price: isFinite,
    currency: isText,
    rating: isFinite,
    tags: isTexts,
    status: oneOf('planned', 'done', 'skipped'),
    tips: isText,
    images: isTexts,
    source: isSource,
    priority: isPriority,
  },
}

const TRANSPORT_SHAPE: EntityShape = {
  required: { id: isText, type: oneOf('train', 'car', 'plane', 'bus') },
  optional: {
    from: isText,
    to: isText,
    details: isText,
    departureAddress: isText,
    departureTime: isText,
    arrivalTime: isText,
    duration: isText,
    provider: isText,
    bookingUrl: isText,
    bookingReference: isText,
    price: isFinite,
    currency: isText,
    seat: isText,
    gate: isText,
    terminal: isText,
    status: isBookingStatus,
    notes: isText,
    source: isSource,
    priority: isPriority,
  },
}

const ACCOMMODATION_SHAPE: EntityShape = {
  required: {
    id: isText,
    name: isText,
    address: isText,
    bookingUrl: isText,
    checkIn: isText,
    checkOut: isText,
  },
  optional: {
    images: isTexts,
    price: isFinite,
    currency: isText,
    bookingReference: isText,
    status: isBookingStatus,
    source: isSource,
    priority: isPriority,
  },
}

const DAY_IMAGE_SHAPE: EntityShape = {
  required: { url: isText, caption: isText },
  optional: {},
}

function entityErrors(
  value: unknown,
  shape: EntityShape,
  path: string,
  nested: Record<string, (value: unknown, path: string) => string[]> = {},
): string[] {
  if (!isRecord(value)) return [`${path} : pas un objet`]
  const errors: string[] = []
  for (const [key, check] of Object.entries(shape.required)) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} : manquant`)
    else if (!check(value[key])) errors.push(`${path}.${key} : mal typé`)
  }
  for (const key of Object.keys(value)) {
    if (key in shape.required) continue
    if (key in nested) {
      errors.push(...nested[key](value[key], `${path}.${key}`))
    } else if (!(key in shape.optional)) {
      errors.push(`${path}.${key} : clé inconnue du type`)
    } else if (value[key] === undefined) {
      errors.push(`${path}.${key} : undefined`)
    } else if (!shape.optional[key](value[key])) {
      errors.push(`${path}.${key} : mal typé`)
    }
  }
  return errors
}

const DAY_SHAPE: EntityShape = {
  required: {
    id: isText,
    date: isText,
    dayNumber: isFinite,
    city: isText,
    title: isText,
    activities: Array.isArray,
    coordinates: isPair,
  },
  optional: {
    highlights: isTexts,
    foodRecommendations: isTexts,
    walkingDistance: isText,
    notes: isText,
    packingTips: isTexts,
    dayType: isText,
    tips: isTexts,
    source: isSource,
    priority: isPriority,
  },
}

/** Tout ce qui s'écarte des types de `itinerary-data.ts`, chemin compris. */
function shapeErrors(itinerary: unknown): string[] {
  if (!Array.isArray(itinerary)) return ['pas une liste de journées']
  return itinerary.flatMap((day, index) => {
    const path = `[${index}]`
    const errors = entityErrors(day, DAY_SHAPE, path, {
      accommodation: (value, at) =>
        entityErrors(value, ACCOMMODATION_SHAPE, at),
      transport: (value, at) => entityErrors(value, TRANSPORT_SHAPE, at),
      images: (value, at) =>
        Array.isArray(value)
          ? value.flatMap((image, k) =>
              entityErrors(image, DAY_IMAGE_SHAPE, `${at}[${k}]`),
            )
          : [`${at} : pas une liste`],
    })
    if (isRecord(day) && Array.isArray(day.activities)) {
      day.activities.forEach((activity, k) =>
        errors.push(
          ...entityErrors(activity, ACTIVITY_SHAPE, `${path}.activities[${k}]`),
        ),
      )
    }
    return errors
  })
}

function expectShape(itinerary: unknown): void {
  const errors = shapeErrors(itinerary)
  if (errors.length > 0) throw new Error(errors.slice(0, 5).join(' ; '))
}

/**
 * Entrée typée, clés inconnues tolérées (un import JSON en laisse passer) :
 * c'est ce qu'un voyage du téléphone peut contenir. Sert aussi à écarter,
 * pendant la minimisation, les candidats qui ne sont plus des voyages.
 */
function isTypedItinerary(value: unknown): value is DayItinerary[] {
  return (
    Array.isArray(value) &&
    shapeErrors(value).every((error) => error.endsWith('clé inconnue du type'))
  )
}

/** Entrée strictement typée, comme un modèle servi par l'API (déjà nettoyé). */
function isStrictItinerary(value: unknown): value is DayItinerary[] {
  return Array.isArray(value) && shapeErrors(value).length === 0
}

// ── Recalage : oracle des villes et des séjours (§3.2) ────────────────────────

/** Sans accents ni casse, la ponctuation ramenée à des espaces. */
function refPlaceKey(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
}

/** La ville que nomme un lieu : suite de mots entiers, la plus longue l'emporte. */
function refMatchCity(
  place: string | undefined,
  cities: readonly string[],
): string | null {
  const key = refPlaceKey(place)
  if (!key) return null
  const words = key.split(' ')
  let best: string | null = null
  for (const city of cities) {
    const cityWords = city.split(' ')
    for (let start = 0; start + cityWords.length <= words.length; start++) {
      const same = cityWords.every((word, k) => words[start + k] === word)
      if (same && (best === null || city.length > best.length)) best = city
    }
  }
  return best
}

/** Même hôtel : même nom à la casse et aux espaces près, sinon même id. */
function refStayKey(accommodation: Accommodation): string {
  const name = accommodation.name.toLowerCase().replace(/\s+/g, '')
  return name ? `nom:${name}` : `id:${accommodation.id}`
}

/**
 * Jour (depuis l'époque) où tombait chaque journée chez l'auteur : sa date,
 * ou d'après la première journée datée ; `null` si le voyage n'a aucune date.
 */
function refOldDays(itinerary: readonly DayItinerary[]): (number | null)[] {
  const first = itinerary.findIndex((day) => refIsIsoDate(day.date))
  const origin =
    first === -1 ? null : refToDayNumber(itinerary[first].date) - first
  return itinerary.map((day, index) =>
    refIsIsoDate(day.date)
      ? refToDayNumber(day.date)
      : origin === null
        ? null
        : origin + index,
  )
}

/**
 * Le séjour de chaque nuit, d'après les deux conventions du §3.2.4 : l'hôtel
 * de la journée, ou celui de la veille tant que son `checkOut` n'est pas
 * passé. Renvoie l'hôtel « porteur » et sa clé.
 */
function refStays(
  itinerary: readonly DayItinerary[],
  oldDays: readonly (number | null)[],
): ({ key: string; accommodation: Accommodation } | null)[] {
  const stays: ({ key: string; accommodation: Accommodation } | null)[] = []
  itinerary.forEach((day, index) => {
    if (day.accommodation) {
      stays.push({
        key: refStayKey(day.accommodation),
        accommodation: day.accommodation,
      })
      return
    }
    const previous = index > 0 ? stays[index - 1] : null
    const oldDay = oldDays[index]
    const checkOut = previous
      ? /^([0-9]{4}-[0-9]{2}-[0-9]{2})(T.*| [0-9]{2}:[0-9]{2}.*)?$/.exec(
          previous.accommodation.checkOut,
        )
      : null
    stays.push(
      previous &&
        oldDay !== null &&
        checkOut &&
        refIsIsoDate(checkOut[1]) &&
        oldDay < refToDayNumber(checkOut[1])
        ? previous
        : null,
    )
  })
  return stays
}

interface RetimeCase {
  itinerary: DayItinerary[]
  keptDayIds: string[]
  startDate: string
}

function keptCount(input: RetimeCase): number {
  const kept = new Set(input.keptDayIds)
  return input.itinerary.filter((day) => kept.has(day.id)).length
}

/**
 * Bornes des dates de départ des propriétés générales. Le modèle date de
 * 1990–2090 et ses textes peuvent contenir une date littérale (« 2026-05-10 ») :
 * entre 1000 et 8999, aucun glissement ne sort de 0000–9999. Les bords du
 * calendrier ont leur propre test, plus bas (défaut connu).
 */
const MIN_START = refToDayNumber('1000-01-01')
const MAX_START = refToDayNumber('8999-12-31')

/** Date de départ valide, avec un penchant pour les 29 février, 31 décembre… */
function randomStartDate(rng: Rng): string {
  switch (rng.int(0, 5)) {
    case 0:
      return refIsoDate(MIN_START)
    case 1:
      return refIsoDate(MAX_START - rng.int(0, 40))
    case 2:
      return randomIsoDate(rng, 1000, 8999)
    default:
      return randomIsoDate(rng, 2025, 2030)
  }
}

function retimeCase(rng: Rng): RetimeCase {
  // Ce que l'app reprend : un modèle servi par l'API, donc nettoyé (§5).
  const itinerary = cleanForTemplate(
    randomItinerary(rng, { maxDays: 16 }),
    randomOptions(rng),
  )
  const ids = itinerary.map((day) => day.id)
  let keptDayIds = rng.subset(ids, rng.pick([0.3, 0.6, 0.9, 1]))
  if (keptDayIds.length === 0) keptDayIds = [rng.pick(ids)]
  if (rng.bool(0.15)) keptDayIds.push(`inconnu-${rng.int(1, 9)}`)
  if (rng.bool(0.15)) keptDayIds.push(rng.pick(keptDayIds))
  keptDayIds = rng.shuffle(keptDayIds)
  return { itinerary, keptDayIds, startDate: randomStartDate(rng) }
}

function isValidRetimeCase(input: RetimeCase): boolean {
  if (!isRecord(input) || !isStrictItinerary(input.itinerary)) return false
  if (!Array.isArray(input.keptDayIds) || !refIsIsoDate(input.startDate)) {
    return false
  }
  const start = refToDayNumber(input.startDate)
  return keptCount(input) > 0 && start >= MIN_START && start <= MAX_START
}

interface KeptDay {
  rank: number
  index: number
  day: DayItinerary
  offset: number
}

/** Les journées gardées, leur rang et l'écart dont elles glissent. */
function keptDays(input: RetimeCase): KeptDay[] {
  const kept = new Set(input.keptDayIds)
  const oldDays = refOldDays(input.itinerary)
  const start = refToDayNumber(input.startDate)
  return input.itinerary
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => kept.has(day.id))
    .map(({ day, index }, rank) => {
      const oldDay = oldDays[index]
      return {
        rank,
        index,
        day,
        offset: oldDay === null ? 0 : start + rank - oldDay,
      }
    })
}

function withoutKeys<T extends object>(
  value: T,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  )
}

/** La partie date d'une valeur `AAAA-MM-JJ…`, sinon `null`. */
function datePart(value: string): string | null {
  const match =
    /^([0-9]{4}-[0-9]{2}-[0-9]{2})(T.*| [0-9]{2}:[0-9]{2}.*)?$/.exec(value)
  return match && refIsIsoDate(match[1]) ? match[1] : null
}

function timePart(value: string): string {
  return datePart(value) === null ? value : value.slice(10)
}

// ── Nettoyage (§3.1, spec §5) ─────────────────────────────────────────────────

const ALWAYS_REMOVED = [
  'bookingReference',
  'seat',
  'gate',
  'terminal',
  'status',
] as const

function isHttpImage(url: unknown): boolean {
  return typeof url === 'string' && /^https?:\/\/\S/i.test(url.trim())
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Lettres et chiffres seuls, en minuscules. */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** Le lien contient-il la référence (chemin, requête ou ancre, décodés ou non) ? */
function urlContainsReference(url: string, reference: string): boolean {
  const ref = compact(reference)
  if (ref.length < 4) return false
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return false
  }
  const raw = parsed.pathname + parsed.search + parsed.hash
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Séquence `%` invalide : on garde la forme brute.
  }
  return compact(raw).includes(ref) || compact(decoded).includes(ref)
}

function cleanedErrors(
  input: readonly DayItinerary[],
  output: readonly DayItinerary[],
  options: TemplateOptions,
): string[] {
  const errors = shapeErrors(output)
  const bookingUrlErrors = (
    url: unknown,
    reference: unknown,
    path: string,
    emptyAllowed: boolean,
  ) => {
    if (url === undefined) return
    if (typeof url !== 'string') return
    if (url === '' && emptyAllowed) return
    if (!isHttpUrl(url)) errors.push(`${path}.bookingUrl non http(s) : ${url}`)
    if (
      isPrivateBookingUrl(url, typeof reference === 'string' ? reference : '')
    )
      errors.push(`${path}.bookingUrl privé gardé : ${url}`)
    if (typeof reference === 'string' && urlContainsReference(url, reference))
      errors.push(`${path}.bookingUrl contient la référence : ${url}`)
  }
  output.forEach((day, index) => {
    const source = input[index]
    const path = `[${index}]`
    // Vues non typées des entités, pour chercher des clés qui ne devraient plus y être.
    const asFields = (entity: object | undefined) =>
      entity as Record<string, unknown> | undefined
    const entities: [string, Record<string, unknown> | undefined][] = [
      [path, asFields(day)],
      [`${path}.accommodation`, asFields(day.accommodation)],
      [`${path}.transport`, asFields(day.transport)],
      ...day.activities.map(
        (activity, k) =>
          [`${path}.activities[${k}]`, asFields(activity)] as [
            string,
            Record<string, unknown> | undefined,
          ],
      ),
    ]
    for (const [at, entity] of entities) {
      if (!entity) continue
      for (const key of ALWAYS_REMOVED) {
        if (Object.hasOwn(entity, key)) errors.push(`${at}.${key} gardé`)
      }
      if (!options.includePrices) {
        for (const key of ['price', 'currency']) {
          if (Object.hasOwn(entity, key)) errors.push(`${at}.${key} gardé`)
        }
      }
      if (Array.isArray(entity.images) && entity !== (day as unknown)) {
        if (entity.images.length === 0) errors.push(`${at}.images vide gardé`)
        for (const url of entity.images) {
          if (!isHttpImage(url))
            errors.push(`${at}.images non http(s) : ${url}`)
        }
      }
    }
    if (!options.includeNotes) {
      if (Object.hasOwn(day, 'notes')) errors.push(`${path}.notes gardé`)
      if (day.transport && Object.hasOwn(day.transport, 'notes'))
        errors.push(`${path}.transport.notes gardé`)
    }
    if (day.images) {
      if (day.images.length === 0) errors.push(`${path}.images vide gardé`)
      for (const image of day.images) {
        if (!isHttpImage(image.url))
          errors.push(`${path}.images non http(s) : ${image.url}`)
      }
    }
    bookingUrlErrors(
      day.accommodation?.bookingUrl,
      source.accommodation?.bookingReference,
      `${path}.accommodation`,
      true,
    )
    bookingUrlErrors(
      day.transport?.bookingUrl,
      source.transport?.bookingReference,
      `${path}.transport`,
      false,
    )
    day.activities.forEach((activity, k) =>
      bookingUrlErrors(
        activity.bookingUrl,
        undefined,
        `${path}.activities[${k}]`,
        false,
      ),
    )
  })
  return errors
}

describe('propriétés — cleanForTemplate', () => {
  const generate = (rng: Rng) => ({
    itinerary: randomItinerary(rng),
    options: randomOptions(rng),
  })
  const valid = (input: ReturnType<typeof generate>) =>
    isRecord(input) &&
    isRecord(input.options) &&
    typeof input.options.includeNotes === 'boolean' &&
    typeof input.options.includePrices === 'boolean' &&
    isTypedItinerary(input.itinerary)

  it(
    'ne laisse partir ni donnée privée, ni clé inconnue, ni lien ou image hors http(s)',
    () => {
      checkProperty(
        'nettoyage sûr',
        generate,
        ({ itinerary, options }) => {
          const output = cleanForTemplate(deepFreeze(itinerary), options)
          const errors = cleanedErrors(itinerary, output, options)
          if (errors.length > 0) throw new Error(errors.slice(0, 5).join(' ; '))
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )

  it(
    'est idempotente et ne modifie pas l’entrée',
    () => {
      checkProperty(
        'nettoyage idempotent et pur',
        generate,
        ({ itinerary, options }) => {
          const before = structuredClone(itinerary)
          const once = cleanForTemplate(deepFreeze(itinerary), options)
          expect(itinerary).toEqual(before)
          expect(cleanForTemplate(deepFreeze(once), options)).toStrictEqual(
            once,
          )
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )

  it(
    'conserve ids et ordre des journées, activités, trajets et hébergements',
    () => {
      checkProperty(
        'nettoyage garde les ids',
        generate,
        ({ itinerary, options }) => {
          const output = cleanForTemplate(itinerary, options)
          const ids = (days: readonly DayItinerary[]) =>
            days.map((day) => ({
              id: day.id,
              activities: day.activities.map((activity) => activity.id),
              accommodation: day.accommodation?.id,
              transport: day.transport?.id,
            }))
          expect(ids(output)).toEqual(ids(itinerary))
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )

  it(
    'donne du JSON sans undefined, que le serveur renormalise sans rien changer',
    () => {
      checkProperty(
        'nettoyage sérialisable et déjà normalisé',
        generate,
        ({ itinerary, options }) => {
          const output = cleanForTemplate(itinerary, options)
          expect(JSON.parse(JSON.stringify(output))).toStrictEqual(output)
          expect(normalizeItineraryShape(output)).toStrictEqual(output)
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )

  it(
    'résume exactement ce que le nettoyage retire (écran A2)',
    () => {
      checkProperty(
        'résumé cohérent avec le nettoyage',
        generate,
        ({ itinerary, options }) => {
          const summary = summarizeTemplateCleaning(itinerary, options)
          const output = cleanForTemplate(itinerary, options)
          expect(summary.goes.days).toBe(output.length)
          expect(summary.goes.activities).toBe(
            output.reduce((sum, day) => sum + day.activities.length, 0),
          )
          expect(summary.goes.transports).toBe(
            output.filter((day) => day.transport).length,
          )
          if (options.includeNotes) expect(summary.stays.notes).toBe(0)
          if (options.includePrices) expect(summary.stays.prices).toBe(0)

          // Liens retirés ou vidés : exactement les liens privés comptés.
          const removed = new Set<string>()
          itinerary.forEach((day, index) => {
            const out = output[index]
            const pairs: [unknown, unknown][] = [
              [day.accommodation?.bookingUrl, out.accommodation?.bookingUrl],
              [day.transport?.bookingUrl, out.transport?.bookingUrl],
              ...day.activities.map(
                (activity, k) =>
                  [activity.bookingUrl, out.activities[k].bookingUrl] as [
                    unknown,
                    unknown,
                  ],
              ),
            ]
            for (const [before, after] of pairs) {
              if (
                typeof before === 'string' &&
                before.trim() !== '' &&
                after !== before
              ) {
                removed.add(before.trim())
              }
            }
          })
          expect(summary.stays.privateLinks).toBe(removed.size)
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )
})

// ── Forme des valeurs (§4) ────────────────────────────────────────────────────

describe('propriétés — normalizeItineraryShape', () => {
  it(
    'ne lève jamais, et rend null ou un itinéraire parfaitement typé',
    () => {
      checkProperty('normalisation sûre', hostileItinerary, (value) => {
        const before = structuredClone(value)
        const output = normalizeItineraryShape(deepFreeze(value))
        expect(value).toEqual(before)
        if (output === null) return
        expectShape(output)
        // Le stockage passe par JSON, qui ramène -0 à 0 : seule perte admise.
        expect(JSON.parse(JSON.stringify(output))).toStrictEqual(
          withoutNegativeZero(output),
        )
        expectNoSharedObject(output, value)
      })
    },
    TIMEOUT,
  )

  it(
    'est idempotente',
    () => {
      checkProperty('normalisation idempotente', hostileItinerary, (value) => {
        const once = normalizeItineraryShape(value)
        if (once === null) return
        expect(normalizeItineraryShape(once)).toStrictEqual(once)
      })
    },
    TIMEOUT,
  )

  it(
    'garde un itinéraire bien typé à l’identique, clés inconnues en moins',
    () => {
      checkProperty(
        'normalisation conservatrice',
        (rng) => randomItinerary(rng, { unknownKeys: false }),
        (itinerary) => {
          const output = normalizeItineraryShape(itinerary)
          expect(output).not.toBeNull()
          // Seules les images hors http(s) disparaissent d'un voyage bien typé.
          const withoutImages = (days: unknown) =>
            JSON.parse(JSON.stringify(days), (key, value: unknown) =>
              key === 'images' ? undefined : value,
            ) as unknown
          expect(withoutImages(output)).toEqual(withoutImages(itinerary))
        },
        { shrinkValid: isTypedItinerary },
      )
    },
    TIMEOUT,
  )

  it(
    'suivie du nettoyage, ne lève pas et reste typée (chemin du serveur)',
    () => {
      checkProperty(
        'normaliser puis nettoyer',
        (rng) => ({
          value: hostileItinerary(rng),
          options: randomOptions(rng),
        }),
        ({ value, options }) => {
          const normalized = normalizeItineraryShape(value)
          if (normalized === null) return
          const cleaned = cleanForTemplate(normalized, options)
          expectShape(cleaned)
          expect(cleanForTemplate(cleaned, options)).toStrictEqual(cleaned)
          expect(normalizeItineraryShape(cleaned)).toStrictEqual(cleaned)
        },
      )
    },
    TIMEOUT,
  )
})

// ── Décompression bornée (§5) ─────────────────────────────────────────────────

/** `data` au format exact du téléphone (`compressItinerary`, synchrone ici). */
function phonePayload(value: unknown): string {
  return Buffer.from(deflateSync(encode(value), { level: 9 })).toString(
    'base64url',
  )
}

function garbagePayload(rng: Rng): string {
  switch (rng.int(0, 7)) {
    case 0:
      return randomBase64Url(rng)
    case 1:
      return compressedBytes(randomBytes(rng))
    case 2:
      return compressedBytes(
        encode(arbitraryJson(rng), { ignoreUndefined: rng.bool() }),
      )
    case 3:
      return phonePayload(hostileItinerary(rng))
    case 4: {
      // Payload valide tronqué n'importe où.
      const payload = phonePayload(randomItinerary(rng, { maxDays: 6 }))
      return payload.slice(0, rng.int(1, Math.max(1, payload.length - 1)))
    }
    case 5: {
      // Payload valide dont quelques caractères ont changé.
      const chars = [...phonePayload(randomItinerary(rng, { maxDays: 4 }))]
      for (let flips = rng.int(1, 4); flips > 0; flips--) {
        chars[rng.int(0, chars.length - 1)] = rng.pick([...'AZaz09-_'])
      }
      return chars.join('')
    }
    case 6: {
      // msgpack valide dont des octets ont changé, puis compressé.
      const bytes = encode(randomItinerary(rng, { maxDays: 3 }))
      for (let flips = rng.int(1, 6); flips > 0; flips--) {
        bytes[rng.int(0, bytes.length - 1)] = rng.int(0, 255)
      }
      return compressedBytes(bytes)
    }
    default:
      // msgpack tronqué, puis compressé.
      return compressedBytes(
        encode(randomItinerary(rng, { maxDays: 3 })).slice(0, rng.int(0, 200)),
      )
  }
}

function expectParsed(result: ReturnType<typeof parseTemplateUpdate>): void {
  if (!result.ok) {
    expect([400, 413]).toContain(result.status)
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
    return
  }
  const itinerary = result.data.itinerary
  expect(itinerary.length).toBeGreaterThanOrEqual(1)
  expect(itinerary.length).toBeLessThanOrEqual(MAX_TEMPLATE_DAYS)
  for (const day of itinerary) {
    expect(day.activities.length).toBeLessThanOrEqual(
      MAX_TEMPLATE_DAY_ACTIVITIES,
    )
  }
  expectShape(itinerary)
  expect(normalizeItineraryShape(itinerary)).toStrictEqual(itinerary)
}

describe('propriétés — lecture des écritures (template-request)', () => {
  it(
    'ne lève jamais sur un payload quelconque : 400 ou 413, ou un itinéraire typé',
    () => {
      checkProperty('décodage sûr', garbagePayload, (data) => {
        expectParsed(parseTemplateUpdate({ data }))
        const published = parseTemplatePublish({ data, country: 'JP' })
        if (published.ok) expectShape(published.data.itinerary)
        else expect([400, 413]).toContain(published.status)
      })
    },
    TIMEOUT,
  )

  it(
    'relit à l’identique (une fois normalisé) un voyage compressé par le téléphone',
    () => {
      checkProperty(
        'aller-retour téléphone → serveur',
        (rng) => randomItinerary(rng, { maxDays: 20 }),
        (itinerary) => {
          const result = parseTemplatePublish({
            data: phonePayload(itinerary),
            country: 'FR',
          })
          if (!result.ok) throw new Error(`${result.status} ${result.error}`)
          expect(result.data.itinerary).toStrictEqual(
            normalizeItineraryShape(itinerary),
          )
        },
        { shrinkValid: (value) => isTypedItinerary(value) && value.length > 0 },
      )
    },
    TIMEOUT,
  )
})

// ── Recalage (§3.2) ───────────────────────────────────────────────────────────

describe('propriétés — retimeTemplate', () => {
  it(
    'est déterministe, ne modifie pas le modèle et rend une copie profonde',
    () => {
      checkProperty(
        'recalage pur',
        retimeCase,
        (input) => {
          const before = structuredClone(input)
          const options = {
            startDate: input.startDate,
            keptDayIds: input.keptDayIds,
          }
          const first = retimeTemplate(deepFreeze(input.itinerary), options)
          const second = retimeTemplate(input.itinerary, options)
          expect(second).toStrictEqual(first)
          expect(input).toEqual(before)
          expectNoSharedObject(first, input.itinerary)
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'garde les journées choisies, dans l’ordre du modèle, datées sans trou',
    () => {
      checkProperty(
        'recalage : journées et dates',
        retimeCase,
        (input) => {
          const output = retimeTemplate(input.itinerary, input)
          const kept = keptDays(input)
          expect(output.map((day) => day.id)).toEqual(
            kept.map(({ day }) => day.id),
          )
          const start = refToDayNumber(input.startDate)
          output.forEach((day, rank) => {
            expect(day.date).toBe(refIsoDate(start + rank))
            expect(day.dayNumber).toBe(rank + 1)
          })
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'fait glisser chaque date de la journée du même écart, heures et ids intacts',
    () => {
      checkProperty(
        'recalage : contenu des journées',
        retimeCase,
        (input) => {
          const output = retimeTemplate(input.itinerary, input)
          for (const { rank, day, offset } of keptDays(input)) {
            const out = output[rank]
            const ignored = [
              'id',
              'date',
              'dayNumber',
              'accommodation',
              'transport',
              'activities',
            ]
            expect(withoutKeys(out, ignored)).toEqual(
              refShiftDeep(withoutKeys(day, ignored), offset),
            )
            expect(out.activities).toEqual(
              day.activities.map((activity) => ({
                ...refShiftDeep(activity, offset),
                id: activity.id,
              })),
            )
          }
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'redate chaque séjour sur les nuits gardées, en gardant l’heure d’origine',
    () => {
      checkProperty(
        'recalage : hébergements',
        retimeCase,
        (input) => {
          const output = retimeTemplate(input.itinerary, input)
          const start = refToDayNumber(input.startDate)
          const last = start + output.length - 1
          const stays = refStays(input.itinerary, refOldDays(input.itinerary))
          for (const { rank, index, day, offset } of keptDays(input)) {
            const out = output[rank].accommodation
            if (day.accommodation) expect(out).toBeDefined()
            if (!out) continue
            // L'hébergement vient de la journée, ou de la journée d'arrivée retirée.
            const source = day.accommodation ?? stays[index]?.accommodation
            if (!source) throw new Error('hébergement sorti de nulle part')
            expect(out.id).toBe(source.id)
            expect(withoutKeys(out, ['id', 'checkIn', 'checkOut'])).toEqual(
              withoutKeys(refShiftDeep(source, offset), [
                'id',
                'checkIn',
                'checkOut',
              ]),
            )
            expect(timePart(out.checkIn)).toBe(timePart(source.checkIn))
            expect(timePart(out.checkOut)).toBe(timePart(source.checkOut))
            const checkIn = datePart(out.checkIn)
            const checkOut = datePart(out.checkOut)
            const date = refToDayNumber(output[rank].date)
            if (checkIn !== null) {
              const n = refToDayNumber(checkIn)
              expect(n).toBeGreaterThanOrEqual(start)
              expect(n).toBeLessThanOrEqual(date)
            }
            if (checkOut !== null) {
              const n = refToDayNumber(checkOut)
              expect(n).toBeGreaterThan(date)
              expect(n).toBeLessThanOrEqual(last + 1)
            }
          }
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'ne garde aucun trajet vers ou depuis une ville entièrement retirée',
    () => {
      checkProperty(
        'recalage : trajets',
        retimeCase,
        (input) => {
          const output = retimeTemplate(input.itinerary, input)
          const cities = [
            ...new Set(
              input.itinerary
                .map((day) => refPlaceKey(day.city))
                .filter(Boolean),
            ),
          ]
          const keptCities = new Set(output.map((day) => refPlaceKey(day.city)))
          const removed = (place: string | undefined) => {
            const city = refMatchCity(place, cities)
            return city !== null && !keptCities.has(city)
          }
          for (const { rank, day, offset } of keptDays(input)) {
            const out = output[rank].transport
            const source = day.transport
            if (!source) {
              expect(out).toBeUndefined()
              continue
            }
            if (!out) continue
            expect(out.id).toBe(source.id)
            expect(out.type).toBe(source.type)
            if (removed(out.to))
              throw new Error(`vers une ville retirée : ${out.to}`)
            if (removed(out.from))
              throw new Error(`depuis une ville retirée : ${out.from}`)
            const touched = removed(source.to) || removed(source.from)
            if (!touched) {
              // Intact, à part le glissement des dates.
              expect(out).toEqual({
                ...refShiftDeep(source, offset),
                id: source.id,
              })
              continue
            }
            // Recousu : il ne garde que son id, son type et ses extrémités.
            for (const key of Object.keys(out)) {
              expect([
                'id',
                'type',
                'from',
                'to',
                'source',
                'priority',
              ]).toContain(key)
            }
            const from = refMatchCity(out.from, cities)
            const to = refMatchCity(out.to, cities)
            if (from !== null && to !== null) expect(from).not.toBe(to)
          }
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'lève une erreur en français pour une date invalide ou aucune journée gardée',
    () => {
      checkProperty(
        'recalage : refus',
        (rng) => ({
          ...retimeCase(rng),
          invalid: rng.pick([...INVALID_DATES, randomUnicode(rng, 12)]),
        }),
        (input) => {
          if (refIsIsoDate(input.invalid)) return
          expect(() =>
            retimeTemplate(input.itinerary, {
              ...input,
              startDate: input.invalid,
            }),
          ).toThrow(/Date de départ invalide/)
          expect(() =>
            retimeTemplate(input.itinerary, {
              startDate: input.startDate,
              keptDayIds: ['jamais-vu'],
            }),
          ).toThrow(/Il faut garder au moins une journée/)
        },
      )
    },
    TIMEOUT,
  )
})

// ── Choix des journées (B3 → B4) ──────────────────────────────────────────────

describe('propriétés — groupDaysByCity, suggestKeptDayIds, durationChoice', () => {
  it(
    'donne en B4 les dates que le recalage donnera',
    () => {
      checkProperty(
        'B4 = recalage',
        retimeCase,
        (input) => {
          const groups = groupDaysByCity(
            input.itinerary,
            input.keptDayIds,
            input.startDate,
          )
          const entries = groups.flatMap((group) => group.days)
          expect(entries.map((entry) => entry.id)).toEqual(
            input.itinerary.map((day) => day.id),
          )
          entries.forEach((entry, index) =>
            expect(entry.dayNumber).toBe(index + 1),
          )
          const retimed = retimeTemplate(input.itinerary, input)
          expect(
            entries.filter((entry) => entry.kept).map((entry) => entry.date),
          ).toEqual(retimed.map((day) => day.date))
          for (const group of groups) {
            const kept = group.days.filter((day) => day.kept)
            expect(group.nights).toBe(kept.length)
            expect(group.range).toEqual(
              kept.length > 0
                ? { start: kept[0].date, end: kept[kept.length - 1].date }
                : null,
            )
            const keys = new Set(
              group.days.map((entry) =>
                refPlaceKey(input.itinerary[entry.dayNumber - 1].city),
              ),
            )
            expect(keys.size).toBe(1)
          }
          // Étapes maximales : deux étapes voisines ne sont pas la même ville.
          for (let k = 1; k < groups.length; k++) {
            expect(refPlaceKey(groups[k].city)).not.toBe(
              refPlaceKey(groups[k - 1].city),
            )
          }
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'ne lève jamais en B4, même sans date de départ valide',
    () => {
      checkProperty(
        'B4 sans date',
        (rng) => ({
          itinerary: randomItinerary(rng),
          keptDayIds: rng.bool() ? [] : [`day-${rng.int(1, 5)}`],
          startDate: rng.pick([...INVALID_DATES, randomUnicode(rng, 12)]),
        }),
        ({ itinerary, keptDayIds, startDate }) => {
          const groups = groupDaysByCity(itinerary, keptDayIds, startDate)
          for (const group of groups) {
            expect(group.range).toBeNull()
            for (const day of group.days) expect(day.date).toBeNull()
          }
        },
      )
    },
    TIMEOUT,
  )

  it(
    'propose exactement min(durée, n) journées, jour 1 compris, journées libres d’abord retirées',
    () => {
      checkProperty(
        'sélection par défaut',
        (rng) => {
          const itinerary = randomItinerary(rng, { maxDays: 20 })
          return { itinerary, count: rng.int(1, itinerary.length + 3) }
        },
        ({ itinerary, count }) => {
          const ids = suggestKeptDayIds(itinerary, count)
          expect(ids).toHaveLength(Math.min(count, itinerary.length))
          expect(ids[0]).toBe(itinerary[0].id)
          // Ids distincts dans ces voyages : on retrouve les rangs gardés.
          const keptIndexes = ids.map((id) =>
            itinerary.findIndex((day) => day.id === id),
          )
          for (let k = 1; k < keptIndexes.length; k++) {
            expect(keptIndexes[k]).toBeGreaterThan(keptIndexes[k - 1])
          }
          const dropped = itinerary
            .map((_, index) => index)
            .filter((index) => !keptIndexes.includes(index))
          const restDays = itinerary
            .map((day, index) => ({ day, index }))
            .filter(({ day, index }) => index > 0 && looksLikeRestDay(day))
            .map(({ index }) => index)
          if (dropped.some((index) => !restDays.includes(index))) {
            // On n'a sacrifié une vraie journée qu'une fois les libres parties.
            for (const index of restDays) expect(dropped).toContain(index)
          }
          expect(durationChoice(itinerary.length, ids.length)).toBe(
            count < itinerary.length ? 'shorter' : 'same',
          )
        },
      )
    },
    TIMEOUT,
  )

  it(
    'refuse une durée qui n’est pas un entier ≥ 1, en français',
    () => {
      checkProperty(
        'sélection : refus',
        (rng) => ({
          itinerary: randomItinerary(rng, { maxDays: 4 }),
          count: rng.pick([0, -1, 0.5, 2.5, Number.NaN, -Infinity, Infinity]),
        }),
        ({ itinerary, count }) => {
          expect(() => suggestKeptDayIds(itinerary, count)).toThrow(
            /Il faut garder au moins une journée/,
          )
        },
      )
    },
    TIMEOUT,
  )
})

describe('propriétés — buildTemplateOrigin', () => {
  it(
    'garde une base indépendante du voyage repris, et les ids gardés sans doublon',
    () => {
      checkProperty(
        'origine indépendante',
        retimeCase,
        (input) => {
          const retimed = retimeTemplate(input.itinerary, input)
          const snapshot = structuredClone(retimed)
          const origin = buildTemplateOrigin(
            {
              id: 'k3x9m2abcdefghjk',
              version: 1,
              title: 'Modèle',
              authorName: null,
              tripYear: 2026,
            },
            retimed,
            input,
            1_700_000_000_000,
          )
          expect(origin.base).toEqual(JSON.parse(JSON.stringify(retimed)))
          const wanted = new Set(input.keptDayIds)
          expect(origin.keptDayIds).toEqual([
            ...new Set(
              retimed.map((day) => day.id).filter((id) => wanted.has(id)),
            ),
          ])
          // Retoucher la base (ce que fera la fusion) ne touche pas au voyage.
          for (const object of objectsOf(origin.base)) {
            if (Array.isArray(object)) object.reverse()
            else Reflect.set(object, 'retouché', true)
          }
          expect(retimed).toStrictEqual(snapshot)
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )
})

// ── Slug et identifiants (§2.1) ───────────────────────────────────────────────

function slugInput(rng: Rng) {
  return {
    country: rng.pick(COUNTRY_CODES),
    dayCount: rng.bool(0.8) ? rng.int(1, 30) : rng.int(1, MAX_TEMPLATE_DAYS),
    cities: Array.from({ length: rng.int(0, 12) }, () =>
      rng.bool(0.6)
        ? rng.pick(CITY_POOL)
        : rng.bool(0.8)
          ? randomUnicode(rng, 30)
          : randomUnicode(rng, 4).repeat(rng.int(10, 60)),
    ),
  }
}

/** Entrée de `templateSlug` telle que la produit le store. */
function isSlugInput(value: unknown): value is ReturnType<typeof slugInput> {
  return (
    isRecord(value) &&
    (COUNTRY_CODES as readonly unknown[]).includes(value.country) &&
    Number.isInteger(value.dayCount) &&
    (value.dayCount as number) >= 1 &&
    Array.isArray(value.cities) &&
    value.cities.every((city) => typeof city === 'string')
  )
}

function randomTemplateId(rng: Rng): string {
  return Array.from(
    { length: 16 },
    () => TEMPLATE_ID_ALPHABET[rng.int(0, TEMPLATE_ID_ALPHABET.length - 1)],
  ).join('')
}

const SLUG_CHARS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

describe('propriétés — slug', () => {
  it(
    'templateSlug donne toujours un slug de modèle valide, tête intacte',
    () => {
      checkProperty(
        'slug valide',
        slugInput,
        (input) => {
          const slug = templateSlug(input)
          const head = `${countrySlug(input.country)}-${input.dayCount}-jours`
          expect(isTemplateSlug(slug)).toBe(true)
          expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
          expect(slug).toMatch(SLUG_CHARS)
          expect(slug === head || slug.startsWith(`${head}-`)).toBe(true)
        },
        { shrinkValid: isSlugInput },
      )
    },
    TIMEOUT,
  )

  it(
    'suffixedSlug et idSuffixedSlug restent valides, distincts et gardent la tête',
    () => {
      checkProperty(
        'slugs de repli',
        (rng) => ({
          input: slugInput(rng),
          attempt: rng.int(2, 99),
          id: randomTemplateId(rng),
          length: rng.pick([6, 16]),
        }),
        ({ input, attempt, id, length }) => {
          const slug = templateSlug(input)
          const head = `${countrySlug(input.country)}-${input.dayCount}-jours`
          expect(suffixedSlug(slug, 1)).toBe(slug)
          const variants = [
            [suffixedSlug(slug, attempt), `-${attempt}`],
            [idSuffixedSlug(slug, id, length), `-${id.slice(0, length)}`],
          ] as const
          for (const [variant, suffix] of variants) {
            expect(isTemplateSlug(variant)).toBe(true)
            expect(variant.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
            expect(variant).toMatch(SLUG_CHARS)
            expect(variant.endsWith(suffix)).toBe(true)
            expect(variant.startsWith(`${head}-`)).toBe(true)
            // Un slug coupé à 80 caractères qui finit déjà par `-4` redonne
            // lui-même pour la 4ᵉ tentative : une tentative perdue, sans
            // conséquence (le store finit par l'id entier, unique).
            if (!slug.endsWith(suffix)) expect(variant).not.toBe(slug)
          }
        },
        {
          shrinkValid: (value) =>
            isRecord(value) &&
            isSlugInput(value.input) &&
            Number.isInteger(value.attempt) &&
            (value.attempt as number) >= 2 &&
            typeof value.id === 'string' &&
            isTemplateId(value.id) &&
            (value.length === 6 || value.length === 16),
        },
      )
    },
    TIMEOUT,
  )

  it(
    'slugify est idempotente et ne rend que [a-z0-9-]',
    () => {
      checkProperty(
        'slugify',
        (rng) =>
          rng.bool() ? randomUnicode(rng, 60, true) : rng.pick(CITY_POOL),
        (text) => {
          const slug = slugify(text)
          expect(slug === '' || SLUG_CHARS.test(slug)).toBe(true)
          expect(slugify(slug)).toBe(slug)
        },
      )
    },
    TIMEOUT,
  )

  it('aucun slug de pays ne passe pour un slug de modèle', () => {
    for (const code of COUNTRY_CODES) {
      const slug = countrySlug(code)
      expect(slug).toMatch(SLUG_CHARS)
      expect(isTemplateSlug(slug)).toBe(false)
    }
  })

  it(
    'templateCities borne le nombre et la longueur des villes, sans doublon',
    () => {
      checkProperty(
        'villes de la méta',
        (rng) =>
          rng.bool(0.7)
            ? randomItinerary(rng, { maxDays: 30 })
            : Array.from({ length: rng.int(0, 25) }, (_, index) => ({
                ...randomItinerary(rng, { minDays: 1, maxDays: 1 })[0],
                city: randomUnicode(rng, 4).repeat(rng.int(1, 40)),
                id: `day-${index}`,
              })),
        (itinerary) => {
          const cities = templateCities(itinerary)
          expect(cities.length).toBeLessThanOrEqual(MAX_TEMPLATE_CITIES)
          const keys = cities.map((city) => city.toLocaleLowerCase('fr'))
          expect(new Set(keys).size).toBe(keys.length)
          for (const city of cities) {
            expect(city).toBe(city.trim())
            expect(city).not.toBe('')
            expect([...city].length).toBeLessThanOrEqual(
              MAX_TEMPLATE_CITY_LENGTH,
            )
          }
        },
      )
    },
    TIMEOUT,
  )
})

describe('propriétés — identifiants et liens (§2.1, §6)', () => {
  it('createTemplateId donne toujours un id valide de 16 caractères', () => {
    for (let run = 0; run < FUZZ_RUNS; run++) {
      const id = createTemplateId()
      expect(id).toHaveLength(16)
      expect(isTemplateId(id)).toBe(true)
    }
  })

  it(
    'relit l’id et les options de tout lien qu’elle écrit',
    () => {
      checkProperty(
        'liens aller-retour',
        (rng) => ({
          id: randomTemplateId(rng),
          step: rng.pick(['dates', null, undefined] as const),
          via: rng.pick(['site', 'link', undefined] as const),
          origin: rng.pick([
            'https://app.tripbrain.fr',
            'https://app.tripbrain.fr/',
            'https://preprod.tripbrain.fr//',
            '',
          ]),
        }),
        ({ id, step, via, origin }) => {
          const url = new URL(getTemplateUrl(id), 'https://x.example')
          expect(readTemplatePath(url.pathname)).toBe(id)
          expect(readTemplatePath(`${url.pathname}/`)).toBe(id)
          const take = new URL(
            getTemplateTakeUrl(id, { step, via }, origin),
            'https://x.example',
          )
          expect(take.pathname).toBe('/')
          expect(readIncomingTemplate(take.search)).toEqual({
            templateId: id,
            step: step === 'dates' ? 'dates' : null,
            via: via === 'site' ? 'site' : 'link',
          })
        },
      )
    },
    TIMEOUT,
  )

  it(
    'ne lève jamais sur une adresse quelconque, et ne rend qu’un id valide',
    () => {
      checkProperty(
        'liens hostiles',
        (rng) =>
          rng.pick([
            `?modele=${encodeURIComponent(randomUnicode(rng, 20, true).replace(/[\ud800-\udfff]/g, ''))}`,
            `?modele=${randomTemplateId(rng)}${rng.pick(['', 'x', '%00', '&modele=0'])}`,
            randomUnicode(rng, 40, true),
            `/m/${randomUnicode(rng, 20, true)}`,
            `/m/${randomTemplateId(rng)}${rng.pick(['', '/', '//', '/x'])}`,
          ]),
        (text) => {
          const incoming = readIncomingTemplate(text)
          if (incoming !== null)
            expect(isTemplateId(incoming.templateId)).toBe(true)
          const path = readTemplatePath(text)
          if (path !== null) expect(isTemplateId(path)).toBe(true)
        },
      )
    },
    TIMEOUT,
  )
})

// ── Dates (`iso-date.ts`) ─────────────────────────────────────────────────────

function isoLikeText(rng: Rng): string {
  const digits = (count: number) =>
    Array.from({ length: count }, () => rng.int(0, 9)).join('')
  switch (rng.int(0, 5)) {
    case 0:
      return `${digits(4)}-${digits(2)}-${digits(2)}`
    case 1:
      return `${digits(4)}-${pad(rng.int(0, 13))}-${pad(rng.int(0, 32))}`
    case 2:
      return randomIsoDate(rng, 0, 9999)
    case 3:
      return rng.pick(INVALID_DATES)
    case 4:
      return `${randomIsoDate(rng, 0, 9999)}${rng.pick(['\n', ' ', 'T', 'Z', '\u0000'])}`
    default:
      return randomUnicode(rng, 12)
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date valide et écart qui gardent le résultat entre 0000-01-01 et 9999-12-31. */
function dateAndOffset(rng: Rng): { date: string; offset: number } {
  const date = randomIsoDate(
    rng,
    rng.bool(0.2) ? 0 : 1900,
    rng.bool(0.2) ? 9999 : 2100,
  )
  const day = refToDayNumber(date)
  const offset = rng.bool(0.7)
    ? rng.int(-800, 800)
    : rng.int(MIN_DAY_NUMBER - day, MAX_DAY_NUMBER - day)
  const bounded = Math.min(
    Math.max(offset, MIN_DAY_NUMBER - day),
    MAX_DAY_NUMBER - day,
  )
  return { date, offset: bounded }
}

describe('propriétés — iso-date', () => {
  it(
    'isIsoDate dit vrai exactement pour les dates qui existent au calendrier',
    () => {
      checkProperty('isIsoDate = oracle', isoLikeText, (text) => {
        expect(isIsoDate(text)).toBe(refIsIsoDate(text))
      })
    },
    TIMEOUT,
  )

  it(
    'addDays et daysBetween sont inverses, et suivent le calendrier de référence',
    () => {
      checkProperty(
        'addDays / daysBetween',
        dateAndOffset,
        ({ date, offset }) => {
          const moved = addDays(date, offset)
          expect(moved).toBe(refIsoDate(refToDayNumber(date) + offset))
          expect(isIsoDate(moved)).toBe(true)
          expect(daysBetween(date, moved)).toBe(offset)
          expect(addDays(moved, -offset)).toBe(date)
          expect(fromDayNumber(toDayNumber(date))).toBe(date)
        },
      )
    },
    TIMEOUT,
  )

  it(
    'shiftIsoDateValue décale la date, garde l’heure, et s’annule avec l’écart opposé',
    () => {
      checkProperty(
        'shiftIsoDateValue',
        (rng) => {
          const { date, offset } = dateAndOffset(rng)
          const clock = randomClock(rng)
          const value = rng.pick([
            date,
            `${date}T${clock}`,
            `${date}T${clock}:00Z`,
            `${date}T${clock}:00+09:00`,
            `${date} ${clock}`,
            `${date} ${clock} (heure locale)`,
          ])
          return { value, offset }
        },
        ({ value, offset }) => {
          const shifted = shiftIsoDateValue(value, offset)
          expect(shifted).toBe(refShiftValue(value, offset))
          expect(shiftIsoDateValue(shifted, -offset)).toBe(value)
          const parts = splitIsoDateValue(shifted)
          expect(parts).not.toBeNull()
          expect(parts!.date + parts!.time).toBe(shifted)
          expect(parts!.time).toBe(value.slice(10))
        },
      )
    },
    TIMEOUT,
  )

  it(
    'shiftIsoDateValue rend telle quelle toute valeur qui n’est pas une date',
    () => {
      checkProperty(
        'shiftIsoDateValue hors date',
        (rng) => ({
          value: rng.pick([
            randomClock(rng),
            randomUnicode(rng, 20, true),
            ...INVALID_DATES,
          ]),
          offset: rng.int(-1000, 1000),
        }),
        ({ value, offset }) => {
          const expected = refShiftValue(value, offset)
          expect(shiftIsoDateValue(value, offset)).toBe(expected)
        },
      )
    },
    TIMEOUT,
  )
})

// ── Données sensibles des notes (écran A3) ────────────────────────────────────

function expectWellFormedSpans(text: string, spans: readonly SensitiveSpan[]) {
  let previousEnd = 0
  for (const span of spans) {
    expect(Number.isInteger(span.start) && Number.isInteger(span.end)).toBe(
      true,
    )
    expect(span.start).toBeGreaterThanOrEqual(previousEnd)
    expect(span.end).toBeGreaterThan(span.start)
    expect(span.end).toBeLessThanOrEqual(text.length)
    expect(['digits', 'phone', 'email', 'name']).toContain(span.kind)
    previousEnd = span.end
  }
}

function noteText(rng: Rng): string {
  return rng.bool(0.6) ? randomNote(rng) : randomUnicode(rng, 200, true)
}

describe('propriétés — sensitiveSpans et noteExcerpts', () => {
  it(
    'rend des passages triés, sans chevauchement, dans le texte, du bon genre',
    () => {
      checkProperty(
        'passages bien formés',
        (rng) => ({
          text: noteText(rng),
          places: rng.subset(CITY_POOL, 0.2),
        }),
        ({ text, places }) => {
          const spans = sensitiveSpans(text, places)
          expectWellFormedSpans(text, spans)
          for (const span of spans) {
            const slice = text.slice(span.start, span.end)
            if (span.kind === 'digits') expect(slice).toMatch(/^[0-9]{4,}$/)
            if (span.kind === 'email') expect(slice).toContain('@')
            if (span.kind === 'phone') {
              expect(slice).toMatch(/^[+0][0-9 ().\-  ]*$/)
            }
            if (span.kind === 'name') expect(slice).toMatch(/^\p{Lu}/u)
          }
        },
      )
    },
    TIMEOUT,
  )

  it(
    'des lieux connus ne font que retirer des noms, jamais un chiffre ou un contact',
    () => {
      checkProperty(
        'lieux connus',
        (rng) => ({ text: noteText(rng), places: rng.subset(CITY_POOL, 0.4) }),
        ({ text, places }) => {
          const without = sensitiveSpans(text)
          const withPlaces = sensitiveSpans(text, places)
          const notNames = (spans: SensitiveSpan[]) =>
            spans.filter((span) => span.kind !== 'name')
          expect(notNames(withPlaces)).toEqual(notNames(without))
          const names = new Set(
            without
              .filter((span) => span.kind === 'name')
              .map((span) => `${span.start}:${span.end}`),
          )
          for (const span of withPlaces) {
            if (span.kind === 'name') {
              expect(names.has(`${span.start}:${span.end}`)).toBe(true)
            }
          }
        },
      )
    },
    TIMEOUT,
  )

  it(
    'surligne tout e-mail et tout code planté entre deux espaces',
    () => {
      checkProperty(
        'contacts et codes repérés',
        (rng) => {
          const words = randomNote(rng).split(' ')
          const secret = rng.pick([...EMAILS, ...CODES])
          words.splice(rng.int(0, words.length), 0, secret)
          return { text: ` ${words.join(' ')} `, secret }
        },
        ({ text, secret }) => {
          const spans = sensitiveSpans(text)
          const start = text.indexOf(` ${secret} `) + 1
          const digits = /[0-9]{4,}/.exec(secret)
          const [from, to] = secret.includes('@')
            ? [start, start + secret.length]
            : [
                start + (digits?.index ?? 0),
                start + (digits?.index ?? 0) + (digits?.[0].length ?? 0),
              ]
          const covered = spans.some(
            (span) => span.start <= from && span.end >= to,
          )
          if (!covered) {
            throw new Error(
              `« ${secret} » non surligné dans ${JSON.stringify(text)}`,
            )
          }
        },
      )
    },
    TIMEOUT,
  )

  it(
    'les extraits restent sur une ligne, bornés, avec des passages dans le texte',
    () => {
      checkProperty(
        'extraits bien formés',
        (rng) => ({
          itinerary: randomItinerary(rng, { maxDays: 10 }),
          limit: rng.int(-1, 5),
        }),
        ({ itinerary, limit }) => {
          const excerpts = noteExcerpts(itinerary, limit)
          expect(excerpts.length).toBeLessThanOrEqual(Math.max(0, limit))
          const notes = itinerary.flatMap((day) =>
            [day.notes, day.transport?.notes]
              .filter((note): note is string => typeof note === 'string')
              .map((note) => note.trim().replace(/\s/g, ' ')),
          )
          for (const excerpt of excerpts) {
            expect(itinerary.some((day) => day.id === excerpt.dayId)).toBe(true)
            expect(excerpt.text).not.toMatch(/[\n\r\t\u2028]/)
            expect(excerpt.text.length).toBeLessThanOrEqual(
              NOTE_EXCERPT_LENGTH + 2,
            )
            expectWellFormedSpans(excerpt.text, excerpt.spans)
            const body = excerpt.text.replace(/^…/, '').replace(/…$/, '')
            expect(notes.some((note) => note.includes(body))).toBe(true)
          }
        },
        { shrinkValid: (input) => isTypedItinerary(input.itinerary) },
      )
    },
    TIMEOUT,
  )
})

// ── Bornes de `templateKnownPlaces` ───────────────────────────────────────────

describe('propriétés — templateKnownPlaces', () => {
  it(
    'rend des lieux non vides, sans espace autour, sans doublon',
    () => {
      checkProperty(
        'lieux du voyage',
        (rng) => randomItinerary(rng),
        (itinerary) => {
          const places = templateKnownPlaces(itinerary)
          for (const place of places) {
            expect(place).toBe(place.trim())
            expect(place).not.toBe('')
          }
          // Doublon : même lieu à la casse, aux accents et aux apostrophes près.
          const keys = places.map((place) =>
            place
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '')
              .toLowerCase()
              .replace(/[’‘]/g, "'"),
          )
          expect(new Set(keys).size).toBe(keys.length)
        },
        { shrinkValid: isTypedItinerary },
      )
    },
    TIMEOUT,
  )
})

// ── Reste à réserver, année du voyage ─────────────────────────────────────────

describe('propriétés — templateTodo et tripYear', () => {
  it(
    'liste ce qui reste à réserver d’un voyage repris, sans doublon',
    () => {
      checkProperty(
        'reste à réserver',
        retimeCase,
        (input) => {
          const retimed = retimeTemplate(input.itinerary, input)
          const todo = templateTodo(retimed)
          // Le modèle arrive nettoyé : aucune référence, tout est à réserver.
          const hotels = new Map<string, string>()
          for (const day of retimed) {
            const name = day.accommodation?.name.trim()
            if (name && day.accommodation) {
              const key = refStayKey(day.accommodation)
              if (!hotels.has(key)) hotels.set(key, name)
            }
          }
          expect(todo.accommodations).toEqual([...hotels.values()])
          expect(todo.transports).toBe(
            retimed.filter((day) =>
              ['train', 'plane', 'bus'].includes(day.transport?.type ?? ''),
            ).length,
          )
          expect(todo.bookableActivities).toBe(
            retimed
              .flatMap((day) => day.activities)
              .filter((activity) => activity.reservationRequired === true)
              .length,
          )
        },
        { shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'tripYear est l’année de la première date valide, sinon null',
    () => {
      checkProperty(
        'année du voyage',
        (rng) =>
          randomItinerary(rng, { invalidDateRate: rng.pick([0, 0.5, 1]) }),
        (itinerary) => {
          const first = itinerary.find((day) => refIsIsoDate(day.date))
          expect(tripYear(itinerary)).toBe(
            first ? Number(first.date.slice(0, 4)) : null,
          )
        },
      )
    },
    TIMEOUT,
  )
})

// ── Défauts connus ────────────────────────────────────────────────────────────
//
// Propriétés que le code actuel viole (rapport de la campagne de fuzz du
// 3 nov. 2026). Chacune commence par l'exemple minimal trouvé, puis rejoue la
// propriété à graine et nombre de cas figés, pour échouer à coup sûr. Marquées
// `it.fails` : le jour où le défaut est corrigé, le test passe au rouge — il
// suffit alors de remplacer `it.fails` par `it`.

const KNOWN_BUG = { seed: 'tripbrain-modeles', runs: 1000 }

const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

function noteOf(
  itinerary: readonly DayItinerary[],
  dayId: string,
  source: 'day' | 'transport',
): string {
  const day = itinerary.find((candidate) => candidate.id === dayId)
  const note = source === 'day' ? day?.notes : day?.transport?.notes
  return (note ?? '').trim()
}

/**
 * Notes longues de formes réelles où la donnée sensible tombe loin du début :
 * japonais ou chinois (aucune espace), lien de réservation collé avant un
 * code, texte dense en emoji.
 */
function longNote(rng: Rng): string {
  const filler = (length: number, emoji: boolean) => {
    let text = ''
    while (text.length < length) {
      text +=
        emoji && rng.bool(0.3)
          ? rng.pick(['🍣', '🏯', '🙂', '👍🏽', '🇯🇵', '🚄'])
          : rng.pick([
              'ホテルまで',
              '駅の改札を出て',
              '酒店地址',
              '门禁',
              '右に進み',
              '。',
            ])
    }
    return text
  }
  const secret = rng.pick([...CODES, ...PHONES, ...EMAILS])
  switch (rng.int(0, 2)) {
    case 0:
      return `${filler(rng.int(130, 400), rng.bool())} ${secret}`
    case 1:
      return `Voir https://www.example.com/${'a'.repeat(rng.int(120, 300))} code ${secret}`
    default:
      return `${filler(rng.int(150, 400), true)}${rng.pick(['', ' ', '。'])}${secret}`
  }
}

function itineraryWithLongNote(rng: Rng): DayItinerary[] {
  const itinerary = randomItinerary(rng, { maxDays: 3 })
  itinerary[rng.int(0, itinerary.length - 1)].notes = longNote(rng)
  return itinerary
}

function excerptCase(rng: Rng): DayItinerary[] {
  return rng.bool()
    ? itineraryWithLongNote(rng)
    : randomItinerary(rng, { maxDays: 6 })
}

/** Chaque chiffre de `secret` (à sa première place dans `text`) est-il surligné ? */
function digitsCovered(
  text: string,
  secret: string,
  spans: readonly SensitiveSpan[],
): boolean {
  const from = text.indexOf(secret)
  return [...secret].every(
    (char, k) =>
      !/[0-9]/.test(char) ||
      spans.some((span) => span.start <= from + k && from + k < span.end),
  )
}

describe('défauts corrigés (anciens it.fails, gardés en non-régression)', () => {
  it(
    'noteExcerpts : un extrait choisi pour ses données sensibles en montre au moins une',
    () => {
      // Japonais sans espace, puis un numéro : l'extrait montre le début, sans surlignage.
      const cjk = noteExcerpts([
        fixtureDay(1, { notes: `${'駅'.repeat(200)} 0612345678` }),
      ])
      expect(cjk[0].spans.length).toBeGreaterThan(0)
      // Lien de réservation collé avant un code : idem.
      const url = noteExcerpts([
        fixtureDay(1, {
          notes: `Voir https://www.example.com/${'a'.repeat(200)} code 4821`,
        }),
      ])
      expect(url[0].spans.length).toBeGreaterThan(0)

      checkProperty(
        'extrait montre le sensible',
        excerptCase,
        (itinerary) => {
          const places = templateKnownPlaces(itinerary)
          for (const excerpt of noteExcerpts(itinerary, 5)) {
            const note = noteOf(itinerary, excerpt.dayId, excerpt.source)
            if (sensitiveSpans(note, places).length > 0) {
              expect(excerpt.spans.length).toBeGreaterThan(0)
            }
          }
        },
        { ...KNOWN_BUG, shrinkValid: isTypedItinerary },
      )
    },
    TIMEOUT,
  )

  it(
    'noteExcerpts : un extrait ne coupe jamais un emoji en deux',
    () => {
      const [excerpt] = noteExcerpts([
        fixtureDay(1, { notes: `${'駅'.repeat(159)}🍣${'駅'.repeat(10)}` }),
      ])
      expect(excerpt.text).not.toMatch(LONE_SURROGATE)

      checkProperty(
        'extrait bien formé UTF-16',
        excerptCase,
        (itinerary) => {
          for (const excerpt of noteExcerpts(itinerary, 5)) {
            const note = noteOf(itinerary, excerpt.dayId, excerpt.source)
            if (!LONE_SURROGATE.test(note)) {
              expect(excerpt.text).not.toMatch(LONE_SURROGATE)
            }
          }
        },
        { ...KNOWN_BUG, shrinkValid: isTypedItinerary },
      )
    },
    TIMEOUT,
  )

  it(
    'retimeTemplate : chaque nuit gardée garde son toit, même si l’hôtel est répété plus loin',
    () => {
      // Kyoto, 3 nuits : l'hôtel sur la journée d'arrivée et répété le 3ᵉ soir.
      const ryokan = fixtureHotel({
        id: 'acc-k',
        name: 'Ryokan Yachiyo',
        checkIn: '2026-04-01',
        checkOut: '2026-04-04',
      })
      const template = [
        fixtureDay(1, { city: 'Kyoto', accommodation: ryokan }),
        fixtureDay(2, { city: 'Kyoto' }),
        fixtureDay(3, { city: 'Kyoto', accommodation: ryokan }),
      ]
      // Le repreneur retire la journée d'arrivée.
      const retimed = retimeTemplate(template, {
        startDate: '2026-06-01',
        keptDayIds: ['day-2', 'day-3'],
      })
      expect(findStay(retimed, 0)?.accommodation.id).toBe('acc-k')

      checkProperty(
        'nuits gardées',
        retimeCase,
        (input) => {
          const output = retimeTemplate(input.itinerary, input)
          const before = refStays(input.itinerary, refOldDays(input.itinerary))
          const after = refStays(output, refOldDays(output))
          for (const { rank, index } of keptDays(input)) {
            expect(after[rank]?.key ?? null).toBe(before[index]?.key ?? null)
          }
        },
        { ...KNOWN_BUG, shrinkValid: isValidRetimeCase },
      )
    },
    TIMEOUT,
  )

  it(
    'sensitiveSpans : un numéro qui suit un autre nombre reste surligné',
    () => {
      const twoNumbers = 'Urgences : 06 12 34 56 78 06 98 76 54 32'
      expect(
        digitsCovered(twoNumbers, '06 98 76 54 32', sensitiveSpans(twoNumbers)),
      ).toBe(true)
      const afterDate = 'Arrivée 2026-05-10 06 12 34 56 78 merci'
      expect(
        digitsCovered(afterDate, '06 12 34 56 78', sensitiveSpans(afterDate)),
      ).toBe(true)

      checkProperty(
        'téléphones repérés',
        (rng) => {
          const words = randomNote(rng).split(' ')
          const secret = rng.pick(PHONES)
          words.splice(rng.int(0, words.length), 0, secret)
          return { text: ` ${words.join(' ')} `, secret }
        },
        ({ text, secret }) => {
          if (!digitsCovered(text, ` ${secret} `, sensitiveSpans(text))) {
            throw new Error(`« ${secret} » pas entièrement surligné`)
          }
        },
        {
          ...KNOWN_BUG,
          shrinkValid: (input) =>
            isRecord(input) &&
            typeof input.text === 'string' &&
            (PHONES as readonly unknown[]).includes(input.secret) &&
            input.text.includes(` ${input.secret} `),
        },
      )
    },
    TIMEOUT,
  )

  it(
    'retimeTemplate et groupDaysByCity : au bord du calendrier, erreur en français ou dates valides',
    () => {
      const template = [fixtureDay(1), fixtureDay(2)]
      const options = {
        startDate: '9999-12-31',
        keptDayIds: ['day-1', 'day-2'],
      }
      const dates = (() => {
        try {
          return retimeTemplate(template, options).map((d) => d.date)
        } catch {
          return []
        }
      })()
      for (const date of dates) expect(isIsoDate(date)).toBe(true)
      const groups = groupDaysByCity(
        template,
        options.keptDayIds,
        options.startDate,
      )
      for (const entry of groups.flatMap((group) => group.days)) {
        if (entry.date !== null) expect(isIsoDate(entry.date)).toBe(true)
      }

      checkProperty(
        'bords du calendrier',
        (rng) => {
          const itinerary = cleanForTemplate(
            randomItinerary(rng, { maxDays: 6 }),
            randomOptions(rng),
          )
          return {
            itinerary,
            keptDayIds: itinerary.map((d) => d.id),
            startDate: rng.bool()
              ? refIsoDate(MAX_DAY_NUMBER - rng.int(0, 3))
              : refIsoDate(MIN_DAY_NUMBER + rng.int(0, 3)),
          }
        },
        (input) => {
          let output: DayItinerary[]
          try {
            output = retimeTemplate(input.itinerary, input)
          } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toMatch(/date|journée/i)
            return
          }
          for (const d of output) expect(isIsoDate(d.date)).toBe(true)
        },
        {
          ...KNOWN_BUG,
          shrinkValid: (input) => isStrictItinerary(input.itinerary),
        },
      )
    },
    TIMEOUT,
  )
})
