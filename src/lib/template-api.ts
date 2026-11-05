// Client de l'API des modèles (`/api/templates/…`), côté navigateur.
//
// Calqué sur `group-sync.ts` : erreurs typées pour les cas que l'écran
// traite à part (modèle absent, retiré, jeton refusé, trop volumineux, service
// indisponible, demande refusée), message du serveur pour le reste, et toute
// réponse validée avant d'atteindre l'app. Une panne réseau remonte telle
// quelle (`TypeError`) : c'est ainsi que les écrans reconnaissent le
// hors-ligne. La mesure tire sa cause de la classe de l'erreur
// (`templateFailureReason`, `templateTakeFailureReason`), jamais du message.
//
// Le jeton propriétaire ne voyage que dans `Authorization: Bearer`, jamais
// dans l'URL ni dans le corps. Pour publier, le téléphone le tire lui-même
// (`createOwnerTokenForClient`) et le range avant l'envoi : une publication
// dont la réponse s'est perdue se rejoue avec lui sans créer de doublon.

import type { DayItinerary } from '@/lib/itinerary-data'
import { compressItinerary } from '@/lib/share'
import { cleanForTemplate } from '@/lib/template-clean'
import {
  isTemplateId,
  unmatchedPrivateStays,
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

/** 413 : l'itinéraire dépasse ce que le serveur accepte. Message du serveur. */
export class TemplateTooLargeError extends Error {
  readonly status = 413

  constructor(message = TOO_LARGE) {
    super(message)
    this.name = 'TemplateTooLargeError'
  }
}

/**
 * Le serveur ne peut pas traiter la demande maintenant, et la même demande,
 * rejouée plus tard, aboutira. Message du serveur. Statuts :
 * - 503 : publication non configurée, ou modèle sorti de la liste publique
 *   de tripbrain.fr sans que celle-ci ait suivi (retrait, masquage, passage à
 *   une journée : la modification est faite, rejouer la termine), ou retrait
 *   dont le contenu n'a pas pu être effacé, ou mise à jour dont les versions
 *   précédentes n'ont pas pu l'être (rejouer les efface) ;
 * - 429 : trop de tentatives ;
 * - 502, 504 : la plateforme n'a pas obtenu de réponse du serveur.
 */
export class TemplateUnavailableError extends Error {
  readonly status: number

  constructor(message = UNAVAILABLE, status = 503) {
    super(message)
    this.name = 'TemplateUnavailableError'
    this.status = status
  }
}

/** 400 : demande refusée telle quelle (itinéraire illisible, pays…). Message du serveur. */
export class TemplateInvalidError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'TemplateInvalidError'
  }
}

/**
 * Refusée avant l'envoi : une clé de `privateStays` ne désigne plus aucun
 * hébergement du voyage. Un hébergement masqué a été renommé (sa clé suit
 * son nom) ou retiré : envoyer l'ancienne liste publierait son adresse.
 * L'écran rouvre le choix de A2 (`checkPrivateStays`), puis renvoie la
 * liste confirmée. `unmatched` reste sur le téléphone.
 */
export class TemplatePrivateStaysChangedError extends TemplateInvalidError {
  readonly unmatched: string[]

  constructor(unmatched: string[]) {
    super(
      'Un hébergement masqué a changé de nom ou n’est plus dans le voyage : choisis de nouveau ceux à masquer.',
    )
    this.name = 'TemplatePrivateStaysChangedError'
    this.unmatched = unmatched
  }
}

// Pas de « code » ni d'« expir » : `analytics/metrics.ts` classe d'autres
// échecs d'après ces sous-chaînes.
const TOO_LARGE = 'Itinéraire trop volumineux pour être publié.'
const UNAVAILABLE = 'Les modèles sont indisponibles pour le moment. Réessaie.'

/** Statuts où rejouer la même demande plus tard aboutira. */
const UNAVAILABLE_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504])

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
  const { status } = response
  if (status === 404) return new TemplateNotFoundError()
  if (status === 410) return new TemplateRetiredError()
  if (status === 401 || status === 403) return new TemplateForbiddenError()
  // Une limite de la plateforme (corps trop lourd, délai dépassé) répond sans
  // notre JSON : le message par défaut dit alors la bonne chose.
  if (status === 413) {
    return new TemplateTooLargeError(await readError(response, TOO_LARGE))
  }
  if (UNAVAILABLE_STATUSES.has(status)) {
    return new TemplateUnavailableError(
      await readError(response, UNAVAILABLE),
      status,
    )
  }
  if (status === 400) {
    return new TemplateInvalidError(await readError(response, fallback))
  }
  return new Error(await readError(response, fallback))
}

/** Cause d'un échec de publication ou de mise à jour (`template_publish_failed`). */
export type TemplatePublishFailureReason =
  | 'too_large'
  | 'unavailable'
  | 'network_error'
  | 'invalid'
  | 'unknown'

/**
 * La cause d'un échec de `publishTemplate` ou `updateTemplate`, d'après la
 * classe de l'erreur. `network_error` : `fetch` n'a pas abouti (`TypeError`).
 */
export function templateFailureReason(
  error: unknown,
): TemplatePublishFailureReason {
  if (error instanceof TemplateTooLargeError) return 'too_large'
  if (error instanceof TemplateUnavailableError) return 'unavailable'
  if (error instanceof TemplateInvalidError) return 'invalid'
  if (error instanceof TypeError) return 'network_error'
  return 'unknown'
}

/** Cause d'un échec de lecture du modèle à reprendre (`template_take_failed`). */
export type TemplateTakeFailureReason =
  | 'not_found'
  | 'retired'
  | 'network_error'
  | 'unknown'

/** La cause d'un échec de `fetchTemplate`, d'après la classe de l'erreur. */
export function templateTakeFailureReason(
  error: unknown,
): TemplateTakeFailureReason {
  if (error instanceof TemplateNotFoundError) return 'not_found'
  if (error instanceof TemplateRetiredError) return 'retired'
  if (error instanceof TypeError) return 'network_error'
  return 'unknown'
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
 * Nettoyé ici aussi, toujours : ce qui ne doit pas partir ne quitte pas le
 * téléphone, même si le serveur renettoie de toute façon.
 */
async function payload(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
): Promise<string> {
  return compressItinerary(cleanForTemplate(itinerary, options))
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
  /**
   * À ranger dans `StoredTrip.publishedTemplate`. Celui de
   * `TemplatePublishOptions.ownerToken` quand il est donné ; sinon tiré par
   * le serveur, qui ne le redonnera jamais.
   */
  ownerToken: string
  /**
   * `false` : un envoi précédent avec le même jeton avait déjà publié ce
   * modèle (réponse perdue, double appui), rendu tel qu'il est en ligne.
   */
  created: boolean
}

export interface TemplatePublishOptions {
  /**
   * Jeton tiré par `createOwnerTokenForClient`, rangé sur le voyage **avant**
   * l'envoi et réutilisé à chaque nouvel essai de la même publication : le
   * serveur rend alors le modèle déjà publié au lieu d'en créer un second.
   * Absent : le serveur tire le jeton, et rejouer publie un doublon.
   */
  ownerToken?: string
}

/** 32 octets = 256 bits, comme le jeton tiré par le serveur. */
const OWNER_TOKEN_BYTES = 32

/**
 * Nouveau jeton propriétaire, tiré sur le téléphone : 32 octets de
 * `crypto.getRandomValues`, en base64url sans remplissage (43 caractères),
 * le format que le serveur attend. Un par publication : à ranger avant
 * `publishTemplate`, à oublier une fois le modèle retiré.
 */
export function createOwnerTokenForClient(): string {
  const bytes = new Uint8Array(OWNER_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Publie un voyage comme modèle (écran A3). Avec `options.ownerToken`, la
 * même publication rejouée (erreur réseau, `TemplateUnavailableError`, double
 * appui) rend le même modèle : réessayer ne crée jamais de doublon.
 */
export async function publishTemplate(
  itinerary: readonly DayItinerary[],
  input: TemplatePublishInput,
  options: TemplatePublishOptions = {},
): Promise<TemplatePublication> {
  const response = await fetch(TEMPLATES_URL, {
    method: 'POST',
    headers: options.ownerToken
      ? ownerHeaders(options.ownerToken)
      : { 'Content-Type': 'application/json' },
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
    throw await failure(
      response,
      'La publication du modèle a échoué. Réessaie.',
    )
  }
  const body = await readBody(response)
  if (
    !isRecord(body) ||
    !isPublicTemplate(body.template) ||
    typeof body.ownerToken !== 'string' ||
    !body.ownerToken ||
    (options.ownerToken !== undefined && body.ownerToken !== options.ownerToken)
  ) {
    throw unreadable()
  }
  return {
    template: body.template,
    ownerToken: body.ownerToken,
    created: response.status !== 200,
  }
}

/** Le modèle dans sa dernière version (aperçu B2, écran A4). */
export async function fetchTemplate(id: string): Promise<PublicTemplate> {
  if (!isTemplateId(id)) throw new TemplateNotFoundError()
  const response = await fetch(templateUrl(id), { cache: 'no-store' })
  if (!response.ok) {
    throw await failure(response, 'Lecture du modèle impossible. Réessaie.')
  }
  return readTemplateBody(response)
}

export interface TemplateUpdateInput {
  /** Absent : le titre publié est gardé. */
  title?: string
  /**
   * Réglages du modèle : pour garder ceux qui sont publiés, ceux de
   * `StoredTrip.publishedTemplate` —
   * `{ includeNotes: includesNotes, includePrices: includesPrices, privateStays }`.
   *
   * Obligatoires : le téléphone nettoie avec eux avant l'envoi. Sans eux, il
   * faudrait soit tout envoyer (notes, prix et adresses de logements privés
   * que l'auteur a exclus quittent le téléphone), soit tout retirer (le
   * serveur stockerait une version sans les notes ou les prix que l'auteur a
   * choisi de publier). Le serveur réapplique de toute façon les hébergements
   * privés qu'il a gardés si `privateStays` manque ; une liste envoyée, même
   * vide, les remplace.
   */
  options: TemplateOptions
}

/**
 * « Mettre le modèle à jour » : une nouvelle version, sans prévenir personne.
 * Les versions précédentes sont supprimées du serveur ; un repreneur garde la
 * sienne sur son téléphone (`StoredTrip.origin.base`).
 *
 * Une clé de `options.privateStays` qui ne désigne plus aucun hébergement
 * (renommé depuis la publication) bloque l'envoi :
 * `TemplatePrivateStaysChangedError`, sans aucune requête.
 */
export async function updateTemplate(
  id: string,
  ownerToken: string,
  itinerary: readonly DayItinerary[],
  input: TemplateUpdateInput,
): Promise<PublicTemplate> {
  if (!isTemplateId(id)) throw new TemplateNotFoundError()
  const unmatched = unmatchedPrivateStays(
    itinerary,
    input.options.privateStays ?? [],
  )
  if (unmatched.length > 0) {
    throw new TemplatePrivateStaysChangedError(unmatched)
  }
  const response = await fetch(templateUrl(id), {
    method: 'PUT',
    headers: ownerHeaders(ownerToken),
    cache: 'no-store',
    body: JSON.stringify({
      data: await payload(itinerary, input.options),
      ...(input.title !== undefined ? { title: input.title } : {}),
      options: input.options,
    }),
  })
  if (!response.ok) {
    throw await failure(
      response,
      'La mise à jour du modèle a échoué. Réessaie.',
    )
  }
  return readTemplateBody(response)
}

export interface TemplatePatchInput {
  indexable?: boolean
  /** `null` efface le prénom. */
  authorName?: string | null
  /** Nouveau titre public. `null` ou vide : tiré des étapes du modèle. */
  title?: string | null
}

/** Visibilité, prénom ou titre (écran A4), sans nouvelle version du contenu. */
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
    throw await failure(
      response,
      'La mise à jour du modèle a échoué. Réessaie.',
    )
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
    throw await failure(response, 'Le retrait du modèle a échoué. Réessaie.')
  }
}
