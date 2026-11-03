// Client de l'API des modèles (`/api/templates/…`), côté navigateur.
//
// Calqué sur `group-sync.ts` : erreurs typées pour les cas que l'écran
// traite à part (modèle absent, retiré, jeton refusé), message du serveur
// pour le reste, et toute réponse validée avant d'atteindre l'app. Une panne
// réseau remonte telle quelle (`TypeError`) : c'est ainsi que les écrans
// reconnaissent le hors-ligne.
//
// Le jeton propriétaire ne voyage que dans `Authorization: Bearer`, jamais
// dans l'URL ni dans le corps.

import type { DayItinerary } from '@/lib/itinerary-data'
import { compressItinerary } from '@/lib/share'
import { cleanForTemplate } from '@/lib/template-clean'
import {
  isTemplateId,
  type PublicTemplate,
  type TemplateOptions,
} from '@/lib/template-model'

const TEMPLATES_URL = '/api/templates'

// ── Erreurs ───────────────────────────────────────────────────────────────────

/** 404 : l'id ne désigne aucun modèle. */
export class TemplateNotFoundError extends Error {
  constructor() {
    super('Ce modèle n’existe pas.')
    this.name = 'TemplateNotFoundError'
  }
}

/** 410 : l'auteur a retiré son modèle (ou il a été retiré après signalement). */
export class TemplateRetiredError extends Error {
  constructor() {
    super('Ce modèle a été retiré.')
    this.name = 'TemplateRetiredError'
  }
}

/** 401 ou 403 : le jeton de cet appareil ne permet pas de modifier le modèle. */
export class TemplateForbiddenError extends Error {
  constructor() {
    super('Cet appareil n’est pas autorisé à modifier ce modèle.')
    this.name = 'TemplateForbiddenError'
  }
}

async function readError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    if (isRecord(body) && typeof body.error === 'string' && body.error) {
      return body.error
    }
  } catch {
    // Pas de JSON exploitable : le message générique suffit.
  }
  return fallback
}

async function failure(response: Response, fallback: string): Promise<Error> {
  if (response.status === 404) return new TemplateNotFoundError()
  if (response.status === 410) return new TemplateRetiredError()
  if (response.status === 401 || response.status === 403) {
    return new TemplateForbiddenError()
  }
  return new Error(await readError(response, fallback))
}

function unreadable(): Error {
  return new Error('Réponse du serveur illisible.')
}

// ── Validation des réponses ───────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** La forme d'une journée, comme pour un partage reçu (`share.ts`). */
function isDay(value: unknown): value is DayItinerary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.date === 'string' &&
    typeof value.dayNumber === 'number' &&
    typeof value.city === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.activities) &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length === 2 &&
    value.coordinates.every((n) => typeof n === 'number')
  )
}

function isItinerary(value: unknown): value is DayItinerary[] {
  return Array.isArray(value) && value.length > 0 && value.every(isDay)
}

function isVersionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** Un modèle tel que l'API le renvoie : rien n'atteint l'app sans ce contrôle. */
export function isPublicTemplate(value: unknown): value is PublicTemplate {
  return (
    isRecord(value) &&
    isTemplateId(value.id) &&
    typeof value.slug === 'string' &&
    value.slug.length > 0 &&
    isVersionNumber(value.version) &&
    typeof value.title === 'string' &&
    (value.authorName === null || typeof value.authorName === 'string') &&
    typeof value.country === 'string' &&
    typeof value.indexable === 'boolean' &&
    typeof value.includesNotes === 'boolean' &&
    typeof value.includesPrices === 'boolean' &&
    typeof value.dayCount === 'number' &&
    isStringArray(value.cities) &&
    (value.tripYear === null || typeof value.tripYear === 'number') &&
    typeof value.publishedAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.listed === 'boolean' &&
    isItinerary(value.itinerary)
  )
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** `{ template }` : la réponse de GET, PUT et PATCH. */
async function readTemplateBody(response: Response): Promise<PublicTemplate> {
  const body = await readBody(response)
  if (!isRecord(body) || !isPublicTemplate(body.template)) throw unreadable()
  return body.template
}

// ── Requêtes ──────────────────────────────────────────────────────────────────

function templateUrl(id: string): string {
  return `${TEMPLATES_URL}/${encodeURIComponent(id)}`
}

function ownerHeaders(ownerToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ownerToken}`,
  }
}

/**
 * Nettoyé ici aussi : ce qui ne doit pas partir ne quitte pas le téléphone,
 * même si le serveur renettoie de toute façon.
 */
async function payload(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions | undefined,
): Promise<string> {
  return compressItinerary(
    options ? cleanForTemplate(itinerary, options) : [...itinerary],
  )
}

export interface TemplatePublishInput {
  /** Vide : le serveur le tire des étapes. */
  title: string
  authorName: string | null
  /** ISO 3166-1 alpha-2. */
  country: string
  options: TemplateOptions
  indexable: boolean
}

export interface TemplatePublication {
  template: PublicTemplate
  /** À ranger dans `StoredTrip.publishedTemplate` : le serveur ne le redonnera jamais. */
  ownerToken: string
}

/** Publie un voyage comme modèle (écran A3). */
export async function publishTemplate(
  itinerary: readonly DayItinerary[],
  input: TemplatePublishInput,
): Promise<TemplatePublication> {
  const response = await fetch(TEMPLATES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      data: await payload(itinerary, input.options),
      title: input.title,
      authorName: input.authorName,
      country: input.country,
      options: input.options,
      indexable: input.indexable,
    }),
  })
  if (!response.ok) {
    throw await failure(response, 'La publication du modèle a échoué. Réessayez.')
  }
  const body = await readBody(response)
  if (
    !isRecord(body) ||
    !isPublicTemplate(body.template) ||
    typeof body.ownerToken !== 'string' ||
    !body.ownerToken
  ) {
    throw unreadable()
  }
  return { template: body.template, ownerToken: body.ownerToken }
}

/** Le modèle dans sa dernière version (aperçu B2, écran A4). */
export async function fetchTemplate(id: string): Promise<PublicTemplate> {
  if (!isTemplateId(id)) throw new TemplateNotFoundError()
  const response = await fetch(templateUrl(id), { cache: 'no-store' })
  if (!response.ok) {
    throw await failure(response, 'Lecture du modèle impossible. Réessayez.')
  }
  return readTemplateBody(response)
}

export interface TemplateVersion {
  version: number
  itinerary: DayItinerary[]
}

/** Une version précise : la base de fusion de la V1.1. */
export async function fetchTemplateVersion(
  id: string,
  version: number,
): Promise<TemplateVersion> {
  if (!isTemplateId(id) || !isVersionNumber(version)) {
    throw new TemplateNotFoundError()
  }
  const response = await fetch(`${templateUrl(id)}/v/${version}`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw await failure(response, 'Lecture du modèle impossible. Réessayez.')
  }
  const body = await readBody(response)
  if (
    !isRecord(body) ||
    !isVersionNumber(body.version) ||
    !isItinerary(body.itinerary)
  ) {
    throw unreadable()
  }
  return { version: body.version, itinerary: body.itinerary }
}

export interface TemplateUpdateInput {
  /** Absent : le titre publié est gardé. */
  title?: string
  /** Absent : les réglages publiés sont gardés (le serveur nettoie avec eux). */
  options?: TemplateOptions
}

/** « Mettre le modèle à jour » : une nouvelle version, sans prévenir personne. */
export async function updateTemplate(
  id: string,
  ownerToken: string,
  itinerary: readonly DayItinerary[],
  input: TemplateUpdateInput = {},
): Promise<PublicTemplate> {
  if (!isTemplateId(id)) throw new TemplateNotFoundError()
  const response = await fetch(templateUrl(id), {
    method: 'PUT',
    headers: ownerHeaders(ownerToken),
    cache: 'no-store',
    body: JSON.stringify({
      data: await payload(itinerary, input.options),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.options ? { options: input.options } : {}),
    }),
  })
  if (!response.ok) {
    throw await failure(response, 'La mise à jour du modèle a échoué. Réessayez.')
  }
  return readTemplateBody(response)
}

export interface TemplatePatchInput {
  indexable?: boolean
  /** `null` efface le prénom. */
  authorName?: string | null
}

/** Visibilité ou prénom, sans nouvelle version du contenu. */
export async function patchTemplate(
  id: string,
  ownerToken: string,
  patch: TemplatePatchInput,
): Promise<PublicTemplate> {
  if (!isTemplateId(id)) throw new TemplateNotFoundError()
  const response = await fetch(templateUrl(id), {
    method: 'PATCH',
    headers: ownerHeaders(ownerToken),
    cache: 'no-store',
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    throw await failure(response, 'La mise à jour du modèle a échoué. Réessayez.')
  }
  return readTemplateBody(response)
}

/** « Retirer le modèle ». Retirer un modèle déjà retiré réussit aussi. */
export async function retireTemplate(
  id: string,
  ownerToken: string,
): Promise<void> {
  if (!isTemplateId(id)) throw new TemplateNotFoundError()
  const response = await fetch(templateUrl(id), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ownerToken}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw await failure(response, 'Le retrait du modèle a échoué. Réessayez.')
  }
}
