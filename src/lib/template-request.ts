// Requêtes et réponses de l'API des modèles (`/api/templates/…`).
//
// Les corps d'écriture sont validés ici, avant tout accès au bucket, sur le
// modèle de `group-request.ts`. À la différence des voyages de groupe, le
// serveur décompresse l'itinéraire : il doit le renettoyer, compter ses jours
// et en tirer les villes du slug.
//
// Aucun message ne contient « code » ni « expir » : `analytics/metrics.ts`
// classe les échecs d'après ces sous-chaînes.

import { isS3ndError } from '@s3nd/core'
import { cleanAuthor } from '@/lib/group-sync'
import type { DayItinerary } from '@/lib/itinerary-data'
import { decompressItinerary } from '@/lib/share'
import {
  DEFAULT_TEMPLATE_OPTIONS,
  MAX_TEMPLATE_TITLE_LENGTH,
  isCountryCode,
  type CountryCode,
  type TemplateOptions,
} from '@/lib/template-model'
import {
  isTemplateStoreError,
  type TemplateBucket,
  type TemplateStoreErrorCode,
} from '@/lib/template-store'

/** Itinéraire compressé (base64url) accepté par l'API : la limite du partage. */
export const TEMPLATE_MAX_PAYLOAD_CHARS = 2 * 1024 * 1024

/** Corps JSON entier : le payload, plus les réglages et le titre. */
export const TEMPLATE_MAX_BODY_BYTES = TEMPLATE_MAX_PAYLOAD_CHARS + 64 * 1024

/** Lectures publiques d'un modèle : le CDN absorbe la charge. */
export const TEMPLATE_CACHE_CONTROL =
  'public, s-maxage=60, stale-while-revalidate=300'

/** Index et pages tripbrain.fr : régénérés au plus toutes les heures. */
export const TEMPLATE_LISTING_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=300'

export const NO_STORE = 'no-store'

export const TEMPLATE_NOT_CONFIGURED =
  'La publication de modèles n’est pas configurée sur ce serveur.'

const TOO_LARGE = 'Itinéraire trop volumineux pour être publié.'

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
 * Le JSON du corps, refusé d'emblée s'il annonce une taille déraisonnable :
 * inutile de lire 50 Mo pour répondre 413.
 */
export async function readJsonBody(
  request: Request,
): Promise<ParsedTemplateRequest<unknown>> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > TEMPLATE_MAX_BODY_BYTES) {
    return reject(413, TOO_LARGE)
  }
  try {
    return accept(await request.json())
  } catch {
    return reject(400, 'Requête illisible.')
  }
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
  let itinerary: DayItinerary[]
  try {
    itinerary = decompressItinerary(payload)
  } catch {
    return reject(400, 'Itinéraire illisible.')
  }
  if (itinerary.length === 0) {
    return reject(400, 'Le modèle doit contenir au moins une journée.')
  }
  return accept(itinerary)
}

/**
 * Titre saisi : absent (`undefined`), effacé (`null`, le store le tire des
 * étapes) ou borné à `MAX_TEMPLATE_TITLE_LENGTH`.
 */
function readTitle(value: unknown): ParsedTemplateRequest<string | null | undefined> {
  if (value === undefined || value === null) return accept(value)
  if (typeof value !== 'string') return reject(400, 'Titre du modèle invalide.')
  const title = value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEMPLATE_TITLE_LENGTH)
    .trim()
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

function readIndexable(value: unknown): ParsedTemplateRequest<boolean | undefined> {
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
}

/** `PATCH /api/templates/<id>` : `{ indexable?, authorName? }`, au moins un. */
export function parseTemplatePatch(
  body: unknown,
): ParsedTemplateRequest<TemplatePatchRequest> {
  if (!isRecord(body)) return reject(400, 'Requête illisible.')
  const indexable = readIndexable(body.indexable)
  if (!indexable.ok) return indexable
  const authorName = readAuthorName(body.authorName)
  if (!authorName.ok) return authorName
  const patch: TemplatePatchRequest = {}
  if (indexable.data !== undefined) patch.indexable = indexable.data
  if (authorName.data !== undefined) patch.authorName = authorName.data
  if (Object.keys(patch).length === 0) {
    return reject(400, 'Aucun réglage à modifier.')
  }
  return accept(patch)
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
