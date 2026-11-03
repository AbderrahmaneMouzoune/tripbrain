// Stockage des itinéraires modèles, sous `templates/` dans le bucket R2.
//
// Toute la logique vit ici, derrière une interface étroite (`TemplateBucket`) :
// les routes restent minces, et les tests tournent contre un faux bucket en
// mémoire, comme le moteur des voyages de groupe.
//
// Clés (sous le préfixe `templates/` de `template-bucket.ts`) :
//   <id>/meta       TemplateMeta — `ifAbsent` à la création, puis `ifMatch`
//   <id>/v/<n>      { version, title, itinerary } — `ifAbsent`, jamais
//                   réécrit ; seule la version publiée survit à une mise à jour
//   slugs/<slug>    { id } — `ifAbsent`, jamais réutilisé ; un modèle dont la
//                   durée ou les villes changent en prend un nouveau, et ses
//                   anciens slugs continuent de pointer vers lui
//   owners/<empr.>  { id } — `ifAbsent`, réservé avant toute autre écriture
//                   par une publication dont le téléphone a tiré le jeton :
//                   la rejouer retrouve le même modèle (`publishTemplate`)
//   index/<c>       { entries } — modèles listés dont l'id commence par `c`,
//                   boucle `ifMatch` (32 morceaux, voir `templateIndexKey`)
//
// Ordre d'écriture : la version, puis la méta, puis l'index. La méta ne pointe
// donc jamais vers une version absente. Une mise à jour supprime ensuite les
// versions précédentes : la base de fusion de la V1.1 vit sur le téléphone du
// repreneur (`StoredTrip.origin.base`), et une note ou un prix que l'auteur
// retire ne doit pas rester en ligne. Retiré, un modèle ne garde qu'une
// pierre tombale (`RetiredTemplateMeta`), par son auteur comme par l'opérateur
// (`retireTemplateAsOperator`, `scripts/retire-template.ts`). L'index suit toujours la méta
// stockée, relue au moment de l'écrire (`syncIndex`). S'il échoue sur un
// ajout, le modèle manque au sitemap jusqu'à sa prochaine écriture ; sur une
// sortie (masqué, retiré), la requête échoue pour que l'auteur la rejoue. Une
// mise à jour ou un retrait dont les versions n'ont pas pu être supprimées
// échouent de même. Un morceau d'index plein (`FILE_TOO_LARGE`) est journalisé
// sous une alerte dédiée (`TEMPLATE_INDEX_FULL_ALERT`), et
// `resyncTemplateIndex` rattrape ensuite les modèles restés dehors.
//
// Les dates du voyage sont floutées avant tout stockage (`blurTemplateDates`) :
// le modèle d'un voyage à venir ne dit pas quand son auteur sera absent.
//
// Aucune écriture ne passe `expiresIn` : un modèle reste en ligne tant que son
// auteur ne le retire pas.
//
// Conception : `docs/itineraire-modele-technique.md` §4.

import {
  isS3ndError,
  type GetSnapshotOptions,
  type PutSnapshotOptions,
  type Snapshot,
  type SnapshotResult,
} from '@s3nd/core'
import { cleanAuthor } from '@/lib/group-sync'
import type { DayItinerary } from '@/lib/itinerary-data'
import { SHARE_APP } from '@/lib/share-store'
import { cleanForTemplate } from '@/lib/template-clean'
import { blurTemplateDates } from '@/lib/template-dates'
import {
  MAX_TEMPLATE_TITLE_LENGTH,
  TEMPLATE_ID_ALPHABET,
  TEMPLATE_ID_LENGTH,
  createTemplateId,
  idSuffixedSlug,
  isCountryCode,
  isListed,
  isRetiredTemplateMeta,
  isTemplateId,
  isTemplateSlug,
  suffixedSlug,
  templateCities,
  templateSlug,
  toIndexEntry,
  toPublicTemplate,
  tripYear,
  type PublicTemplate,
  type RetiredTemplateMeta,
  type StoredTemplateMeta,
  type TemplateIndexEntry,
  type TemplateMeta,
  type TemplateOptions,
} from '@/lib/template-model'
import { normalizeItineraryShape } from '@/lib/template-shape'
import {
  createOwnerToken,
  hashOwnerToken,
  isOwnerToken,
  isOwnerTokenHash,
  verifyOwnerToken,
} from '@/lib/template-token'
import { truncateText } from '@/lib/text-limit'
import { deriveTripTitle } from '@/lib/trips'

// ── Bucket ────────────────────────────────────────────────────────────────────

/**
 * Ce dont le store a besoin du bucket s3nd, et rien de plus. Un `Bucket` de
 * `@s3nd/core` le satisfait tel quel ; un test lui substitue un faux en
 * mémoire. `getSnapshot` rend `unknown` : tout ce qui sort du bucket est
 * revalidé avant usage.
 */
export interface TemplateBucket {
  putSnapshot(
    key: string,
    data: unknown,
    options?: PutSnapshotOptions,
  ): Promise<SnapshotResult>
  getSnapshot(
    key: string,
    options?: GetSnapshotOptions,
  ): Promise<Snapshot<unknown> | null>
  delete(key: string | string[]): Promise<void>
}

/**
 * Version du format des snapshots de modèle. À incrémenter si leur forme
 * change : une build plus ancienne refusera alors de les lire
 * (`SNAPSHOT_TOO_NEW`) au lieu de les lire de travers.
 */
export const TEMPLATE_SCHEMA_VERSION = 1

/** Enveloppe de chaque écriture. Pas d'`expiresIn` : un modèle n'expire pas. */
export const TEMPLATE_SNAPSHOT_OPTIONS = {
  app: SHARE_APP,
  version: TEMPLATE_SCHEMA_VERSION,
} as const

const READ_OPTIONS: GetSnapshotOptions = { maxVersion: TEMPLATE_SCHEMA_VERSION }

/** Ids tirés avant d'abandonner : 80 bits, une collision trahirait l'aléa. */
const ID_ATTEMPTS = 5
/**
 * Suffixes lisibles essayés : `japon-14-jours-tokyo`, puis `…-2` jusqu'à
 * `…-5`. Au-delà, le suffixe vient de l'id (`…-k3x9m2`, puis l'id entier) :
 * un itinéraire populaire reste publiable, et vingt publications malveillantes
 * ne bloquent plus un slug pour tout le monde. Chaque essai est une écriture.
 */
const SLUG_ATTEMPTS = 5
/** Caractères de l'id dans le premier suffixe de repli : 30 bits. */
const SLUG_ID_SUFFIX_LENGTH = 6
/** Une écriture de méta en conflit relit une fois, puis renonce. */
const META_ATTEMPTS = 2
/**
 * Emplacements de version essayés au-delà de la version publiée. Une mise à
 * jour interrompue entre la version et la méta laisse un `v/<n>` orphelin :
 * la suivante passe à `n + 1` au lieu de buter dessus pour toujours.
 */
const VERSION_SLOTS = 3
/**
 * Emplacements essayés pour la première version d'une publication rejouée
 * avec le même jeton : chaque envoi interrompu entre sa version et sa méta en
 * laisse une, qu'aucune méta ne désigne. Au-delà de 10 envois interrompus
 * d'affilée, la publication répond 409.
 */
const PUBLISH_VERSION_SLOTS = 10
/**
 * Une lecture dont la version disparaît sous une mise à jour (qui supprime
 * les précédentes) relit la méta et suit la nouvelle version, deux fois au
 * plus.
 */
const READ_ATTEMPTS = 3
/** Un morceau d'index est partagé par 1/32 des modèles : de la concurrence possible. */
const INDEX_ATTEMPTS = 5

/** Lignes d'une page de `GET /api/templates/index` (`readIndexPage`). */
export const TEMPLATE_INDEX_PAGE_SIZE = 500

// ── Clés ──────────────────────────────────────────────────────────────────────

/**
 * L'index des modèles listés est découpé en 32 morceaux, un par premier
 * caractère de l'id (`index/0` … `index/z`). Un seul objet partagé par tous
 * finissait par atteindre la taille maximale de s3nd (4 Mio gzippés,
 * ~1 800 entrées forgées) : plus aucun modèle listé n'y entrait. Les ids
 * étant tirés au hasard, personne ne choisit son morceau ; il faut remplir
 * les 32 pour bloquer un modèle donné. Chaque morceau a aussi sa propre
 * boucle `ifMatch` : moins de conflits entre publications simultanées.
 *
 * Ni `index/…` ni `slugs/…` n'ont la forme d'un id (16 caractères) : pas de
 * collision avec `<id>/meta`.
 */
export const TEMPLATE_INDEX_PREFIX = 'index/'

/** Le morceau d'index où figure (ou figurerait) le modèle `id`. */
export function templateIndexKey(id: string): string {
  return `${TEMPLATE_INDEX_PREFIX}${id.charAt(0)}`
}

/** Tous les morceaux de l'index, dans l'ordre de l'alphabet des ids. */
export const TEMPLATE_INDEX_KEYS: readonly string[] = Array.from(
  TEMPLATE_ID_ALPHABET,
  (char) => `${TEMPLATE_INDEX_PREFIX}${char}`,
)

export function isTemplateIndexKey(key: string): boolean {
  return key.startsWith(TEMPLATE_INDEX_PREFIX)
}

/**
 * Étiquette des journaux quand un morceau d'index ne peut plus grandir
 * (`FILE_TOO_LARGE`) : à surveiller. Procédure : `docs/modeles-moderation.md`
 * §5.
 */
export const TEMPLATE_INDEX_FULL_ALERT = 'template_index_full'

export function templateMetaKey(id: string): string {
  return `${id}/meta`
}

export function templateVersionKey(id: string, version: number): string {
  return `${id}/v/${version}`
}

export function templateSlugKey(slug: string): string {
  return `slugs/${slug}`
}

/**
 * Réservation d'une publication par l'empreinte de son jeton (64 caractères
 * hexadécimaux) : `{ id }`. Ni un id (16 caractères) ni `slugs/…`, `index/…`.
 */
export function templateOwnerKey(ownerTokenHash: string): string {
  return `owners/${ownerTokenHash}`
}

// ── Erreurs ───────────────────────────────────────────────────────────────────

export type TemplateStoreErrorCode =
  | 'missing'
  | 'retired'
  | 'forbidden'
  | 'conflict'
  | 'invalid'
  /** Le modèle devait sortir de l'index public, et l'index n'a pas suivi. */
  | 'index'
  /**
   * Retrait : pierre tombale et index en place, mais les versions (le contenu
   * de l'auteur) n'ont pas été supprimées. Mise à jour : la nouvelle version
   * est en ligne, mais les précédentes n'ont pas été supprimées. Rejouée, la
   * requête les supprime.
   */
  | 'versions'

// Pas de « code » ni d'« expir » dans ces messages : `analytics/metrics.ts`
// classe les échecs d'après ces sous-chaînes.
const ERROR_MESSAGES: Record<TemplateStoreErrorCode, string> = {
  missing: 'Ce modèle n’existe pas.',
  retired: 'Ce modèle a été retiré.',
  forbidden: 'Cet appareil n’est pas autorisé à modifier ce modèle.',
  conflict: 'Le modèle a changé entre-temps. Réessayez.',
  invalid: 'Ce modèle est invalide.',
  index:
    'Le modèle n’a pas pu être retiré de la liste publique de tripbrain.fr. Réessayez.',
  versions:
    'Le modèle est retiré, mais son contenu n’a pas pu être effacé. Réessayez.',
}

/** `versions` levé par une mise à jour : le modèle, lui, est à jour. */
const STALE_VERSIONS_MESSAGE =
  'Le modèle est à jour, mais ses versions précédentes n’ont pas pu être effacées. Réessayez.'

/** Refus prévisible du store, que la route traduit en statut HTTP. */
export class TemplateStoreError extends Error {
  readonly code: TemplateStoreErrorCode

  constructor(code: TemplateStoreErrorCode, message = ERROR_MESSAGES[code]) {
    super(message)
    this.name = 'TemplateStoreError'
    this.code = code
  }
}

export function isTemplateStoreError(
  error: unknown,
): error is TemplateStoreError {
  return error instanceof TemplateStoreError
}

function isPreconditionFailure(error: unknown): boolean {
  return isS3ndError(error) && error.code === 'PRECONDITION_FAILED'
}

// ── Lecture défensive de ce qui sort du bucket ────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** Forme minimale d'une journée : le contenu a été nettoyé avant d'être écrit. */
function isStoredDay(value: unknown): value is DayItinerary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.date === 'string' &&
    typeof value.dayNumber === 'number' &&
    typeof value.city === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.activities) &&
    Array.isArray(value.coordinates)
  )
}

/**
 * Méta relue et recopiée champ par champ : une clé inconnue glissée dans
 * l'objet stocké ne ressortira jamais par `toPublicTemplate`.
 */
function parseMeta(value: unknown): StoredTemplateMeta | null {
  if (!isRecord(value)) return null
  return typeof value.retiredAt === 'string'
    ? parseRetiredMeta(value)
    : parseActiveMeta(value)
}

function parseActiveMeta(value: Record<string, unknown>): TemplateMeta | null {
  const {
    id,
    slug,
    version,
    title,
    authorName,
    country,
    indexable,
    includesNotes,
    includesPrices,
    dayCount,
    cities,
    tripYear: year,
    publishedAt,
    updatedAt,
    retiredAt,
    ownerTokenHash,
  } = value
  if (
    !isTemplateId(id) ||
    typeof slug !== 'string' ||
    !isPositiveInteger(version) ||
    typeof title !== 'string' ||
    !isNullableString(authorName) ||
    typeof country !== 'string' ||
    typeof indexable !== 'boolean' ||
    typeof includesNotes !== 'boolean' ||
    typeof includesPrices !== 'boolean' ||
    typeof dayCount !== 'number' ||
    !isStringArray(cities) ||
    !(year === null || typeof year === 'number') ||
    typeof publishedAt !== 'string' ||
    typeof updatedAt !== 'string' ||
    retiredAt !== null ||
    typeof ownerTokenHash !== 'string'
  ) {
    return null
  }
  return {
    id,
    slug,
    version,
    title,
    authorName,
    country,
    indexable,
    includesNotes,
    includesPrices,
    dayCount,
    cities,
    tripYear: year,
    publishedAt,
    updatedAt,
    retiredAt,
    ownerTokenHash,
  }
}

/**
 * Pierre tombale. Une pierre tombale écrite avant `wasListed` est la méta
 * entière, titre, prénom et villes vidés : on en déduit `wasListed` comme on
 * le faisait alors, d'après `indexable` et `dayCount`, et on n'en garde rien
 * d'autre.
 */
function parseRetiredMeta(
  value: Record<string, unknown>,
): RetiredTemplateMeta | null {
  const { id, slug, version, publishedAt, retiredAt, ownerTokenHash } = value
  if (
    !isTemplateId(id) ||
    typeof slug !== 'string' ||
    !isPositiveInteger(version) ||
    typeof publishedAt !== 'string' ||
    typeof retiredAt !== 'string' ||
    typeof ownerTokenHash !== 'string'
  ) {
    return null
  }
  const { wasListed, indexable, dayCount } = value
  let listed: boolean
  if (typeof wasListed === 'boolean') {
    listed = wasListed
  } else if (typeof indexable === 'boolean' && typeof dayCount === 'number') {
    listed = isListed({ indexable, dayCount, retiredAt: null })
  } else {
    return null
  }
  return {
    id,
    slug,
    version,
    publishedAt,
    retiredAt,
    ownerTokenHash,
    wasListed: listed,
  }
}

/**
 * Contenu d'une version stockée. Aucune route ne sert une version précise :
 * seule la version publiée est lue, et son titre est celui de la méta (un
 * PATCH peut le changer sans nouvelle version).
 */
interface TemplateVersionData {
  version: number
  title: string
  itinerary: DayItinerary[]
}

function parseVersion(value: unknown): TemplateVersionData | null {
  if (!isRecord(value)) return null
  const { version, title, itinerary } = value
  if (
    !isPositiveInteger(version) ||
    typeof title !== 'string' ||
    !Array.isArray(itinerary) ||
    !itinerary.every(isStoredDay)
  ) {
    return null
  }
  return { version, title, itinerary }
}

function parseIndexEntry(value: unknown): TemplateIndexEntry | null {
  if (!isRecord(value)) return null
  const { id, slug, title, country, dayCount, cities, updatedAt } = value
  if (
    !isTemplateId(id) ||
    typeof slug !== 'string' ||
    typeof title !== 'string' ||
    typeof country !== 'string' ||
    typeof dayCount !== 'number' ||
    !isStringArray(cities) ||
    typeof updatedAt !== 'string'
  ) {
    return null
  }
  return { id, slug, title, country, dayCount, cities, updatedAt }
}

/**
 * Les lignes d'un morceau d'index, `null` si l'objet n'en a pas la forme :
 * mieux vaut ne pas l'écraser. Une ligne rangée dans un autre morceau que le
 * sien est ignorée : personne ne la tiendrait à jour.
 */
function parseIndexShard(
  value: unknown,
  key: string,
): TemplateIndexEntry[] | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null
  const entries: TemplateIndexEntry[] = []
  for (const candidate of value.entries) {
    const entry = parseIndexEntry(candidate)
    if (entry && templateIndexKey(entry.id) === key) entries.push(entry)
  }
  return entries
}

// ── Lectures internes ─────────────────────────────────────────────────────────

interface StoredMeta {
  meta: StoredTemplateMeta
  etag: string | undefined
}

/** Une méta prête à être remplacée en `ifMatch`. */
interface WritableMeta {
  meta: StoredTemplateMeta
  etag: string
}

async function loadMeta(
  bucket: TemplateBucket,
  id: string,
): Promise<StoredMeta | null> {
  const snapshot = await bucket.getSnapshot(templateMetaKey(id), READ_OPTIONS)
  if (!snapshot) return null
  const meta = parseMeta(snapshot.data)
  // Une méta illisible n'est pas une absence : on ne la fait pas passer pour
  // un 404, que le site vitrine prendrait pour un retrait définitif.
  if (!meta) throw new Error(`Métadonnées illisibles pour le modèle ${id}.`)
  return { meta, etag: snapshot.etag }
}

async function loadVersion(
  bucket: TemplateBucket,
  id: string,
  version: number,
): Promise<TemplateVersionData | null> {
  const snapshot = await bucket.getSnapshot(
    templateVersionKey(id, version),
    READ_OPTIONS,
  )
  if (!snapshot) return null
  const data = parseVersion(snapshot.data)
  if (!data) {
    throw new Error(`Version ${version} illisible pour le modèle ${id}.`)
  }
  return data
}

/** La méta, si `token` est bien le jeton du modèle. */
async function loadVerifiedMeta(
  bucket: TemplateBucket,
  id: string,
  token: string,
): Promise<StoredMeta> {
  if (!isTemplateId(id)) throw new TemplateStoreError('missing')
  const stored = await loadMeta(bucket, id)
  if (!stored) throw new TemplateStoreError('missing')
  if (!verifyOwnerToken(token, stored.meta.ownerTokenHash)) {
    throw new TemplateStoreError('forbidden')
  }
  return stored
}

/**
 * Méta d'un modèle dont l'appelant détient le jeton. Le statut « retiré »
 * reste à la charge de l'appelant : retirer deux fois n'est pas une erreur.
 */
async function loadOwnedMeta(
  bucket: TemplateBucket,
  id: string,
  token: string,
): Promise<WritableMeta> {
  const stored = await loadVerifiedMeta(bucket, id, token)
  // Sans ETag, un `ifMatch` deviendrait une écriture inconditionnelle.
  if (!stored.etag) throw new TemplateStoreError('conflict')
  return { meta: stored.meta, etag: stored.etag }
}

/**
 * Le jeton ouvre-t-il ce modèle, toujours en ligne ? Lève sinon (`missing`,
 * `forbidden`, `retired`). La route PUT l'appelle **avant** de lire le corps :
 * sans le bon jeton, personne ne fait décompresser un itinéraire au serveur.
 * `updateTemplate` revérifie de toute façon, sur la méta qu'il va remplacer.
 */
export async function assertTemplateOwner(
  bucket: TemplateBucket,
  id: string,
  token: string,
): Promise<void> {
  const { meta } = await loadVerifiedMeta(bucket, id, token)
  if (isRetiredTemplateMeta(meta)) throw new TemplateStoreError('retired')
}

/** La version publiée d'un modèle, lue avec la méta qui la désigne. */
type PublishedVersion =
  | { status: 'active'; meta: TemplateMeta; itinerary: DayItinerary[] }
  | { status: 'retired'; tombstone: RetiredTemplateMeta }
  | { status: 'missing' }
  /** Méta en ligne, version absente, et rien ne l'explique : incohérence (§4). */
  | { status: 'broken'; meta: TemplateMeta }

/**
 * L'itinéraire de la version que désigne `meta`. Entre la lecture de la méta
 * et celle-ci, la version a pu disparaître :
 * - une mise à jour l'a remplacée, puis supprimée avec les précédentes : la
 *   méta relue désigne la nouvelle, qu'on lit à sa place ;
 * - un retrait l'a effacée : la méta relue est une pierre tombale, et l'on
 *   répond « retiré » (410) comme si le retrait était passé avant.
 * Une méta relue qui désigne toujours la version absente est une vraie
 * incohérence : `broken`, que l'appelant traite.
 */
async function loadPublished(
  bucket: TemplateBucket,
  meta: TemplateMeta,
): Promise<PublishedVersion> {
  let current = meta
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    const version = await loadVersion(bucket, current.id, current.version)
    if (version) {
      return { status: 'active', meta: current, itinerary: version.itinerary }
    }
    const latest = await loadMeta(bucket, current.id)
    if (!latest) return { status: 'missing' }
    if (isRetiredTemplateMeta(latest.meta)) {
      return { status: 'retired', tombstone: latest.meta }
    }
    if (latest.meta.version === current.version) break
    current = latest.meta
  }
  return { status: 'broken', meta: current }
}

/**
 * Le modèle tel qu'il est publié, pour répondre après une écriture : avec la
 * méta relue si une mise à jour concurrente l'a remplacée. Retiré entre-temps :
 * `retired` (410). Incohérent : erreur serveur.
 */
async function currentTemplate(
  bucket: TemplateBucket,
  meta: TemplateMeta,
): Promise<TemplateWriteResult> {
  const published = await loadPublished(bucket, meta)
  switch (published.status) {
    case 'active':
      return {
        meta: published.meta,
        template: toPublicTemplate(published.meta, published.itinerary),
      }
    case 'retired':
      throw new TemplateStoreError('retired')
    case 'missing':
      throw new TemplateStoreError('missing')
    case 'broken':
      throw new Error(
        `Version ${published.meta.version} absente du modèle ${meta.id}.`,
      )
  }
}

/**
 * Une écriture conditionnelle refusée (412) n'est pas forcément celle d'un
 * autre : si la réponse S3 se perd, le SDK rejoue la requête, et la seconde
 * tentative bute sur la première, qui a abouti. L'objet relu dit lequel des
 * deux cas on tient.
 */
async function slugBelongsTo(
  bucket: TemplateBucket,
  slug: string,
  id: string,
): Promise<boolean> {
  const pointer = await bucket.getSnapshot(templateSlugKey(slug), READ_OPTIONS)
  return pointer !== null && isRecord(pointer.data) && pointer.data.id === id
}

// ── Contenu ───────────────────────────────────────────────────────────────────

interface TemplateContent {
  itinerary: DayItinerary[]
  title: string
  options: TemplateOptions
  dayCount: number
  cities: string[]
  tripYear: number | null
}

/**
 * Titre saisi, espaces resserrées, borné et coupé sur un caractère entier :
 * c'est du texte public, indexé. Vide s'il n'y a rien à garder.
 */
function typedTitle(title: string | null | undefined): string {
  return truncateText(
    (title ?? '').replace(/\s+/g, ' ').trim(),
    MAX_TEMPLATE_TITLE_LENGTH,
  ).trim()
}

/** Titre saisi ; à défaut, les étapes du voyage (« Tokyo et Kyoto »). */
function templateTitle(
  title: string | null | undefined,
  itinerary: DayItinerary[],
): string {
  return (
    typedTitle(title) ||
    truncateText(deriveTripTitle(itinerary), MAX_TEMPLATE_TITLE_LENGTH)
  )
}

/**
 * Le serveur renettoie toujours, avec les réglages qu'il va stocker : le
 * nettoyage fait sur le téléphone sert l'aperçu, il ne garantit rien. Puis il
 * floute les dates (`blurTemplateDates`) : l'aperçu A2 ne montre pas de dates,
 * et le modèle publié ne dit pas quand son auteur part.
 */
function prepareContent(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
  title: string | null | undefined,
): TemplateContent {
  // Chaque valeur à son type d'abord : `cleanForTemplate` choisit les clés,
  // pas ce qu'elles contiennent.
  const shaped = normalizeItineraryShape(itinerary)
  if (!shaped) {
    throw new TemplateStoreError('invalid', 'Itinéraire illisible.')
  }
  const cleaned = blurTemplateDates(cleanForTemplate(shaped, options))
  if (cleaned.length === 0) {
    throw new TemplateStoreError(
      'invalid',
      'Le modèle doit contenir au moins une journée.',
    )
  }
  return {
    itinerary: cleaned,
    title: templateTitle(title, cleaned),
    options,
    dayCount: cleaned.length,
    cities: templateCities(cleaned),
    tripYear: tripYear(cleaned),
  }
}

function versionData(
  version: number,
  content: TemplateContent,
): TemplateVersionData {
  return { version, title: content.title, itinerary: content.itinerary }
}

function optionsOf(meta: TemplateMeta): TemplateOptions {
  return {
    includeNotes: meta.includesNotes,
    includePrices: meta.includesPrices,
  }
}

/** Champs de la méta qui suivent le contenu de la version publiée. */
function contentFields(content: TemplateContent) {
  return {
    title: content.title,
    includesNotes: content.options.includeNotes,
    includesPrices: content.options.includePrices,
    dayCount: content.dayCount,
    cities: content.cities,
    tripYear: content.tripYear,
  }
}

/** Suppression au mieux : un objet orphelin ne coûte presque rien. */
async function discard(bucket: TemplateBucket, keys: string[]): Promise<void> {
  try {
    await bucket.delete(keys)
  } catch (error) {
    console.error('Suppression d’objets de modèle impossible', error)
  }
}

// ── Index ─────────────────────────────────────────────────────────────────────

function sameIndexEntry(a: TemplateIndexEntry, b: TemplateIndexEntry): boolean {
  return (
    a.id === b.id &&
    a.slug === b.slug &&
    a.title === b.title &&
    a.country === b.country &&
    a.dayCount === b.dayCount &&
    a.updatedAt === b.updatedAt &&
    a.cities.length === b.cities.length &&
    a.cities.every((city, index) => city === b.cities[index])
  )
}

/** Plus récent d'abord ; l'id départage, pour un ordre stable. */
function compareIndexEntries(
  a: TemplateIndexEntry,
  b: TemplateIndexEntry,
): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Le modèle a-t-il sa page sur tripbrain.fr ? Jamais une pierre tombale. */
function isListedMeta(meta: StoredTemplateMeta | null): meta is TemplateMeta {
  return meta !== null && !isRetiredTemplateMeta(meta) && isListed(meta)
}

/** La ligne qu'un modèle doit avoir dans l'index, ou `null` s'il n'y a pas sa place. */
function indexEntryOf(
  meta: StoredTemplateMeta | null,
): TemplateIndexEntry | null {
  return isListedMeta(meta) ? toIndexEntry(meta) : null
}

function sameIndexLine(
  a: TemplateIndexEntry | null,
  b: TemplateIndexEntry | null,
): boolean {
  return a === null || b === null ? a === b : sameIndexEntry(a, b)
}

/**
 * L'index une fois la ligne de `id` accordée à sa méta stockée (`latest`,
 * `null` si elle n'existe pas), ou `null` s'il ne change pas. Un modèle non
 * listé ou retiré en sort.
 */
function nextIndex(
  current: TemplateIndexEntry[],
  id: string,
  latest: StoredTemplateMeta | null,
): TemplateIndexEntry[] | null {
  const existing = current.find((entry) => entry.id === id) ?? null
  const others = current.filter((entry) => entry.id !== id)
  const entry = indexEntryOf(latest)
  if (sameIndexLine(existing, entry)) return null
  if (!entry) return others
  return [...others, entry].sort(compareIndexEntries)
}

/**
 * Accorde la ligne de `id` dans son morceau d'index (`templateIndexKey`) à sa
 * méta **stockée**, et dit si c'est fait. Ne lève jamais : à l'appelant de
 * décider si un échec compte (voir `settleIndex`). Un morceau qui ne peut
 * plus grandir (`FILE_TOO_LARGE`) est signalé par `TEMPLATE_INDEX_FULL_ALERT`,
 * avec l'id resté dehors, que `resyncTemplateIndex` rattrapera.
 *
 * Pourquoi relire la méta au lieu de prendre celle que l'appelant vient
 * d'écrire : deux requêtes sur le même modèle ne sont pas ordonnées. Un PUT
 * lent remettrait sinon dans l'index public un modèle qu'un PATCH ou un
 * DELETE venait d'en sortir — titre et villes compris, ce que la pierre
 * tombale efface exprès. D'où, à chaque tentative :
 * 1. l'index, puis la méta, lue **après** lui ;
 * 2. l'écriture de l'index en `ifMatch` : elle échoue si un autre l'a écrit
 *    depuis notre lecture ;
 * 3. après l'écriture, la méta relue : si sa ligne a changé entre-temps, on
 *    recommence. Sans ce contrôle, une requête plus récente qui n'a rien vu à
 *    changer (l'index n'avait pas encore notre ligne) laisserait la nôtre,
 *    périmée, en place.
 * Ainsi la dernière écriture de l'index a vu la dernière méta, sauf si les
 * tentatives s'épuisent — ce que l'appelant apprend par `false`.
 */
async function syncIndex(bucket: TemplateBucket, id: string): Promise<boolean> {
  const key = templateIndexKey(id)
  try {
    for (let attempt = 1; attempt <= INDEX_ATTEMPTS; attempt++) {
      const snapshot = await bucket.getSnapshot(key, READ_OPTIONS)
      const current = snapshot ? parseIndexShard(snapshot.data, key) : []
      if (!current) {
        console.error(
          `Index des modèles illisible (${key}) : il n’est pas réécrit.`,
        )
        return false
      }
      const latest = (await loadMeta(bucket, id))?.meta ?? null
      const entries = nextIndex(current, id, latest)
      if (!entries) return true
      if (snapshot && !snapshot.etag) {
        console.error(
          `Index des modèles sans ETag (${key}) : il n’est pas réécrit.`,
        )
        return false
      }
      try {
        await bucket.putSnapshot(
          key,
          { entries },
          snapshot
            ? { ...TEMPLATE_SNAPSHOT_OPTIONS, ifMatch: snapshot.etag }
            : { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
        )
      } catch (error) {
        if (isPreconditionFailure(error)) continue
        if (isS3ndError(error) && error.code === 'FILE_TOO_LARGE') {
          // Une alerte à part, pas un échec parmi d'autres : sans opérateur,
          // ce modèle (et les suivants du même morceau) resteraient hors du
          // sitemap.
          console.error(
            `${TEMPLATE_INDEX_FULL_ALERT} : le morceau d’index ${key} ne peut plus grandir, le modèle ${id} n’y entre pas. Procédure : docs/modeles-moderation.md §5.`,
          )
          return false
        }
        throw error
      }
      const after = (await loadMeta(bucket, id))?.meta ?? null
      if (sameIndexLine(indexEntryOf(latest), indexEntryOf(after))) return true
    }
    console.error(
      `Index des modèles : ${INDEX_ATTEMPTS} conflits de suite, ${id} attendra sa prochaine écriture.`,
    )
    return false
  } catch (error) {
    console.error('Mise à jour de l’index des modèles impossible', error)
    return false
  }
}

/**
 * Accorde l'index à `meta`, que l'appelant vient d'écrire. Un ajout ou une
 * modification restent au mieux : le modèle manque au sitemap jusqu'à sa
 * prochaine écriture. Une **sortie**, elle, doit aboutir : après un 200, plus
 * rien ne la rejouerait, et le titre et les villes resteraient publics. Elle
 * lève donc `TemplateStoreError('index')` — après l'écriture de la méta, pour
 * que la requête rejouée trouve tout en place et refasse seulement l'index.
 */
async function settleIndex(
  bucket: TemplateBucket,
  meta: StoredTemplateMeta,
): Promise<void> {
  const synced = await syncIndex(bucket, meta.id)
  if (!synced && !isListedMeta(meta)) throw new TemplateStoreError('index')
}

// ── Publication ───────────────────────────────────────────────────────────────

export interface PublishTemplateInput {
  itinerary: readonly DayItinerary[]
  /** Vide ou absent : le titre est tiré des étapes. */
  title?: string | null
  authorName?: string | null
  /** ISO 3166-1 alpha-2, choisi par l'auteur. */
  country: string
  options: TemplateOptions
  indexable: boolean
  /**
   * Jeton tiré par le téléphone (`createOwnerTokenForClient`) et rangé avant
   * l'envoi : la publication rejouée avec lui retrouve le même modèle au lieu
   * d'en créer un second. Absent : le serveur en tire un, et chaque envoi
   * publie un nouveau modèle.
   */
  ownerToken?: string
  now?: Date
}

export interface TemplateWriteResult {
  /** Méta stockée — `ownerTokenHash` compris : ne jamais la renvoyer telle quelle. */
  meta: TemplateMeta
  /** Ce que l'API renvoie. */
  template: PublicTemplate
}

export interface PublishTemplateResult extends TemplateWriteResult {
  /** Rendu à son auteur seulement, jamais stocké ni journalisé. */
  ownerToken: string
  /**
   * `false` : un envoi précédent avec le même jeton avait déjà publié ce
   * modèle, rendu tel qu'il est stocké aujourd'hui (la route répond 200, pas
   * 201). Rien n'a été écrit, hormis l'index rattrapé au besoin.
   */
  created: boolean
}

/**
 * Réserve un id en écrivant la version 1 en `ifAbsent` : une collision se
 * voit à l'écriture, pas après coup.
 */
async function claimTemplateId(
  bucket: TemplateBucket,
  content: TemplateContent,
): Promise<string> {
  for (let attempt = 1; attempt <= ID_ATTEMPTS; attempt++) {
    const id = createTemplateId()
    try {
      await bucket.putSnapshot(
        templateVersionKey(id, 1),
        versionData(1, content),
        { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
      )
      return id
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error
    }
  }
  throw new Error(`Aucun id de modèle libre en ${ID_ATTEMPTS} tirages.`)
}

/**
 * L'id de la publication de ce jeton, réservé dans `owners/<empreinte>` en
 * `ifAbsent` avant toute autre écriture : un nouvel id, ou celui qu'un envoi
 * précédent avec le même jeton a réservé — ou cet envoi lui-même, rejoué par
 * le SDK après une réponse perdue.
 *
 * L'id réservé n'est pas vérifié libre : une collision avec un modèle
 * existant (une chance sur 2^80) ferait échouer la méta, et chaque envoi
 * rejoué avec ce jeton, en 500.
 */
async function reservePublication(
  bucket: TemplateBucket,
  ownerTokenHash: string,
): Promise<string> {
  const key = templateOwnerKey(ownerTokenHash)
  const candidate = createTemplateId()
  try {
    await bucket.putSnapshot(
      key,
      { id: candidate },
      { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
    )
    return candidate
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error
  }
  const reserved = await bucket.getSnapshot(key, READ_OPTIONS)
  const id = reserved && isRecord(reserved.data) ? reserved.data.id : null
  if (!isTemplateId(id)) {
    throw new Error(`Réservation de publication illisible (${key}).`)
  }
  return id
}

/** Les slugs qu'un modèle peut prendre pour `base`, dans l'ordre d'essai. */
function slugCandidates(base: string, id: string): string[] {
  return [
    ...Array.from({ length: SLUG_ATTEMPTS }, (_, index) =>
      suffixedSlug(base, index + 1),
    ),
    idSuffixedSlug(base, id, SLUG_ID_SUFFIX_LENGTH),
    idSuffixedSlug(base, id, TEMPLATE_ID_LENGTH),
  ]
}

/** Le slug de base d'un contenu : pays, nombre de jours, trois premières villes. */
function slugBase(country: string, content: TemplateContent): string {
  return templateSlug({
    country,
    dayCount: content.dayCount,
    cities: content.cities,
  })
}

/**
 * `japon-14-jours-tokyo`, sinon `…-2` à `…-5`, sinon `…-<6 premiers
 * caractères de l'id>`, sinon `…-<id>` : premier slug libre, ou déjà à ce
 * modèle (une ancienne adresse qu'il retrouve). Le dernier ne peut être pris
 * que par un slug de base qui finirait par cet id ; on lève alors `conflict`,
 * et la publication rejouée tire un autre id.
 */
async function reserveSlug(
  bucket: TemplateBucket,
  id: string,
  base: string,
): Promise<string> {
  for (const slug of slugCandidates(base, id)) {
    try {
      await bucket.putSnapshot(
        templateSlugKey(slug),
        { id },
        { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
      )
      return slug
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error
      // Réponse perdue puis rejouée par le SDK, ou ancien slug de ce modèle :
      // le slug est déjà à nous.
      if (await slugBelongsTo(bucket, slug, id)) return slug
    }
  }
  throw new TemplateStoreError(
    'conflict',
    'Aucune adresse libre pour ce modèle. Réessayez.',
  )
}

/**
 * Le modèle qu'un envoi précédent avec le même jeton a publié, tel qu'il est
 * stocké. Retiré depuis : `retired` (410). L'index est revu au passage, au
 * cas où cet envoi précédent se serait interrompu avant lui.
 */
async function alreadyPublished(
  bucket: TemplateBucket,
  meta: StoredTemplateMeta,
  ownerTokenHash: string,
): Promise<TemplateWriteResult> {
  if (meta.ownerTokenHash !== ownerTokenHash) {
    throw new Error(`Réservation de publication incohérente (${meta.id}).`)
  }
  if (isRetiredTemplateMeta(meta)) throw new TemplateStoreError('retired')
  await syncIndex(bucket, meta.id)
  return currentTemplate(bucket, meta)
}

/**
 * Publie un modèle : version 1, slug réservé, méta, puis index.
 *
 * Si une étape échoue après la version, celle-ci reste orpheline : sans
 * méta, aucune lecture ne l'atteint. On ne la supprime que sur un refus
 * certain (aucun slug libre) : une erreur réseau sur la méta ne prouve pas
 * qu'elle n'a pas été écrite.
 *
 * Un 412 sur la méta, lui, se vérifie : la réponse S3 perdue puis rejouée par
 * le SDK bute sur notre propre écriture. La méta relue porte alors l'empreinte
 * de notre jeton et notre version, et la publication continue (index, jeton
 * rendu) : jamais un modèle en ligne que personne ne détient (§2.1).
 *
 * **Avec `input.ownerToken`** (tiré par le téléphone), la publication est
 * rejouable. `owners/<empreinte>` est réservé avant toute autre écriture et
 * désigne l'id du modèle. Un envoi qui la trouve déjà :
 * - méta en ligne : rend ce modèle tel qu'il est stocké, sans rien créer
 *   (`created: false`) — la réponse du premier envoi s'était perdue, ou c'est
 *   un double appui ;
 * - méta absente : le premier envoi s'est interrompu en route, celui-ci
 *   termine la publication sous le même id. Sa version prend le premier
 *   emplacement libre (celles des envois interrompus n'ont pas de méta), et
 *   les emplacements inférieurs sont supprimés une fois la méta écrite ;
 * - pierre tombale : `retired` (410), le retrait ayant échoué à supprimer la
 *   réservation (il la supprime d'ordinaire).
 * Deux envois simultanés avec le même jeton se départagent sur la méta en
 * `ifAbsent` : le perdant rend le modèle du gagnant.
 *
 * L'index est mis à jour au mieux : un nouvel id n'y a jamais figuré, un
 * échec ne fait que retarder son entrée au sitemap.
 */
export async function publishTemplate(
  bucket: TemplateBucket,
  input: PublishTemplateInput,
): Promise<PublishTemplateResult> {
  if (!isCountryCode(input.country)) {
    throw new TemplateStoreError('invalid', 'Pays du voyage invalide.')
  }
  if (input.ownerToken !== undefined && !isOwnerToken(input.ownerToken)) {
    throw new TemplateStoreError('forbidden')
  }
  const content = prepareContent(input.itinerary, input.options, input.title)
  const at = (input.now ?? new Date()).toISOString()
  const ownerToken = input.ownerToken ?? createOwnerToken()
  const ownerTokenHash = hashOwnerToken(ownerToken)

  let id: string
  let version: number
  if (input.ownerToken === undefined) {
    id = await claimTemplateId(bucket, content)
    version = 1
  } else {
    id = await reservePublication(bucket, ownerTokenHash)
    const existing = await loadMeta(bucket, id)
    if (existing) {
      return {
        ...(await alreadyPublished(bucket, existing.meta, ownerTokenHash)),
        ownerToken,
        created: false,
      }
    }
    version = await claimVersion(bucket, id, 1, content, PUBLISH_VERSION_SLOTS)
  }

  let slug: string
  try {
    slug = await reserveSlug(bucket, id, slugBase(input.country, content))
  } catch (error) {
    // Refus certain : aucune méta ne pointera jamais vers cette version.
    if (isTemplateStoreError(error)) {
      await discard(bucket, [templateVersionKey(id, version)])
    }
    throw error
  }
  const meta: TemplateMeta = {
    id,
    slug,
    version,
    authorName: cleanAuthor(input.authorName),
    country: input.country,
    indexable: input.indexable,
    ...contentFields(content),
    publishedAt: at,
    updatedAt: at,
    retiredAt: null,
    ownerTokenHash,
  }
  try {
    await bucket.putSnapshot(templateMetaKey(id), meta, {
      ...TEMPLATE_SNAPSHOT_OPTIONS,
      ifAbsent: true,
    })
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error
    const stored = await loadMeta(bucket, id)
    if (stored?.meta.ownerTokenHash !== ownerTokenHash) throw error
    // Même jeton, autre version : un envoi simultané avec ce jeton a publié
    // avant nous. Notre version n'est désignée par aucune méta.
    if (isRetiredTemplateMeta(stored.meta) || stored.meta.version !== version) {
      await discard(bucket, [templateVersionKey(id, version)])
      return {
        ...(await alreadyPublished(bucket, stored.meta, ownerTokenHash)),
        ownerToken,
        created: false,
      }
    }
    // Sinon, notre propre écriture, rejouée par le SDK : la publication
    // continue comme si elle avait répondu.
  }
  if (version > 1) {
    // Versions d'envois interrompus avec le même jeton : aucune méta ne les
    // a jamais désignées, et un retrait les supprimerait de toute façon.
    await discard(bucket, versionKeysBelow(id, version))
  }
  await syncIndex(bucket, id)
  return {
    meta,
    template: toPublicTemplate(meta, content.itinerary),
    ownerToken,
    created: true,
  }
}

// ── Mise à jour du contenu ────────────────────────────────────────────────────

export interface UpdateTemplateInput {
  itinerary: readonly DayItinerary[]
  /** Absent : le titre actuel est gardé. Vide : tiré des étapes. */
  title?: string | null
  /** Absent : les réglages publiés sont gardés. */
  options?: TemplateOptions
  now?: Date
}

/**
 * Premier emplacement libre parmi les `slots` à partir de `from`, écrit en
 * `ifAbsent`.
 */
async function claimVersion(
  bucket: TemplateBucket,
  id: string,
  from: number,
  content: TemplateContent,
  slots = VERSION_SLOTS,
): Promise<number> {
  for (let version = from; version < from + slots; version++) {
    try {
      await bucket.putSnapshot(
        templateVersionKey(id, version),
        versionData(version, content),
        { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
      )
      return version
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error
    }
  }
  throw new TemplateStoreError('conflict')
}

/** Les clés `v/1` à `v/<version − 1>` d'un modèle. */
function versionKeysBelow(id: string, version: number): string[] {
  return Array.from({ length: Math.max(0, version - 1) }, (_, index) =>
    templateVersionKey(id, index + 1),
  )
}

/**
 * Supprime toutes les versions antérieures à celle que désigne `meta`, de
 * `v/1` à `v/<n − 1>` : une suppression précédente qui aurait échoué, et les
 * versions orphelines de mises à jour interrompues, sont rattrapées du même
 * coup. Ne lève jamais : dit si c'est fait, l'appelant décide.
 *
 * Sans risque pour une lecture ou une écriture concurrente : `version` ne
 * fait que croître dans la méta, rien ne désignera plus ces versions. Une
 * lecture qui en tenait une relit la méta et suit la nouvelle
 * (`loadPublished`).
 */
async function deletePreviousVersions(
  bucket: TemplateBucket,
  meta: TemplateMeta,
): Promise<boolean> {
  const keys = versionKeysBelow(meta.id, meta.version)
  if (keys.length === 0) return true
  try {
    await bucket.delete(keys)
    return true
  } catch (error) {
    console.error('Versions précédentes du modèle non supprimées', error)
    return false
  }
}

/**
 * Le slug d'un modèle après une mise à jour. Gardé tant qu'il est l'un de
 * ceux que le nouveau contenu aurait pu prendre (`slugCandidates`) ; sinon —
 * durée, ou l'une des trois premières villes, changée, ou slug d'une
 * ancienne forme —, un nouveau est réservé, avec les mêmes règles de
 * collision qu'à la publication. L'ancien reste réservé et mène toujours à ce
 * modèle : `readTemplateBySlug` y répond avec le slug actuel, vers lequel le
 * site vitrine redirige (301). Revenir à une durée passée reprend le slug
 * d'alors, déjà à ce modèle.
 */
async function slugFor(
  bucket: TemplateBucket,
  meta: TemplateMeta,
  content: TemplateContent,
): Promise<string> {
  const base = slugBase(meta.country, content)
  if (slugCandidates(base, meta.id).includes(meta.slug)) return meta.slug
  return reserveSlug(bucket, meta.id, base)
}

/**
 * Nouvelle version du contenu, puis suppression de toutes les précédentes :
 * la base de fusion de la V1.1 vit sur le téléphone du repreneur
 * (`StoredTrip.origin.base`), et une note ou un prix que l'auteur retire ne
 * doit pas rester en ligne dans une version antérieure.
 *
 * La version s'écrit en `ifAbsent`, puis la méta en `ifMatch`. Si la méta a
 * bougé entre-temps (un changement de visibilité, une autre mise à jour), on
 * relit une fois et on recommence — sans réécrire la version si elle est
 * toujours la suivante. Au second conflit : `TemplateStoreError('conflict')`.
 * Le slug suit le contenu (`slugFor`) ; le pays, jamais.
 *
 * La méta écrite, les versions précédentes sont supprimées, puis l'index est
 * accordé. Un modèle ramené sous le seuil des listés sort de l'index : si
 * l'index ne suit pas, `TemplateStoreError('index')` (voir `settleIndex`).
 * Si la suppression a échoué, `TemplateStoreError('versions')`, après
 * l'index. Dans les deux cas la nouvelle version est en ligne et la route
 * répond 503 : rejouée, la mise à jour écrit une version de plus, supprime
 * toutes les précédentes et refait l'index.
 */
export async function updateTemplate(
  bucket: TemplateBucket,
  id: string,
  token: string,
  input: UpdateTemplateInput,
): Promise<TemplateWriteResult> {
  const result = await writeNewVersion(bucket, id, token, input)
  const previousDeleted = await deletePreviousVersions(bucket, result.meta)
  await settleIndex(bucket, result.meta)
  if (!previousDeleted) {
    throw new TemplateStoreError('versions', STALE_VERSIONS_MESSAGE)
  }
  return result
}

/** Version puis méta : le cœur de `updateTemplate`, sans l'index. */
async function writeNewVersion(
  bucket: TemplateBucket,
  id: string,
  token: string,
  input: UpdateTemplateInput,
): Promise<TemplateWriteResult> {
  const at = (input.now ?? new Date()).toISOString()
  let written: { version: number; content: TemplateContent } | null = null
  /**
   * Retrait passé pendant la mise à jour : notre version, écrite peut-être
   * après sa suppression des versions, ne doit pas survivre à un retrait
   * annoncé comme réussi (§4). Suppression attendue, pas `discard` : si elle
   * échoue, `versions` (503), et l'auteur rejoue le retrait.
   */
  async function purgeAfterRetirement(
    tombstone: RetiredTemplateMeta,
  ): Promise<never> {
    const keys = versionKeysOf(tombstone)
    if (written) {
      const own = templateVersionKey(id, written.version)
      if (!keys.includes(own)) keys.push(own)
    }
    written = null
    try {
      await bucket.delete(keys)
    } catch (error) {
      console.error('Versions du modèle retiré non supprimées', error)
      throw new TemplateStoreError('versions')
    }
    throw new TemplateStoreError('retired')
  }
  try {
    for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
      const { meta, etag } = await loadOwnedMeta(bucket, id, token)
      if (isRetiredTemplateMeta(meta)) {
        if (written) await purgeAfterRetirement(meta)
        throw new TemplateStoreError('retired')
      }

      // La méta pointe déjà vers notre version : seule cette requête a pu
      // écrire `v/<n>` (`ifAbsent`), notre écriture de la méta a donc abouti.
      if (written && written.version === meta.version) {
        return {
          meta,
          template: toPublicTemplate(meta, written.content.itinerary),
        }
      }
      // Une autre mise à jour a publié par-dessus notre emplacement : notre
      // version passerait pour plus ancienne que l'actuelle. On en reprend un.
      if (written && written.version < meta.version) {
        await discard(bucket, [templateVersionKey(id, written.version)])
        written = null
      }
      if (!written) {
        const content = prepareContent(
          input.itinerary,
          input.options ?? optionsOf(meta),
          input.title === undefined ? meta.title : input.title,
        )
        const version = await claimVersion(
          bucket,
          id,
          meta.version + 1,
          content,
        )
        written = { version, content }
        // Relue après l'écriture de la version : un retrait dont la
        // suppression est passée avant elle se voit forcément ici, quelle
        // que soit l'issue de l'écriture de la méta qui suit.
        const latest = await loadMeta(bucket, id)
        if (latest && isRetiredTemplateMeta(latest.meta)) {
          await purgeAfterRetirement(latest.meta)
        }
      }

      // Le pays ne bouge jamais. Le slug suit la durée et les trois
      // premières villes, le reste suit la nouvelle version.
      const next: TemplateMeta = {
        ...meta,
        ...contentFields(written.content),
        slug: await slugFor(bucket, meta, written.content),
        version: written.version,
        updatedAt: at,
      }
      try {
        await bucket.putSnapshot(templateMetaKey(id), next, {
          ...TEMPLATE_SNAPSHOT_OPTIONS,
          ifMatch: etag,
        })
      } catch (error) {
        if (!isPreconditionFailure(error)) throw error
        // Réponse perdue puis rejouée par le SDK : le 412 peut venir de notre
        // propre écriture. La méta relue le dit (voir plus haut).
        const latest = await loadMeta(bucket, id)
        if (
          latest &&
          !isRetiredTemplateMeta(latest.meta) &&
          latest.meta.version === written.version
        ) {
          return {
            meta: latest.meta,
            template: toPublicTemplate(latest.meta, written.content.itinerary),
          }
        }
        continue
      }
      return {
        meta: next,
        template: toPublicTemplate(next, written.content.itinerary),
      }
    }
    throw new TemplateStoreError('conflict')
  } catch (error) {
    // Refus certain : la méta ne pointe pas vers notre version, on la retire.
    // Sur une erreur réseau, on ne sait pas : mieux vaut un orphelin qu'une
    // méta qui pointerait vers une version supprimée.
    if (written && isTemplateStoreError(error)) {
      await discard(bucket, [templateVersionKey(id, written.version)])
    }
    throw error
  }
}

// ── Réglages ──────────────────────────────────────────────────────────────────

export interface TemplatePatch {
  indexable?: boolean
  /** `null` efface le prénom. Absent : inchangé. */
  authorName?: string | null
  /**
   * Titre public (écran A4 : renommer sans republier). Absent : inchangé.
   * `null` ou vide : tiré des étapes de la version publiée, comme à la
   * publication.
   */
  title?: string | null
  now?: Date
}

/**
 * Le titre après un réglage : celui de la méta, le titre saisi (borné comme
 * à la publication), ou les étapes de la version publiée.
 */
async function patchedTitle(
  bucket: TemplateBucket,
  meta: TemplateMeta,
  title: string | null | undefined,
): Promise<string> {
  if (title === undefined) return meta.title
  const typed = typedTitle(title)
  if (typed) return typed
  // Une mise à jour concurrente a pu remplacer la version : on tire alors le
  // titre de la nouvelle, et l'écriture de la méta en `ifMatch` échouera et
  // relira tout.
  const published = await loadPublished(bucket, meta)
  switch (published.status) {
    case 'active':
      return templateTitle(null, published.itinerary)
    case 'retired':
      throw new TemplateStoreError('retired')
    case 'missing':
      throw new TemplateStoreError('missing')
    case 'broken':
      throw new Error(`Version ${meta.version} absente du modèle ${meta.id}.`)
  }
}

/**
 * Visibilité, prénom et titre : la méta change, pas le contenu ni sa
 * version. Masquer le modèle le sort de l'index ; si l'index ne suit pas,
 * `TemplateStoreError('index')`, et la même requête rejouée le rattrape. Un
 * nouveau titre suit dans l'index ; le slug, lui, ne dépend pas du titre.
 */
export async function patchTemplate(
  bucket: TemplateBucket,
  id: string,
  token: string,
  patch: TemplatePatch,
): Promise<TemplateWriteResult> {
  const at = (patch.now ?? new Date()).toISOString()
  for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
    const { meta, etag } = await loadOwnedMeta(bucket, id, token)
    if (isRetiredTemplateMeta(meta)) throw new TemplateStoreError('retired')

    const indexable = patch.indexable ?? meta.indexable
    const authorName =
      patch.authorName === undefined
        ? meta.authorName
        : cleanAuthor(patch.authorName)
    const title = await patchedTitle(bucket, meta, patch.title)
    // Rien ne change : pas d'écriture de la méta, et `updatedAt` ne bouge
    // pas. L'index est tout de même revu : c'est ainsi qu'un « masquer »
    // rejoué après un échec de l'index finit par l'en sortir.
    if (
      indexable === meta.indexable &&
      authorName === meta.authorName &&
      title === meta.title
    ) {
      await settleIndex(bucket, meta)
      return currentTemplate(bucket, meta)
    }

    const next: TemplateMeta = {
      ...meta,
      indexable,
      authorName,
      title,
      updatedAt: at,
    }
    try {
      await bucket.putSnapshot(templateMetaKey(id), next, {
        ...TEMPLATE_SNAPSHOT_OPTIONS,
        ifMatch: etag,
      })
    } catch (error) {
      if (isPreconditionFailure(error)) continue
      throw error
    }
    await settleIndex(bucket, next)
    return currentTemplate(bucket, next)
  }
  throw new TemplateStoreError('conflict')
}

// ── Retrait ──────────────────────────────────────────────────────────────────

/**
 * Pierre tombale : la méta reste pour que les lectures répondent 410 et que
 * le slug ne serve jamais à un autre modèle. Hors du slug, elle ne garde rien
 * de ce que l'auteur a écrit ou choisi — ni titre, ni prénom, ni année, ni
 * réglages, ni les champs pays et villes —, seulement s'il était listé,
 * calculé ici. Le jeton (son empreinte) reste, pour qu'un second retrait soit
 * encore autorisé.
 *
 * Le slug, lui, reste pour toujours, ici et dans `slugs/<slug>` : il porte le
 * pays (son nom français), le nombre de jours et jusqu'à 3 villes, telles que
 * l'auteur les a tapées, mises en forme de slug (`japon-3-jours-tokyo-kyoto`).
 * Les slugs qu'il a portés avant une mise à jour aussi : chacun pointe
 * toujours vers la pierre tombale, et répond comme le slug actuel (410 s'il
 * était listé au retrait, 404 sinon).
 */
function toTombstone(meta: TemplateMeta, at: string): RetiredTemplateMeta {
  return {
    id: meta.id,
    slug: meta.slug,
    version: meta.version,
    publishedAt: meta.publishedAt,
    retiredAt: at,
    ownerTokenHash: meta.ownerTokenHash,
    wasListed: isListed(meta),
  }
}

/**
 * Les clés de version qu'un retrait supprime, et que l'opérateur vérifie : de
 * 1 à la version publiée (une mise à jour dont la suppression a échoué en a
 * pu laisser), plus les emplacements au-delà, qui couvrent un éventuel
 * orphelin (supprimer une clé absente ne coûte rien).
 */
function versionKeysOf(
  meta: Pick<StoredTemplateMeta, 'id' | 'version'>,
): string[] {
  const keys: string[] = []
  for (let n = 1; n <= meta.version + VERSION_SLOTS; n++) {
    keys.push(templateVersionKey(meta.id, n))
  }
  return keys
}

/**
 * Ce qu'un retrait supprime : les versions, et la réservation de sa
 * publication si elle désigne bien ce modèle. Le même jeton a pu republier
 * depuis un premier retrait (la réservation désigne alors l'autre modèle) :
 * un retrait rejoué ne doit pas la lui retirer. Lue avant d'être supprimée,
 * elle ne peut pas changer entre-temps : tant qu'elle existe, une
 * publication avec ce jeton ne fait que la relire.
 */
async function retiredKeysOf(
  bucket: TemplateBucket,
  tombstone: RetiredTemplateMeta,
): Promise<string[]> {
  const keys = versionKeysOf(tombstone)
  if (isOwnerTokenHash(tombstone.ownerTokenHash)) {
    const key = templateOwnerKey(tombstone.ownerTokenHash)
    const reservation = await bucket.getSnapshot(key, READ_OPTIONS)
    if (
      reservation &&
      isRecord(reservation.data) &&
      reservation.data.id === tombstone.id
    ) {
      keys.push(key)
    }
  }
  return keys
}

interface Retirement {
  tombstone: RetiredTemplateMeta
  /** Déjà retiré : seuls les versions et l'index ont été revus. */
  alreadyRetired: boolean
}

/**
 * Le retrait, quel que soit celui qui le demande : `load` relit la méta (et
 * vérifie le jeton, pour l'auteur) à chaque tentative.
 *
 * Les versions sont le contenu de l'auteur : leur suppression doit aboutir,
 * comme la sortie de l'index. La réservation de sa publication
 * (`owners/<empreinte>`) part avec elles : rejouer cette publication ne doit
 * pas buter sur un modèle retiré. Si la suppression échoue, l'index est tout
 * de même accordé, puis le retrait lève `TemplateStoreError('versions')` (ou
 * `'index'` d'abord, si l'index a échoué lui aussi). Rejoué, il trouve la
 * pierre tombale et refait les deux.
 */
async function retireStored(
  bucket: TemplateBucket,
  load: () => Promise<WritableMeta>,
  now: Date,
): Promise<Retirement> {
  for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
    const { meta, etag } = await load()
    const alreadyRetired = isRetiredTemplateMeta(meta)
    let tombstone: RetiredTemplateMeta
    if (isRetiredTemplateMeta(meta)) {
      tombstone = meta
    } else {
      tombstone = toTombstone(meta, now.toISOString())
      try {
        await bucket.putSnapshot(templateMetaKey(meta.id), tombstone, {
          ...TEMPLATE_SNAPSHOT_OPTIONS,
          ifMatch: etag,
        })
      } catch (error) {
        if (isPreconditionFailure(error)) continue
        throw error
      }
    }
    // Pas `discard` : une suppression avalée laisserait le contenu de
    // l'auteur dans R2 derrière un retrait annoncé comme réussi.
    let versionsDeleted = true
    try {
      await bucket.delete(await retiredKeysOf(bucket, tombstone))
    } catch (error) {
      versionsDeleted = false
      console.error('Versions du modèle non supprimées', error)
    }
    // L'index d'abord, même si les versions ont échoué : il lève `index`
    // s'il ne suit pas, et le retrait rejoué refera les deux.
    await settleIndex(bucket, tombstone)
    if (!versionsDeleted) throw new TemplateStoreError('versions')
    return { tombstone, alreadyRetired }
  }
  throw new TemplateStoreError('conflict')
}

/**
 * Retire un modèle : pierre tombale, versions supprimées, sortie de l'index.
 * Si l'index ne suit pas, `TemplateStoreError('index')` ; si les versions
 * n'ont pas été supprimées, `TemplateStoreError('versions')`. Dans les deux
 * cas la route répond 503, l'auteur réessaie. Idempotent : un second appel
 * refait le ménage sans erreur, ce qui rattrape une suppression ou un index
 * qui avait échoué.
 */
export async function retireTemplate(
  bucket: TemplateBucket,
  id: string,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  await retireStored(bucket, () => loadOwnedMeta(bucket, id, token), now)
}

/** Ce que l'opérateur apprend d'un retrait. */
export interface OperatorRetirement {
  id: string
  slug: string
  /** ISO 8601. */
  retiredAt: string
  /** Listé au moment du retrait : sa page tripbrain.fr répond 410, sinon 404. */
  wasListed: boolean
  /** Déjà retiré : seuls les versions et l'index ont été revus. */
  alreadyRetired: boolean
}

/**
 * Le modèle que désigne `ref` — son id, ou l'un de ses slugs via
 * `slugs/<slug>` —, ou `null`. Un slug mène au modèle même si ce n'est plus
 * le sien (`meta.slug`) : la durée ou les villes ont changé depuis, et
 * l'ancienne adresse redirige vers la nouvelle. Une publication interrompue
 * peut avoir réservé un slug sans jamais écrire sa méta : `null`.
 */
async function findTemplate(
  bucket: TemplateBucket,
  ref: string,
): Promise<StoredMeta | null> {
  if (isTemplateId(ref)) return loadMeta(bucket, ref)
  if (!isTemplateSlug(ref)) return null
  const pointer = await bucket.getSnapshot(templateSlugKey(ref), READ_OPTIONS)
  const id = pointer && isRecord(pointer.data) ? pointer.data.id : null
  if (!isTemplateId(id)) return null
  return loadMeta(bucket, id)
}

/**
 * Retrait par l'opérateur, **sans le jeton** : contenu signalé, abus, ou
 * auteur qui a perdu son téléphone. Mêmes effets que `retireTemplate`
 * (pierre tombale, versions supprimées, slug gardé, sortie de l'index,
 * `TemplateStoreError('index')` si l'index ne suit pas, `'versions'` si les
 * versions n'ont pas été supprimées), et idempotent comme lui. `ref` est
 * l'id ou le slug du modèle.
 *
 * Aucune route n'y mène : seul `scripts/retire-template.ts` l'appelle, avec
 * les identifiants R2 de production. Procédure : `docs/modeles-moderation.md`.
 */
export async function retireTemplateAsOperator(
  bucket: TemplateBucket,
  ref: string,
  now: Date = new Date(),
): Promise<OperatorRetirement> {
  const { tombstone, alreadyRetired } = await retireStored(
    bucket,
    async () => {
      const stored = await findTemplate(bucket, ref)
      if (!stored) throw new TemplateStoreError('missing')
      // Sans ETag, un `ifMatch` deviendrait une écriture inconditionnelle.
      if (!stored.etag) throw new TemplateStoreError('conflict')
      return { meta: stored.meta, etag: stored.etag }
    },
    now,
  )
  return {
    id: tombstone.id,
    slug: tombstone.slug,
    retiredAt: tombstone.retiredAt,
    wasListed: tombstone.wasListed,
    alreadyRetired,
  }
}

/** L'état d'un modèle vu par l'opérateur, avant et après un retrait. */
export type OperatorTemplateState =
  | { status: 'missing' }
  | {
      status: 'active' | 'retired'
      /** Méta stockée — `ownerTokenHash` compris : ne pas l'afficher. */
      meta: StoredTemplateMeta
      /** Présent dans l'index public ; `null` si l'index est illisible. */
      inIndex: boolean | null
      /**
       * Versions encore stockées parmi celles qu'un retrait supprime (`v/1`
       * à `v/<version + 3>`) : le contenu de l'auteur. `0` une fois retiré ;
       * `null` si l'une d'elles n'a pas pu être lue.
       */
      versionsLeft: number | null
    }

/**
 * Ce que l'opérateur doit voir avant de retirer un modèle (le bon titre, le
 * bon auteur ?) et après (retiré, hors de l'index, contenu effacé ?). `ref` :
 * id ou slug.
 */
export async function readTemplateForOperator(
  bucket: TemplateBucket,
  ref: string,
): Promise<OperatorTemplateState> {
  const stored = await findTemplate(bucket, ref)
  if (!stored) return { status: 'missing' }
  let inIndex: boolean | null
  try {
    inIndex = (
      await readIndexShard(bucket, templateIndexKey(stored.meta.id))
    ).some((entry) => entry.id === stored.meta.id)
  } catch {
    inIndex = null
  }
  return {
    status: isRetiredTemplateMeta(stored.meta) ? 'retired' : 'active',
    meta: stored.meta,
    inIndex,
    versionsLeft: await countVersions(bucket, stored.meta),
  }
}

/**
 * Combien des clés de `versionKeysOf` existent encore, ou `null` si l'une
 * n'a pas pu être lue. Sans `maxVersion` : une version d'un format plus
 * récent est du contenu stocké comme une autre.
 */
async function countVersions(
  bucket: TemplateBucket,
  meta: StoredTemplateMeta,
): Promise<number | null> {
  try {
    const found = await Promise.all(
      versionKeysOf(meta).map((key) => bucket.getSnapshot(key)),
    )
    return found.filter((snapshot) => snapshot !== null).length
  } catch {
    return null
  }
}

// ── Lectures publiques ────────────────────────────────────────────────────────

export type TemplateReadResult =
  | { status: 'active'; template: PublicTemplate }
  | { status: 'retired' }
  | { status: 'missing' }

/**
 * `bySlug` : la lecture vient d'une page tripbrain.fr. Un modèle retiré n'y
 * répond 410 que s'il était listé, et un modèle en ligne seulement s'il l'est
 * encore (voir `readTemplateBySlug`).
 */
async function resolveTemplate(
  bucket: TemplateBucket,
  meta: StoredTemplateMeta,
  bySlug = false,
): Promise<TemplateReadResult> {
  if (isRetiredTemplateMeta(meta)) return { status: 'retired' }
  const published = await loadPublished(bucket, meta)
  switch (published.status) {
    case 'active':
      // Une mise à jour concurrente a pu ramener le modèle sous le seuil
      // des listés : par le slug, il n'a alors plus de page.
      if (bySlug && !isListed(published.meta)) return { status: 'missing' }
      return {
        status: 'active',
        template: toPublicTemplate(published.meta, published.itinerary),
      }
    case 'retired':
      // Un retrait concurrent a effacé les versions depuis la lecture de la
      // méta : sa pierre tombale fait répondre 410, pas 404.
      return !bySlug || published.tombstone.wasListed
        ? { status: 'retired' }
        : { status: 'missing' }
    case 'missing':
      return { status: 'missing' }
    case 'broken':
      console.error(
        `Version ${published.meta.version} absente du modèle ${meta.id}.`,
      )
      return { status: 'missing' }
  }
}

/** Le modèle dans sa version publiée, ou son statut. */
export async function readTemplate(
  bucket: TemplateBucket,
  id: string,
): Promise<TemplateReadResult> {
  if (!isTemplateId(id)) return { status: 'missing' }
  const stored = await loadMeta(bucket, id)
  if (!stored) return { status: 'missing' }
  return resolveTemplate(bucket, stored.meta)
}

/**
 * Le modèle d'une page tripbrain.fr. **Seulement s'il est listé** : un slug
 * se devine (`japon-14-jours-tokyo`), et un modèle « lien seulement » ne doit
 * être joignable que par son id. Un modèle retiré qui était listé répond
 * `retired` (410) ; un modèle qui n'a jamais eu de page reste `missing` —
 * sans quoi un 410 sur un slug deviné trahirait qu'il a existé.
 *
 * Un ancien slug (le modèle en a changé à une mise à jour, sa durée ou ses
 * villes ayant changé) mène au même modèle : `template.slug` est alors le
 * slug actuel, différent de celui demandé, et le site vitrine redirige (301).
 * Retiré, le modèle répond de même sur tous ses slugs.
 */
export async function readTemplateBySlug(
  bucket: TemplateBucket,
  slug: string,
): Promise<TemplateReadResult> {
  if (!isTemplateSlug(slug)) return { status: 'missing' }
  const stored = await findTemplate(bucket, slug)
  if (!stored) return { status: 'missing' }
  const { meta } = stored
  // La pierre tombale garde `wasListed`, calculé au retrait : on sait encore
  // si le modèle avait une page.
  if (isRetiredTemplateMeta(meta)) {
    return meta.wasListed ? { status: 'retired' } : { status: 'missing' }
  }
  if (!isListed(meta)) return { status: 'missing' }
  return resolveTemplate(bucket, meta, true)
}

async function readIndexShard(
  bucket: TemplateBucket,
  key: string,
): Promise<TemplateIndexEntry[]> {
  const snapshot = await bucket.getSnapshot(key, READ_OPTIONS)
  if (!snapshot) return []
  const entries = parseIndexShard(snapshot.data, key)
  if (!entries) throw new Error(`Index des modèles illisible (${key}).`)
  return entries
}

/**
 * Les modèles listés, du plus récemment modifié au plus ancien : les 32
 * morceaux, lus en parallèle et fusionnés. Un morceau illisible lève, comme
 * une méta illisible : présenté comme une liste vide, il ferait sortir ses
 * modèles du sitemap de tripbrain.fr, en cache. Une erreur, elle, laisse
 * l'ISR garder la page précédente.
 */
export async function readIndex(
  bucket: TemplateBucket,
): Promise<TemplateIndexEntry[]> {
  const shards = await Promise.all(
    TEMPLATE_INDEX_KEYS.map((key) => readIndexShard(bucket, key)),
  )
  return shards.flat().sort(compareIndexEntries)
}

/** Une page de l'index public : `GET /api/templates/index?page=<n>`. */
export interface TemplateIndexPage {
  /** Au plus `TEMPLATE_INDEX_PAGE_SIZE` lignes, dans l'ordre de `readIndex`. */
  entries: TemplateIndexEntry[]
  /** La page suivante, ou `null` si celle-ci est la dernière. */
  nextPage: number | null
}

/**
 * La page `page` (à partir de 0) de l'index : `TEMPLATE_INDEX_PAGE_SIZE`
 * lignes au plus, du plus récemment modifié au plus ancien, l'id départageant
 * deux dates égales. Une réponse reste ainsi petite quel que soit le nombre
 * de modèles listés (la plateforme plafonne une réponse à 4,5 Mo). Au-delà de
 * la dernière page : aucune ligne, `nextPage: null`.
 *
 * Chaque page relit les 32 morceaux : un modèle modifié entre deux pages peut
 * en changer, et manquer ou figurer deux fois dans un parcours complet. Le
 * site vitrine dédoublonne par id ; un manquant revient au parcours suivant.
 */
export async function readIndexPage(
  bucket: TemplateBucket,
  page: number,
): Promise<TemplateIndexPage> {
  if (!Number.isInteger(page) || page < 0) {
    throw new RangeError(`Page d’index invalide : ${page}.`)
  }
  const all = await readIndex(bucket)
  const start = page * TEMPLATE_INDEX_PAGE_SIZE
  const end = start + TEMPLATE_INDEX_PAGE_SIZE
  return {
    entries: all.slice(start, end),
    nextPage: end < all.length ? page + 1 : null,
  }
}

/** Ce que l'opérateur apprend d'un rattrapage de l'index. */
export interface IndexResync {
  id: string
  slug: string
  /** La méta dit que le modèle doit figurer dans l'index. */
  listed: boolean
  /** Sa ligne est accordée à sa méta (présente si listé, absente sinon). */
  synced: boolean
}

/**
 * Accorde à sa méta la ligne d'index d'un modèle (`ref` : id ou slug), sans
 * rien écrire d'autre : de quoi rattraper un modèle listé resté dehors
 * pendant qu'un morceau d'index était plein (`TEMPLATE_INDEX_FULL_ALERT`),
 * sans attendre que son auteur le modifie. `null` si le modèle est introuvable.
 * Sans risque à rejouer. Seul `scripts/resync-template-index.ts` l'appelle.
 */
export async function resyncTemplateIndex(
  bucket: TemplateBucket,
  ref: string,
): Promise<IndexResync | null> {
  const stored = await findTemplate(bucket, ref)
  if (!stored) return null
  const { id, slug } = stored.meta
  return {
    id,
    slug,
    listed: isListedMeta(stored.meta),
    synced: await syncIndex(bucket, id),
  }
}
