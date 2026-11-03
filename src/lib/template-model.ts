/**
 * Itinéraires modèles : le contrat partagé entre l'app, l'API et le site vitrine.
 *
 * Un modèle est un voyage publié par son auteur, nettoyé de ce qui est
 * personnel (voir `template-clean.ts`), que d'autres reprennent à leurs dates
 * (voir `template-redate.ts`). Ce module ne contient que des types et de la
 * logique pure : identifiants, pays, slug, visibilité. Il tourne aussi bien
 * dans le navigateur que sur le serveur.
 *
 * Conception : `docs/itineraire-modele-technique.md`.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import { isIsoDate } from '@/lib/iso-date'

// ── Identifiants ──────────────────────────────────────────────────────────────

/**
 * Base32 de Crockford en minuscules : ni `i`, `l`, `o` ni `u`, rien qui se
 * confonde à la lecture. 32 symboles, donc 5 bits par caractère.
 */
export const TEMPLATE_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** 16 caractères = 80 bits : l'id est public, mais ne se devine pas. */
export const TEMPLATE_ID_LENGTH = 16

const TEMPLATE_ID = /^[0-9a-hjkmnp-tv-z]{16}$/

export function isTemplateId(value: unknown): value is string {
  return typeof value === 'string' && TEMPLATE_ID.test(value)
}

/** Nouvel id de modèle, tiré de `crypto.getRandomValues`. */
export function createTemplateId(): string {
  const bytes = new Uint8Array(TEMPLATE_ID_LENGTH)
  crypto.getRandomValues(bytes)
  // 256 est un multiple de 32 : le masque ne biaise aucun symbole.
  return Array.from(bytes, (byte) => TEMPLATE_ID_ALPHABET[byte & 31]).join('')
}

// ── Règles de visibilité ──────────────────────────────────────────────────────

/** En dessous, un modèle n'est jamais listé sur tripbrain.fr (décision du 3 nov. 2026). */
export const MIN_LISTED_DAYS = 2

/** Titre d'un modèle, borné comme celui d'un voyage de groupe. */
export const MAX_TEMPLATE_TITLE_LENGTH = 120

// ── Types ─────────────────────────────────────────────────────────────────────

/** Ce que l'auteur choisit de laisser partir, en plus du strict nécessaire. */
export interface TemplateOptions {
  /** Notes de journée et de transport (désactivé par défaut). */
  includeNotes: boolean
  /** Prix payés, affichés « à titre indicatif » (activé par défaut). */
  includePrices: boolean
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  includeNotes: false,
  includePrices: true,
}

/** Métadonnées stockées d'un modèle — jamais renvoyées telles quelles. */
export interface TemplateMeta {
  id: string
  /** Figé à la première publication. */
  slug: string
  /** 1 à la publication, +1 à chaque mise à jour du contenu. */
  version: number
  title: string
  authorName: string | null
  /** Pays principal, code ISO 3166-1 alpha-2 (`JP`). */
  country: string
  /** Interrupteur « Visible sur tripbrain.fr et Google » de l'auteur. */
  indexable: boolean
  includesNotes: boolean
  includesPrices: boolean
  dayCount: number
  cities: string[]
  /** Année du voyage de l'auteur, pour situer les prix (« 2026 »). */
  tripYear: number | null
  /** ISO 8601. */
  publishedAt: string
  /** ISO 8601 — dernière écriture (contenu ou réglages). */
  updatedAt: string
  /** ISO 8601 — modèle retiré par son auteur : il ne répond plus qu'en 410. */
  retiredAt: string | null
  /** SHA-256 (hex) du jeton propriétaire ; le jeton lui-même n'est jamais stocké. */
  ownerTokenHash: string
}

/** Ce que l'API publique renvoie d'un modèle en ligne. */
export interface PublicTemplate extends Omit<
  TemplateMeta,
  'ownerTokenHash' | 'retiredAt'
> {
  /** Visible sur tripbrain.fr et dans le sitemap. */
  listed: boolean
  /** Itinéraire déjà nettoyé, dans sa version `version`. */
  itinerary: DayItinerary[]
}

/** Une ligne de l'index des modèles listés (sitemap, pages pays). */
export interface TemplateIndexEntry {
  id: string
  slug: string
  title: string
  country: string
  dayCount: number
  cities: string[]
  updatedAt: string
}

/**
 * Côté auteur, sur `StoredTrip.publishedTemplate` : de quoi gérer le modèle
 * (A4) hors ligne. Le jeton ne quitte jamais l'appareil, sauf vers l'API.
 */
export interface PublishedTemplateInfo {
  id: string
  slug: string
  ownerToken: string
  version: number
  indexable: boolean
  includesNotes: boolean
  includesPrices: boolean
  authorName: string | null
  country: string
  /** ISO 8601. */
  publishedAt: string
  /** ISO 8601. */
  updatedAt: string
}

/**
 * Côté repreneur, sur `StoredTrip.origin` : d'où vient le voyage, et la
 * version du modèle telle qu'elle a été reprise — l'ancêtre commun dont la
 * V1.1 aura besoin pour proposer une mise à jour sans rien écraser.
 */
export interface TemplateOrigin {
  templateId: string
  version: number
  title: string
  authorName: string | null
  /** Date de départ choisie, `AAAA-MM-JJ`. */
  startDate: string
  /** Journées gardées, ids du modèle, dans l'ordre du modèle. */
  keptDayIds: string[]
  /** Modèle recalé et filtré au moment de la reprise. */
  base: DayItinerary[]
  /** Horodatage (ms) de la reprise. */
  takenAt: number
}

// ── Dérivations ───────────────────────────────────────────────────────────────

/** Un modèle apparaît sur tripbrain.fr s'il est indexable, assez long et en ligne. */
export function isListed(
  meta: Pick<TemplateMeta, 'indexable' | 'dayCount' | 'retiredAt'>,
): boolean {
  return (
    meta.indexable &&
    meta.dayCount >= MIN_LISTED_DAYS &&
    meta.retiredAt === null
  )
}

export function toPublicTemplate(
  meta: TemplateMeta,
  itinerary: DayItinerary[],
): PublicTemplate {
  const { ownerTokenHash: _hash, retiredAt: _retired, ...rest } = meta
  return { ...rest, listed: isListed(meta), itinerary }
}

export function toIndexEntry(meta: TemplateMeta): TemplateIndexEntry {
  return {
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    country: meta.country,
    dayCount: meta.dayCount,
    cities: meta.cities,
    updatedAt: meta.updatedAt,
  }
}

/** Villes dans l'ordre du voyage, sans doublon ni vide. */
export function templateCities(itinerary: readonly DayItinerary[]): string[] {
  const seen = new Set<string>()
  const cities: string[] = []
  for (const day of itinerary) {
    const city = day.city?.trim()
    if (!city) continue
    const key = city.toLocaleLowerCase('fr')
    if (seen.has(key)) continue
    seen.add(key)
    cities.push(city)
  }
  return cities
}

/** Année de la première date valide du voyage, ou `null`. */
export function tripYear(itinerary: readonly DayItinerary[]): number | null {
  const first = itinerary.find((day) => isIsoDate(day.date))
  return first ? Number(first.date.slice(0, 4)) : null
}

// ── Pays ──────────────────────────────────────────────────────────────────────

/** ISO 3166-1 alpha-2, plus `XK` (Kosovo), usage courant. */
export const COUNTRY_CODES = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'XK',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const

export type CountryCode = (typeof COUNTRY_CODES)[number]

const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_CODES)

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRY_SET.has(value)
}

let countryNames: Intl.DisplayNames | null = null

/** Nom français d'un pays : `JP` → « Japon ». Le code si l'environnement l'ignore. */
export function countryName(code: string): string {
  try {
    countryNames ??= new Intl.DisplayNames('fr', { type: 'region' })
    return countryNames.of(code) ?? code
  } catch {
    return code
  }
}

/** `JP` → `japon`, `CI` → `cote-d-ivoire`. */
export function countrySlug(code: string): string {
  return slugify(countryName(code))
}

/** Pays triés par nom français, pour le sélecteur de l'écran A3. */
export function countryOptions(): { code: CountryCode; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort(
    (a, b) => a.name.localeCompare(b.name, 'fr'),
  )
}

// ── Slug ──────────────────────────────────────────────────────────────────────

export const MAX_SLUG_LENGTH = 80

/** Texte → `mots-en-minuscules-sans-accents`, rien d'autre que `[a-z0-9-]`. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Coupe sur une frontière de mot, sans tiret final. */
function truncateSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug
  const cut = slug.slice(0, max + 1)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > 0 ? cut.slice(0, lastDash) : slug.slice(0, max)).replace(
    /-+$/,
    '',
  )
}

/**
 * `japon-14-jours-tokyo-kyoto-osaka` : pays, durée, trois premières villes.
 * Une ville sans caractère latin (東京) ne donne rien et est sautée ; le slug
 * reste valable avec le pays et la durée seuls.
 */
export function templateSlug(input: {
  country: string
  dayCount: number
  cities: readonly string[]
}): string {
  const head = `${countrySlug(input.country)}-${input.dayCount}-jours`
  const cities = input.cities
    .map(slugify)
    .filter(Boolean)
    .filter((city, index, all) => all.indexOf(city) === index)
    .slice(0, 3)
  return truncateSlug([head, ...cities].join('-'), MAX_SLUG_LENGTH)
}

/** Variante d'un slug déjà pris : `…-osaka` → `…-osaka-2`. */
export function suffixedSlug(slug: string, attempt: number): string {
  if (attempt <= 1) return slug
  const suffix = `-${attempt}`
  return truncateSlug(slug, MAX_SLUG_LENGTH - suffix.length) + suffix
}

const TEMPLATE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Slug de modèle : il contient toujours `-<n>-jours`, ce qu'un slug de pays
 * (`japon`, `cote-d-ivoire`) ne contient jamais — c'est ce qui permet à
 * `/itineraires/[slug]` de servir les deux.
 */
export function isTemplateSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_SLUG_LENGTH &&
    TEMPLATE_SLUG.test(value) &&
    /(^|-)\d+-jours(-|$)/.test(value)
  )
}
