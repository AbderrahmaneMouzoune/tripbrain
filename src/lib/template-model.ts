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

// ── Bornes du contenu ─────────────────────────────────────────────────────────
//
// La publication est publique et sans compte : le serveur refuse ce qu'aucun
// vrai voyage n'atteint, pour qu'un seul envoi ne puisse ni épuiser sa mémoire
// ni gonfler l'index que partagent tous les modèles.

/** Six mois de voyage : le générateur s'arrête à 30 jours. */
export const MAX_TEMPLATE_DAYS = 180

/** Activités d'une journée : un vrai voyage en compte rarement plus de dix. */
export const MAX_TEMPLATE_DAY_ACTIVITIES = 100

/**
 * Villes gardées dans la méta et l'index : de quoi décrire le parcours, pas
 * plus. L'index est relu en entier par le sitemap ; une entrée doit y rester
 * petite quel que soit le voyage.
 */
export const MAX_TEMPLATE_CITIES = 10

/** Nom de ville gardé dans la méta et l'index, en caractères. */
export const MAX_TEMPLATE_CITY_LENGTH = 80

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

/**
 * Métadonnées stockées d'un modèle en ligne — jamais renvoyées telles quelles.
 * Retiré, il n'en reste qu'une `RetiredTemplateMeta`.
 */
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
  /** Toujours `null` : c'est ce qui le distingue d'une `RetiredTemplateMeta`. */
  retiredAt: null
  /** SHA-256 (hex) du jeton propriétaire ; le jeton lui-même n'est jamais stocké. */
  ownerTokenHash: string
}

/**
 * Pierre tombale d'un modèle retiré, par son auteur ou par l'opérateur. Elle
 * reste pour que les lectures répondent 410, que le slug ne serve jamais à un
 * autre modèle et qu'un second retrait soit encore autorisé. Ni titre, ni
 * prénom, ni année, ni réglages, ni les champs pays et villes n'y restent.
 *
 * Le slug, en revanche, reste pour toujours, ici et dans `slugs/<slug>` : il
 * porte le pays (son nom français), le nombre de jours et jusqu'à 3 villes
 * saisies par l'auteur, mises en forme de slug (`japon-3-jours-tokyo-kyoto`).
 */
export interface RetiredTemplateMeta {
  id: string
  /** Reste réservé : il ne désignera jamais un autre modèle. */
  slug: string
  /** Dernière version publiée : un second retrait sait quelles versions supprimer. */
  version: number
  /** ISO 8601. */
  publishedAt: string
  /** ISO 8601 — le modèle ne répond plus qu'en 410. */
  retiredAt: string
  /** SHA-256 (hex) du jeton propriétaire. */
  ownerTokenHash: string
  /**
   * Le modèle était-il listé au moment du retrait ? Par son slug, il répond
   * alors 410 (sa page sort des moteurs de recherche), sinon 404 : un 410
   * trahirait qu'un modèle « lien seulement » a existé.
   */
  wasListed: boolean
}

/** Ce que contient `templates/<id>/meta` : un modèle en ligne, ou sa pierre tombale. */
export type StoredTemplateMeta = TemplateMeta | RetiredTemplateMeta

export function isRetiredTemplateMeta(
  meta: StoredTemplateMeta,
): meta is RetiredTemplateMeta {
  return meta.retiredAt !== null
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
  /**
   * Année du voyage de l'auteur (`PublicTemplate.tripYear`), pour situer les
   * prix repris : « prix relevés en 2025, à titre indicatif ». `null` si le
   * modèle n'avait aucune date.
   */
  tripYear: number | null
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
export function isListed(meta: {
  indexable: boolean
  dayCount: number
  retiredAt: string | null
}): boolean {
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

/**
 * La ligne d'index d'un modèle. Les villes y sont rebornées : une méta écrite
 * avant les bornes ne doit pas pouvoir gonfler l'index partagé.
 */
export function toIndexEntry(meta: TemplateMeta): TemplateIndexEntry {
  return {
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    country: meta.country,
    dayCount: meta.dayCount,
    cities: meta.cities.slice(0, MAX_TEMPLATE_CITIES).map(cityLabel),
    updatedAt: meta.updatedAt,
  }
}

/**
 * Nom de ville borné, coupé sur un caractère entier : `slice` seul pourrait
 * couper un emoji en deux.
 */
function cityLabel(city: string): string {
  const trimmed = city.trim()
  if (trimmed.length <= MAX_TEMPLATE_CITY_LENGTH) return trimmed
  return Array.from(trimmed).slice(0, MAX_TEMPLATE_CITY_LENGTH).join('').trim()
}

/**
 * Villes dans l'ordre du voyage, sans doublon ni vide : les
 * `MAX_TEMPLATE_CITIES` premières, chacune bornée à `MAX_TEMPLATE_CITY_LENGTH`.
 */
export function templateCities(itinerary: readonly DayItinerary[]): string[] {
  const seen = new Set<string>()
  const cities: string[] = []
  for (const day of itinerary) {
    if (cities.length === MAX_TEMPLATE_CITIES) break
    const city = cityLabel(day.city ?? '')
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

/**
 * Lettres latines que NFKD ne décompose pas : sans elles, `Đà Nẵng` donnerait
 * `a-nang` et `Wrocław` `wroc-aw` — sur une URL figée pour toujours.
 */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  đ: 'd',
  ð: 'd',
  ł: 'l',
  ø: 'o',
  œ: 'oe',
  æ: 'ae',
  ß: 'ss',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
  ŋ: 'n',
  ŧ: 't',
}

const UNDECOMPOSED_LETTER = /[đðłøœæßþıħŋŧ]/g

/** Texte → `mots-en-minuscules-sans-accents`, rien d'autre que `[a-z0-9-]`. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(UNDECOMPOSED_LETTER, (letter) => TRANSLITERATIONS[letter] ?? '-')
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

/**
 * Variante tirée de l'id du modèle, quand les suffixes lisibles sont tous
 * pris : `…-osaka-k3x9m2`. L'id est en `[0-9a-z]`, le résultat reste un slug
 * valide, et la tête `<pays>-<n>-jours` n'est jamais coupée (80 caractères
 * laissent toujours de la place). Avec l'id entier (`length` = 16), deux
 * modèles ne peuvent plus tomber sur le même slug.
 */
export function idSuffixedSlug(slug: string, id: string, length = 6): string {
  const suffix = `-${id.slice(0, length)}`
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
