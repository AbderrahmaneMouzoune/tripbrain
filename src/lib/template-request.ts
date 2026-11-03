// Requêtes et réponses de l'API des modèles (`/api/templates/…`). Serveur
// uniquement (`node:zlib`).
//
// Les corps d'écriture sont validés ici, avant tout accès au bucket, sur le
// modèle de `group-request.ts`. À la différence des voyages de groupe, le
// serveur décompresse l'itinéraire : il doit le renettoyer, compter ses jours
// et en tirer les villes du slug. Cette décompression est bornée — voir
// `decodeItinerary` —, et chaque valeur décodée est remise à son type
// (`normalizeItineraryShape`).
//
// Aucun message ne contient « code » ni « expir » : `analytics/metrics.ts`
// classe les échecs d'après ces sous-chaînes.

import { inflateRawSync } from 'node:zlib'
import { DecodeError, decode, type DecoderOptions } from '@msgpack/msgpack'
import { isS3ndError } from '@s3nd/core'
import { cleanAuthor } from '@/lib/group-sync'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  DEFAULT_TEMPLATE_OPTIONS,
  MAX_TEMPLATE_DAYS,
  MAX_TEMPLATE_DAY_ACTIVITIES,
  MAX_TEMPLATE_TITLE_LENGTH,
  isCountryCode,
  type CountryCode,
  type TemplateOptions,
} from '@/lib/template-model'
import { normalizeItineraryShape } from '@/lib/template-shape'
import { truncateText } from '@/lib/text-limit'
import {
  isTemplateStoreError,
  type TemplateBucket,
  type TemplateStoreErrorCode,
} from '@/lib/template-store'

/** Itinéraire compressé (base64url) accepté par l'API : la limite du partage. */
export const TEMPLATE_MAX_PAYLOAD_CHARS = 2 * 1024 * 1024

/**
 * Itinéraire décompressé (msgpack), en octets. La limite des 2 Mo ne porte que
 * sur la forme compressée : 2 Mo de zéros deflatés se décompressent en 1,5 Go.
 * Le voyage de démo (20 jours) pèse 48 Ko ; 2 Mio laissent la place à 180
 * jours très remplis.
 *
 * C'est aussi la seule vraie borne du nombre d'objets que crée le décodage
 * msgpack (au moins un octet chacun) : 2 Mio en donnent au plus 2 millions,
 * soit une centaine de Mo le temps d'une requête — parce que la profondeur
 * est bornée elle aussi (`MAX_DECODE_DEPTH`). Sans cette borne, 2 millions de
 * tableaux imbriqués coûtent plus de 300 Mo.
 */
export const TEMPLATE_MAX_INFLATED_BYTES = 2 * 1024 * 1024

/** Une chaîne (note, description…), en octets UTF-8. */
export const TEMPLATE_MAX_STRING_BYTES = 32 * 1024

/**
 * Bornes du décodeur msgpack, vérifiées avant toute allocation. Un tableau
 * peut être la liste des journées : la borne la plus large est celle-là. Le
 * dialecte du partage n'emploie ni binaire ni extension.
 */
const DECODE_LIMITS: DecoderOptions = {
  maxArrayLength: Math.max(MAX_TEMPLATE_DAYS, MAX_TEMPLATE_DAY_ACTIVITIES),
  maxMapLength: 64,
  maxStrLength: TEMPLATE_MAX_STRING_BYTES,
  maxBinLength: 0,
  maxExtLength: 0,
}

/**
 * Imbrication maximale du msgpack décodé. Un voyage en a 5 (journées →
 * journée → activités → activité → étiquettes ou coordonnées). Chaque niveau
 * coûte au décodeur un état de pile en plus d'un tableau ou d'un objet : c'est
 * ainsi que 2 Mio d'imbrication, cachés dans une clé que le nettoyage
 * ignorerait ensuite, gonflaient à 340 Mo de tas.
 */
const MAX_DECODE_DEPTH = 8

/** Corps JSON entier : le payload, plus les réglages et le titre. */
export const TEMPLATE_MAX_BODY_BYTES = TEMPLATE_MAX_PAYLOAD_CHARS + 64 * 1024

/** Index et pages tripbrain.fr : régénérés au plus toutes les heures. */
export const TEMPLATE_LISTING_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=300'

/**
 * Tout le reste. Le modèle lui-même (`/api/templates/<id>`) n'est jamais mis
 * en cache : c'est ce que l'app lit pour reprendre, et un modèle retiré ne
 * doit pas rester repris pendant des minutes. Le site vitrine, lui, ne lit
 * que l'index et les modèles par slug.
 */
export const NO_STORE = 'no-store'

export const TEMPLATE_NOT_CONFIGURED =
  'La publication de modèles n’est pas configurée sur ce serveur.'

const TOO_LARGE = 'Itinéraire trop volumineux pour être publié.'

const UNREADABLE = 'Itinéraire illisible.'

export type ParsedTemplateRequest<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

function accept<T>(data: T): ParsedTemplateRequest<T> {
  return { ok: true, data }
}

function reject<T>(status: number, error: string): ParsedTemplateRequest<T> {
  return { ok: false, status, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ── Corps de requête ──────────────────────────────────────────────────────────

/**
 * Le JSON du corps, borné à `TEMPLATE_MAX_BODY_BYTES` : inutile de lire 50 Mo
 * pour répondre 413. Une taille annoncée trop grande est refusée sans lecture ;
 * sans `Content-Length` (envoi chunked), on compte les octets lus et on coupe
 * dès que le plafond est franchi.
 */
export async function readJsonBody(
  request: Request,
): Promise<ParsedTemplateRequest<unknown>> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > TEMPLATE_MAX_BODY_BYTES) {
    return reject(413, TOO_LARGE)
  }
  if (!request.body) return reject(400, 'Requête illisible.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > TEMPLATE_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        return reject(413, TOO_LARGE)
      }
      chunks.push(value)
    }
    // `TextDecoder` (UTF-8, BOM retiré, caractères invalides remplacés)
    // décode comme `request.json()`.
    return accept(JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))))
  } catch {
    return reject(400, 'Requête illisible.')
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/**
 * Une borne du décodeur msgpack a sauté. La bibliothèque n'a pas de classe
 * d'erreur à part : on reconnaît son message (`Max length exceeded: …`).
 * S'il changeait, le refus tomberait en 400 au lieu de 413 — un test le
 * verrait.
 */
function isDecodeLimitError(error: unknown): boolean {
  return (
    error instanceof DecodeError &&
    error.message.startsWith('Max length exceeded')
  )
}

/**
 * L'imbrication de `bytes` (un msgpack) dépasse-t-elle `maxDepth` ? Un seul
 * passage, sans récursion ni allocation au-delà d'une pile de `maxDepth + 1`
 * compteurs : de quoi refuser avant que le décodeur ne construise quoi que ce
 * soit. `remaining` tient, par niveau ouvert, le nombre de valeurs qu'il reste
 * à lire. Un tampon tronqué fait lever `RangeError` (lecture hors du
 * `DataView`), que l'appelant traduit en 400. Le reste de la validation
 * (octet 0xc1, longueurs, octets en trop) appartient au décodeur.
 */
export function nestingTooDeep(bytes: Uint8Array, maxDepth: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const remaining: number[] = [1]
  let pos = 0
  while (remaining.length > 0) {
    remaining[remaining.length - 1] -= 1
    const head = view.getUint8(pos)
    pos += 1
    let skip = 0
    let children = 0
    if (head <= 0x7f || head >= 0xe0) {
      // fixint positif ou négatif : rien à sauter.
    } else if (head <= 0x8f) {
      children = 2 * (head & 0x0f)
    } else if (head <= 0x9f) {
      children = head & 0x0f
    } else if (head <= 0xbf) {
      skip = head & 0x1f
    } else {
      switch (head) {
        case 0xc0: // nil
        case 0xc2: // false
        case 0xc3: // true
          break
        case 0xc4: // bin 8
        case 0xd9: // str 8
          skip = 1 + view.getUint8(pos)
          break
        case 0xc5: // bin 16
        case 0xda: // str 16
          skip = 2 + view.getUint16(pos)
          break
        case 0xc6: // bin 32
        case 0xdb: // str 32
          skip = 4 + view.getUint32(pos)
          break
        case 0xc7: // ext 8 : longueur, type, données
          skip = 2 + view.getUint8(pos)
          break
        case 0xc8: // ext 16
          skip = 3 + view.getUint16(pos)
          break
        case 0xc9: // ext 32
          skip = 5 + view.getUint32(pos)
          break
        case 0xcc: // uint 8
        case 0xd0: // int 8
          skip = 1
          break
        case 0xcd: // uint 16
        case 0xd1: // int 16
          skip = 2
          break
        case 0xca: // float 32
        case 0xce: // uint 32
        case 0xd2: // int 32
          skip = 4
          break
        case 0xcb: // float 64
        case 0xcf: // uint 64
        case 0xd3: // int 64
          skip = 8
          break
        case 0xd4: // fixext 1 : type, puis données
          skip = 2
          break
        case 0xd5: // fixext 2
          skip = 3
          break
        case 0xd6: // fixext 4
          skip = 5
          break
        case 0xd7: // fixext 8
          skip = 9
          break
        case 0xd8: // fixext 16
          skip = 17
          break
        case 0xdc: // array 16
          skip = 2
          children = view.getUint16(pos)
          break
        case 0xdd: // array 32
          skip = 4
          children = view.getUint32(pos)
          break
        case 0xde: // map 16
          skip = 2
          children = 2 * view.getUint16(pos)
          break
        case 0xdf: // map 32
          skip = 4
          children = 2 * view.getUint32(pos)
          break
        default: // 0xc1, jamais employé : le décodeur le refusera.
          return false
      }
    }
    pos += skip
    if (children > 0) {
      remaining.push(children)
      if (remaining.length - 1 > maxDepth) return true
    } else {
      // Un conteneur vide n'ouvre aucun niveau, comme dans le décodeur.
      while (remaining.length > 0 && remaining[remaining.length - 1] === 0) {
        remaining.pop()
      }
    }
  }
  return false
}

/**
 * Le pendant serveur de `decompressItinerary` (`share.ts`), borné. Celui du
 * navigateur décompresse sans limite : sur une route publique, un envoi de
 * quelques Ko suffirait à épuiser la mémoire de la fonction.
 *
 * `fflate.deflateSync` produit du DEFLATE brut, que `inflateRawSync` relit ;
 * `maxOutputLength` arrête la décompression dès que la borne est franchie,
 * sans allouer le reste.
 */
function decodeItinerary(
  payload: string,
): ParsedTemplateRequest<DayItinerary[]> {
  let packed: Buffer
  try {
    packed = inflateRawSync(Buffer.from(payload, 'base64url'), {
      maxOutputLength: TEMPLATE_MAX_INFLATED_BYTES,
    })
  } catch (error) {
    if (hasErrorCode(error, 'ERR_BUFFER_TOO_LARGE')) {
      return reject(413, TOO_LARGE)
    }
    return reject(400, UNREADABLE)
  }
  let decoded: unknown
  try {
    // La profondeur d'abord : le décodeur, lui, alloue à chaque niveau.
    if (nestingTooDeep(packed, MAX_DECODE_DEPTH)) return reject(413, TOO_LARGE)
    decoded = decode(packed, DECODE_LIMITS)
  } catch (error) {
    if (isDecodeLimitError(error)) return reject(413, TOO_LARGE)
    return reject(400, UNREADABLE)
  }
  // Une journée dont un champ requis est faux fait tout refuser ; ailleurs,
  // une valeur mal typée est retirée (`template-shape.ts`).
  const itinerary = normalizeItineraryShape(decoded)
  if (!itinerary) return reject(400, UNREADABLE)
  return accept(itinerary)
}

/** `data` : l'itinéraire compressé par `compressItinerary`, décompressé ici. */
function readItinerary(
  body: Record<string, unknown>,
): ParsedTemplateRequest<DayItinerary[]> {
  const payload = body.data
  if (typeof payload !== 'string' || payload.length === 0) {
    return reject(400, 'Aucun itinéraire à publier.')
  }
  if (payload.length > TEMPLATE_MAX_PAYLOAD_CHARS) {
    return reject(413, TOO_LARGE)
  }
  const decoded = decodeItinerary(payload)
  if (!decoded.ok) return decoded
  const itinerary = decoded.data
  if (itinerary.length === 0) {
    return reject(400, 'Le modèle doit contenir au moins une journée.')
  }
  // Au-delà, ce n'est plus un voyage à refaire : on refuse avant que le
  // nettoyage, la méta et la page n'aient à porter un tel contenu.
  if (
    itinerary.length > MAX_TEMPLATE_DAYS ||
    itinerary.some((day) => day.activities.length > MAX_TEMPLATE_DAY_ACTIVITIES)
  ) {
    return reject(413, TOO_LARGE)
  }
  return accept(itinerary)
}

/**
 * Titre saisi : absent (`undefined`), effacé (`null`, le store le tire des
 * étapes) ou borné à `MAX_TEMPLATE_TITLE_LENGTH`, coupé sur un caractère
 * entier.
 */
function readTitle(
  value: unknown,
): ParsedTemplateRequest<string | null | undefined> {
  if (value === undefined || value === null) return accept(value)
  if (typeof value !== 'string') return reject(400, 'Titre du modèle invalide.')
  const title = truncateText(
    value.replace(/\s+/g, ' ').trim(),
    MAX_TEMPLATE_TITLE_LENGTH,
  ).trim()
  return accept(title || null)
}

/** Prénom : absent, effacé (`null`) ou nettoyé comme celui d'un groupe. */
function readAuthorName(
  value: unknown,
): ParsedTemplateRequest<string | null | undefined> {
  if (value === undefined || value === null) return accept(value)
  if (typeof value !== 'string') return reject(400, 'Prénom invalide.')
  return accept(cleanAuthor(value))
}

/** Réglages : chaque interrupteur absent prend sa valeur par défaut. */
function readOptions(value: unknown): ParsedTemplateRequest<TemplateOptions> {
  if (value === undefined) return accept({ ...DEFAULT_TEMPLATE_OPTIONS })
  if (!isRecord(value)) return reject(400, 'Réglages du modèle invalides.')
  const {
    includeNotes = DEFAULT_TEMPLATE_OPTIONS.includeNotes,
    includePrices = DEFAULT_TEMPLATE_OPTIONS.includePrices,
  } = value
  if (typeof includeNotes !== 'boolean' || typeof includePrices !== 'boolean') {
    return reject(400, 'Réglages du modèle invalides.')
  }
  return accept({ includeNotes, includePrices })
}

function readIndexable(
  value: unknown,
): ParsedTemplateRequest<boolean | undefined> {
  if (value === undefined || typeof value === 'boolean') return accept(value)
  return reject(400, 'Visibilité du modèle invalide.')
}

// ── Écritures ─────────────────────────────────────────────────────────────────

export interface TemplatePublishRequest {
  itinerary: DayItinerary[]
  /** `null` : le store tire le titre des étapes. */
  title: string | null
  authorName: string | null
  country: CountryCode
  options: TemplateOptions
  indexable: boolean
}

/**
 * `POST /api/templates` :
 * `{ data, country, title?, authorName?, options?, indexable? }`.
 * Par défaut, comme l'écran A3 : notes exclues, prix inclus, modèle visible.
 */
export function parseTemplatePublish(
  body: unknown,
): ParsedTemplateRequest<TemplatePublishRequest> {
  if (!isRecord(body)) return reject(400, 'Requête illisible.')
  const itinerary = readItinerary(body)
  if (!itinerary.ok) return itinerary
  const country = body.country
  if (!isCountryCode(country)) return reject(400, 'Pays du voyage invalide.')
  const title = readTitle(body.title)
  if (!title.ok) return title
  const authorName = readAuthorName(body.authorName)
  if (!authorName.ok) return authorName
  const options = readOptions(body.options)
  if (!options.ok) return options
  const indexable = readIndexable(body.indexable)
  if (!indexable.ok) return indexable
  return accept({
    itinerary: itinerary.data,
    title: title.data ?? null,
    authorName: authorName.data ?? null,
    country,
    options: options.data,
    indexable: indexable.data ?? true,
  })
}

export interface TemplateUpdateRequest {
  itinerary: DayItinerary[]
  /** Absent : titre actuel gardé. `null` : tiré des étapes. */
  title?: string | null
  /** Absent : réglages publiés gardés. */
  options?: TemplateOptions
}

/** `PUT /api/templates/<id>` : `{ data, title?, options? }`. */
export function parseTemplateUpdate(
  body: unknown,
): ParsedTemplateRequest<TemplateUpdateRequest> {
  if (!isRecord(body)) return reject(400, 'Requête illisible.')
  const itinerary = readItinerary(body)
  if (!itinerary.ok) return itinerary
  const title = readTitle(body.title)
  if (!title.ok) return title
  const update: TemplateUpdateRequest = { itinerary: itinerary.data }
  if (title.data !== undefined) update.title = title.data
  if (body.options !== undefined) {
    const options = readOptions(body.options)
    if (!options.ok) return options
    update.options = options.data
  }
  return accept(update)
}

export interface TemplatePatchRequest {
  indexable?: boolean
  /** `null` efface le prénom. */
  authorName?: string | null
  /** `null` (ou un titre vide) : tiré des étapes de la version publiée. */
  title?: string | null
}

/**
 * `PATCH /api/templates/<id>` : `{ indexable?, authorName?, title? }`, au
 * moins un. Le titre est borné comme à la publication (espaces resserrées,
 * `MAX_TEMPLATE_TITLE_LENGTH`, jamais au milieu d'un emoji) : l'écran A4
 * renomme le modèle sans republier son contenu.
 */
export function parseTemplatePatch(
  body: unknown,
): ParsedTemplateRequest<TemplatePatchRequest> {
  if (!isRecord(body)) return reject(400, 'Requête illisible.')
  const indexable = readIndexable(body.indexable)
  if (!indexable.ok) return indexable
  const authorName = readAuthorName(body.authorName)
  if (!authorName.ok) return authorName
  const title = readTitle(body.title)
  if (!title.ok) return title
  const patch: TemplatePatchRequest = {}
  if (indexable.data !== undefined) patch.indexable = indexable.data
  if (authorName.data !== undefined) patch.authorName = authorName.data
  if (title.data !== undefined) patch.title = title.data
  if (Object.keys(patch).length === 0) {
    return reject(400, 'Aucun réglage à modifier.')
  }
  return accept(patch)
}

/** `?page=` de l'index : 0 à 999 999, sans signe ni zéro en tête. */
const INDEX_PAGE = /^(0|[1-9]\d{0,5})$/

/**
 * `GET /api/templates/index?page=<n>` : la page demandée, 0 si le paramètre
 * est absent. Tout autre texte (vide, négatif, décimal…) : 400.
 */
export function parseIndexPage(
  value: string | null,
): ParsedTemplateRequest<number> {
  if (value === null) return accept(0)
  if (!INDEX_PAGE.test(value)) return reject(400, 'Page de l’index invalide.')
  return accept(Number(value))
}

// ── Réponses ──────────────────────────────────────────────────────────────────

export interface TemplateErrorBody {
  error: string
  /** Présent sur un 410, que le client distingue sans lire le message. */
  status?: 'retired'
}

export const RETIRED_BODY: TemplateErrorBody = {
  status: 'retired',
  error: 'Ce modèle a été retiré.',
}

const STORE_STATUS: Record<TemplateStoreErrorCode, number> = {
  missing: 404,
  retired: 410,
  forbidden: 403,
  conflict: 409,
  invalid: 400,
  // Un retrait qui n'a pas atteint l'index : l'écriture est faite, il reste à
  // la rejouer. 503 dit au client d'échouer et à l'auteur de réessayer.
  index: 503,
  // Un retrait, ou une mise à jour, dont les versions (anciennes, pour la
  // mise à jour) n'ont pas été supprimées : de même, rejoué, il les supprime.
  versions: 503,
}

/**
 * Statut et corps d'un échec. Les refus prévus (store, s3nd) gardent leur
 * sens ; tout le reste devient un 500 avec `fallback`.
 */
export function templateErrorReply(
  error: unknown,
  fallback: string,
): { status: number; body: TemplateErrorBody } {
  if (isTemplateStoreError(error)) {
    const status = STORE_STATUS[error.code]
    return {
      status,
      body: status === 410 ? RETIRED_BODY : { error: error.message },
    }
  }
  if (isS3ndError(error)) {
    // La limite du bucket porte sur le JSON gzippé : un payload sous les 2 Mo
    // peut encore la dépasser.
    if (error.code === 'FILE_TOO_LARGE') {
      return { status: 413, body: { error: TOO_LARGE } }
    }
    if (error.code === 'SNAPSHOT_TOO_NEW') {
      return {
        status: 409,
        body: {
          error:
            'Ce modèle vient d’une version plus récente de TripBrain. Mettez l’application à jour.',
        },
      }
    }
  }
  return { status: 500, body: { error: fallback } }
}

/** Réponse d'échec, jamais mise en cache ; un 500 est journalisé. */
export function templateErrorResponse(
  error: unknown,
  fallback: string,
): Response {
  const { status, body } = templateErrorReply(error, fallback)
  if (status >= 500) console.error(fallback, error)
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': NO_STORE },
  })
}

/** Refus d'une requête mal formée (400, 401, 404, 413…). */
export function templateRejection(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': NO_STORE } },
  )
}

export function tooManyTemplateRequests(retryAfter: number): Response {
  return Response.json(
    { error: 'Trop de tentatives. Réessayez dans un instant.' },
    {
      status: 429,
      headers: { 'Cache-Control': NO_STORE, 'Retry-After': String(retryAfter) },
    },
  )
}

/**
 * Le bucket, ou la réponse 503 si R2 n'est pas configuré. Le constructeur est
 * passé en argument pour que ce module ne dépende pas des identifiants R2.
 */
export function openTemplateStore(
  open: () => TemplateBucket,
): TemplateBucket | Response {
  try {
    return open()
  } catch (error) {
    console.error('Configuration des modèles incomplète', error)
    return templateRejection(503, TEMPLATE_NOT_CONFIGURED)
  }
}
