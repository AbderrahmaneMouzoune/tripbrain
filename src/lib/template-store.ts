// Stockage des itinéraires modèles, sous `templates/` dans le bucket R2.
//
// Toute la logique vit ici, derrière une interface étroite (`TemplateBucket`) :
// les routes restent minces, et les tests tournent contre un faux bucket en
// mémoire, comme le moteur des voyages de groupe.
//
// Clés (sous le préfixe `templates/` de `template-bucket.ts`) :
//   <id>/meta     TemplateMeta — `ifAbsent` à la création, puis `ifMatch`
//   <id>/v/<n>    { version, title, itinerary } — `ifAbsent`, jamais réécrit
//   slugs/<slug>  { id } — `ifAbsent`, jamais réutilisé
//   index         { entries } — modèles listés seulement, boucle `ifMatch`
//
// Ordre d'écriture : la version, puis la méta, puis l'index. La méta ne pointe
// donc jamais vers une version absente ; si l'index échoue, le modèle manque
// au sitemap jusqu'à sa prochaine écriture, sans rien casser d'autre.
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
import {
  MAX_TEMPLATE_TITLE_LENGTH,
  createTemplateId,
  isCountryCode,
  isListed,
  isTemplateId,
  isTemplateSlug,
  suffixedSlug,
  templateCities,
  templateSlug,
  toIndexEntry,
  toPublicTemplate,
  tripYear,
  type PublicTemplate,
  type TemplateIndexEntry,
  type TemplateMeta,
  type TemplateOptions,
} from '@/lib/template-model'
import {
  createOwnerToken,
  hashOwnerToken,
  verifyOwnerToken,
} from '@/lib/template-token'
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
/** `japon-14-jours-tokyo`, puis `…-2` jusqu'à `…-20`. */
const SLUG_ATTEMPTS = 20
/** Une écriture de méta en conflit relit une fois, puis renonce. */
const META_ATTEMPTS = 2
/**
 * Emplacements de version essayés au-delà de la version publiée. Une mise à
 * jour interrompue entre la version et la méta laisse un `v/<n>` orphelin :
 * la suivante passe à `n + 1` au lieu de buter dessus pour toujours.
 */
const VERSION_SLOTS = 3
/** L'index est partagé par tous les modèles : plus de concurrence possible. */
const INDEX_ATTEMPTS = 5

// ── Clés ──────────────────────────────────────────────────────────────────────

/** Ni `index` ni `slugs` n'ont la forme d'un id (16 caractères) : pas de collision. */
export const TEMPLATE_INDEX_KEY = 'index'

export function templateMetaKey(id: string): string {
  return `${id}/meta`
}

export function templateVersionKey(id: string, version: number): string {
  return `${id}/v/${version}`
}

export function templateSlugKey(slug: string): string {
  return `slugs/${slug}`
}

// ── Erreurs ───────────────────────────────────────────────────────────────────

export type TemplateStoreErrorCode =
  | 'missing'
  | 'retired'
  | 'forbidden'
  | 'conflict'
  | 'invalid'

// Pas de « code » ni d'« expir » dans ces messages : `analytics/metrics.ts`
// classe les échecs d'après ces sous-chaînes.
const ERROR_MESSAGES: Record<TemplateStoreErrorCode, string> = {
  missing: 'Ce modèle n’existe pas.',
  retired: 'Ce modèle a été retiré.',
  forbidden: 'Cet appareil n’est pas autorisé à modifier ce modèle.',
  conflict: 'Le modèle a changé entre-temps. Réessayez.',
  invalid: 'Ce modèle est invalide.',
}

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
function parseMeta(value: unknown): TemplateMeta | null {
  if (!isRecord(value)) return null
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
    !isNullableString(retiredAt) ||
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

/** Contenu d'une version : ce que `GET /api/templates/<id>/v/<n>` renvoie. */
export interface TemplateVersionData {
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

/** `null` si l'objet n'a pas la forme d'un index : mieux vaut ne pas l'écraser. */
function parseIndex(value: unknown): TemplateIndexEntry[] | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null
  const entries: TemplateIndexEntry[] = []
  for (const candidate of value.entries) {
    const entry = parseIndexEntry(candidate)
    if (entry) entries.push(entry)
  }
  return entries
}

// ── Lectures internes ─────────────────────────────────────────────────────────

interface StoredMeta {
  meta: TemplateMeta
  etag: string | undefined
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

/**
 * Méta d'un modèle dont l'appelant détient le jeton. Le statut « retiré »
 * reste à la charge de l'appelant : retirer deux fois n'est pas une erreur.
 */
async function loadOwnedMeta(
  bucket: TemplateBucket,
  id: string,
  token: string,
): Promise<{ meta: TemplateMeta; etag: string }> {
  if (!isTemplateId(id)) throw new TemplateStoreError('missing')
  const stored = await loadMeta(bucket, id)
  if (!stored) throw new TemplateStoreError('missing')
  if (!verifyOwnerToken(token, stored.meta.ownerTokenHash)) {
    throw new TemplateStoreError('forbidden')
  }
  // Sans ETag, un `ifMatch` deviendrait une écriture inconditionnelle.
  if (!stored.etag) throw new TemplateStoreError('conflict')
  return { meta: stored.meta, etag: stored.etag }
}

/** L'itinéraire de la version publiée, pour répondre après une écriture. */
async function publicTemplateOf(
  bucket: TemplateBucket,
  meta: TemplateMeta,
): Promise<PublicTemplate> {
  const version = await loadVersion(bucket, meta.id, meta.version)
  if (!version) {
    throw new Error(`Version ${meta.version} absente du modèle ${meta.id}.`)
  }
  return toPublicTemplate(meta, version.itinerary)
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

/** Titre saisi, borné ; à défaut, les étapes du voyage (« Tokyo et Kyoto »). */
function templateTitle(
  title: string | null | undefined,
  itinerary: DayItinerary[],
): string {
  const typed = (title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEMPLATE_TITLE_LENGTH)
    .trim()
  return typed || deriveTripTitle(itinerary).slice(0, MAX_TEMPLATE_TITLE_LENGTH)
}

/**
 * Le serveur renettoie toujours, avec les réglages qu'il va stocker : le
 * nettoyage fait sur le téléphone sert l'aperçu, il ne garantit rien.
 */
function prepareContent(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
  title: string | null | undefined,
): TemplateContent {
  const cleaned = cleanForTemplate(itinerary, options)
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

/** L'index après passage de `meta`, ou `null` s'il ne change pas. */
function nextIndex(
  current: TemplateIndexEntry[],
  meta: TemplateMeta,
): TemplateIndexEntry[] | null {
  const existing = current.find((entry) => entry.id === meta.id)
  const others = current.filter((entry) => entry.id !== meta.id)
  if (!isListed(meta)) return existing ? others : null
  const entry = toIndexEntry(meta)
  if (existing && sameIndexEntry(existing, entry)) return null
  return [...others, entry].sort(compareIndexEntries)
}

/**
 * Range `meta` dans l'index (ou l'en sort). Ne lève jamais : l'écriture
 * principale a déjà réussi, et un index en retard ne prive le modèle que du
 * sitemap jusqu'à sa prochaine écriture.
 */
async function syncIndex(
  bucket: TemplateBucket,
  meta: TemplateMeta,
): Promise<void> {
  try {
    for (let attempt = 1; attempt <= INDEX_ATTEMPTS; attempt++) {
      const snapshot = await bucket.getSnapshot(TEMPLATE_INDEX_KEY, READ_OPTIONS)
      const current = snapshot ? parseIndex(snapshot.data) : []
      if (!current) {
        console.error('Index des modèles illisible : il n’est pas réécrit.')
        return
      }
      const entries = nextIndex(current, meta)
      if (!entries) return
      if (snapshot && !snapshot.etag) {
        console.error('Index des modèles sans ETag : il n’est pas réécrit.')
        return
      }
      try {
        await bucket.putSnapshot(
          TEMPLATE_INDEX_KEY,
          { entries },
          snapshot
            ? { ...TEMPLATE_SNAPSHOT_OPTIONS, ifMatch: snapshot.etag }
            : { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
        )
        return
      } catch (error) {
        if (!isPreconditionFailure(error)) throw error
      }
    }
    console.error(
      `Index des modèles : ${INDEX_ATTEMPTS} conflits de suite, ${meta.id} attendra sa prochaine écriture.`,
    )
  } catch (error) {
    console.error('Mise à jour de l’index des modèles impossible', error)
  }
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
  now?: Date
}

export interface TemplateWriteResult {
  /** Méta stockée — `ownerTokenHash` compris : ne jamais la renvoyer telle quelle. */
  meta: TemplateMeta
  /** Ce que l'API renvoie. */
  template: PublicTemplate
}

export interface PublishTemplateResult extends TemplateWriteResult {
  /** Renvoyé une seule fois, jamais stocké ni journalisé. */
  ownerToken: string
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

/** `japon-14-jours-tokyo`, sinon `…-2`, `…-3` : premier slug libre. */
async function reserveSlug(
  bucket: TemplateBucket,
  id: string,
  base: string,
): Promise<string> {
  for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt++) {
    const slug = suffixedSlug(base, attempt)
    try {
      await bucket.putSnapshot(
        templateSlugKey(slug),
        { id },
        { ...TEMPLATE_SNAPSHOT_OPTIONS, ifAbsent: true },
      )
      return slug
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error
    }
  }
  throw new Error(`Aucun slug libre pour « ${base} » en ${SLUG_ATTEMPTS} essais.`)
}

/**
 * Publie un modèle : version 1, slug réservé, méta, puis index.
 *
 * Si une étape échoue après la version 1, celle-ci reste orpheline : sans
 * méta, aucune lecture ne l'atteint. On ne la supprime pas, car une erreur
 * réseau sur la méta ne prouve pas qu'elle n'a pas été écrite.
 */
export async function publishTemplate(
  bucket: TemplateBucket,
  input: PublishTemplateInput,
): Promise<PublishTemplateResult> {
  if (!isCountryCode(input.country)) {
    throw new TemplateStoreError('invalid', 'Pays du voyage invalide.')
  }
  const content = prepareContent(input.itinerary, input.options, input.title)
  const at = (input.now ?? new Date()).toISOString()
  const ownerToken = createOwnerToken()

  const id = await claimTemplateId(bucket, content)
  const slug = await reserveSlug(
    bucket,
    id,
    templateSlug({
      country: input.country,
      dayCount: content.dayCount,
      cities: content.cities,
    }),
  )
  const meta: TemplateMeta = {
    id,
    slug,
    version: 1,
    authorName: cleanAuthor(input.authorName),
    country: input.country,
    indexable: input.indexable,
    ...contentFields(content),
    publishedAt: at,
    updatedAt: at,
    retiredAt: null,
    ownerTokenHash: hashOwnerToken(ownerToken),
  }
  await bucket.putSnapshot(templateMetaKey(id), meta, {
    ...TEMPLATE_SNAPSHOT_OPTIONS,
    ifAbsent: true,
  })
  await syncIndex(bucket, meta)
  return {
    meta,
    template: toPublicTemplate(meta, content.itinerary),
    ownerToken,
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

/** Premier emplacement libre à partir de `from`, écrit en `ifAbsent`. */
async function claimVersion(
  bucket: TemplateBucket,
  id: string,
  from: number,
  content: TemplateContent,
): Promise<number> {
  for (let version = from; version < from + VERSION_SLOTS; version++) {
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

/**
 * Nouvelle version du contenu. Les anciennes restent lisibles : ceux qui ont
 * repris le modèle s'en serviront comme base de fusion (V1.1).
 *
 * La version s'écrit en `ifAbsent`, puis la méta en `ifMatch`. Si la méta a
 * bougé entre-temps (un changement de visibilité, une autre mise à jour), on
 * relit une fois et on recommence — sans réécrire la version si elle est
 * toujours la suivante. Au second conflit : `TemplateStoreError('conflict')`.
 */
export async function updateTemplate(
  bucket: TemplateBucket,
  id: string,
  token: string,
  input: UpdateTemplateInput,
): Promise<TemplateWriteResult> {
  const at = (input.now ?? new Date()).toISOString()
  let written: { version: number; content: TemplateContent } | null = null
  try {
    for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
      const { meta, etag } = await loadOwnedMeta(bucket, id, token)
      if (meta.retiredAt !== null) throw new TemplateStoreError('retired')

      // Une autre mise à jour a publié par-dessus notre emplacement : notre
      // version passerait pour plus ancienne que l'actuelle. On en reprend un.
      if (written && written.version <= meta.version) {
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
      }

      const next: TemplateMeta = {
        ...meta,
        ...contentFields(written.content),
        version: written.version,
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
      await syncIndex(bucket, next)
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
  now?: Date
}

/** Visibilité et prénom : la méta change, pas le contenu ni sa version. */
export async function patchTemplate(
  bucket: TemplateBucket,
  id: string,
  token: string,
  patch: TemplatePatch,
): Promise<TemplateWriteResult> {
  const at = (patch.now ?? new Date()).toISOString()
  for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
    const { meta, etag } = await loadOwnedMeta(bucket, id, token)
    if (meta.retiredAt !== null) throw new TemplateStoreError('retired')

    const indexable = patch.indexable ?? meta.indexable
    const authorName =
      patch.authorName === undefined
        ? meta.authorName
        : cleanAuthor(patch.authorName)
    // Rien ne change : pas d'écriture, et `updatedAt` ne bouge pas.
    if (indexable === meta.indexable && authorName === meta.authorName) {
      return { meta, template: await publicTemplateOf(bucket, meta) }
    }

    const next: TemplateMeta = { ...meta, indexable, authorName, updatedAt: at }
    try {
      await bucket.putSnapshot(templateMetaKey(id), next, {
        ...TEMPLATE_SNAPSHOT_OPTIONS,
        ifMatch: etag,
      })
    } catch (error) {
      if (isPreconditionFailure(error)) continue
      throw error
    }
    await syncIndex(bucket, next)
    return { meta: next, template: await publicTemplateOf(bucket, next) }
  }
  throw new TemplateStoreError('conflict')
}

// ── Retrait ───────────────────────────────────────────────────────────────────

/**
 * Pierre tombale : la méta reste pour que les lectures répondent 410 et que
 * le slug ne serve jamais à un autre modèle. Elle ne garde ni titre, ni
 * prénom, ni villes — rien de ce que l'auteur a écrit. Le jeton (son
 * empreinte) reste, pour qu'un second retrait soit encore autorisé.
 */
function toTombstone(meta: TemplateMeta, at: string): TemplateMeta {
  return {
    ...meta,
    title: '',
    authorName: null,
    cities: [],
    updatedAt: at,
    retiredAt: at,
  }
}

/**
 * Retire un modèle : pierre tombale, versions supprimées, sortie de l'index.
 * Idempotent : un second appel refait le ménage sans erreur, ce qui rattrape
 * une suppression ou un index qui avait échoué la première fois.
 */
export async function retireTemplate(
  bucket: TemplateBucket,
  id: string,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
    const { meta, etag } = await loadOwnedMeta(bucket, id, token)
    let tombstone = meta
    if (meta.retiredAt === null) {
      tombstone = toTombstone(meta, now.toISOString())
      try {
        await bucket.putSnapshot(templateMetaKey(id), tombstone, {
          ...TEMPLATE_SNAPSHOT_OPTIONS,
          ifMatch: etag,
        })
      } catch (error) {
        if (isPreconditionFailure(error)) continue
        throw error
      }
    }
    // Les emplacements au-delà de la version publiée couvrent un éventuel
    // orphelin ; supprimer une clé absente ne coûte rien.
    const keys: string[] = []
    for (let n = 1; n <= tombstone.version + VERSION_SLOTS; n++) {
      keys.push(templateVersionKey(id, n))
    }
    await discard(bucket, keys)
    await syncIndex(bucket, tombstone)
    return
  }
  throw new TemplateStoreError('conflict')
}

// ── Lectures publiques ────────────────────────────────────────────────────────

export type TemplateReadResult =
  | { status: 'active'; template: PublicTemplate }
  | { status: 'retired' }
  | { status: 'missing' }

export type TemplateVersionReadResult =
  | { status: 'active'; version: number; itinerary: DayItinerary[] }
  | { status: 'retired' }
  | { status: 'missing' }

async function resolveTemplate(
  bucket: TemplateBucket,
  meta: TemplateMeta,
): Promise<TemplateReadResult> {
  if (meta.retiredAt !== null) return { status: 'retired' }
  const version = await loadVersion(bucket, meta.id, meta.version)
  if (!version) {
    console.error(`Version ${meta.version} absente du modèle ${meta.id}.`)
    return { status: 'missing' }
  }
  return {
    status: 'active',
    template: toPublicTemplate(meta, version.itinerary),
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
 * Une version précise, base de fusion de la V1.1. Jamais au-delà de la
 * version publiée : une mise à jour en cours d'écriture n'est pas une version.
 */
export async function readTemplateVersion(
  bucket: TemplateBucket,
  id: string,
  version: number,
): Promise<TemplateVersionReadResult> {
  if (!isTemplateId(id) || !isPositiveInteger(version)) {
    return { status: 'missing' }
  }
  const stored = await loadMeta(bucket, id)
  if (!stored) return { status: 'missing' }
  if (stored.meta.retiredAt !== null) return { status: 'retired' }
  if (version > stored.meta.version) return { status: 'missing' }
  const data = await loadVersion(bucket, id, version)
  if (!data) return { status: 'missing' }
  return { status: 'active', version: data.version, itinerary: data.itinerary }
}

/**
 * Le modèle d'une page tripbrain.fr. **Seulement s'il est listé** : un slug
 * se devine (`japon-14-jours-tokyo`), et un modèle « lien seulement » ne doit
 * être joignable que par son id. Un modèle retiré qui était listé répond
 * `retired` (410) ; un modèle qui n'a jamais eu de page reste `missing`.
 */
export async function readTemplateBySlug(
  bucket: TemplateBucket,
  slug: string,
): Promise<TemplateReadResult> {
  if (!isTemplateSlug(slug)) return { status: 'missing' }
  const pointer = await bucket.getSnapshot(templateSlugKey(slug), READ_OPTIONS)
  const id = pointer && isRecord(pointer.data) ? pointer.data.id : null
  if (!isTemplateId(id)) return { status: 'missing' }
  const stored = await loadMeta(bucket, id)
  // Le slug doit être celui du modèle : une publication interrompue peut
  // avoir réservé un slug sans jamais écrire sa méta.
  if (!stored || stored.meta.slug !== slug) return { status: 'missing' }
  if (!isListed({ ...stored.meta, retiredAt: null })) {
    return { status: 'missing' }
  }
  return resolveTemplate(bucket, stored.meta)
}

/** Les modèles listés, du plus récemment modifié au plus ancien. */
export async function readIndex(
  bucket: TemplateBucket,
): Promise<TemplateIndexEntry[]> {
  const snapshot = await bucket.getSnapshot(TEMPLATE_INDEX_KEY, READ_OPTIONS)
  if (!snapshot) return []
  const entries = parseIndex(snapshot.data)
  if (!entries) {
    console.error('Index des modèles illisible.')
    return []
  }
  return entries
}
