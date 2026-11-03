// Générateurs pseudo-aléatoires à graine pour les tests de propriétés des
// itinéraires modèles (`template-properties.test.ts`), sans dépendance.
//
// Deux familles :
//   • des voyages réalistes mais tirés au hasard : champs facultatifs absents
//     ou présents, hôtels répétés chaque nuit ou portés par la seule journée
//     d'arrivée, trajets aux horaires `HH:MM`, ISO ou « à espace », dates
//     vides ou illisibles, villes accentuées, CJK ou à emoji, gares qui
//     contiennent le nom de la ville, références et liens de réservation
//     privés, notes truffées de téléphones, e-mails et codes ;
//   • des valeurs JSON franchement hostiles (types faux, `NaN`, `__proto__`…).
//
// Tout passe par un `Rng` à graine : un même `FUZZ_SEED` rejoue exactement
// les mêmes cas. `checkProperty` minimise le contre-exemple avant d'échouer.
//
// Le calcul de dates de référence (`refDayNumber`, `refIsoDate`…) est
// recodé ici sans `Date` (algorithme civil de H. Hinnant) : il sert d'oracle
// à `iso-date.ts`, qu'il ne doit donc pas réutiliser.

import type {
  Accommodation,
  Activity,
  DayImage,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'

// ── Réglages ──────────────────────────────────────────────────────────────────

function positiveInt(value: string | undefined): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Cas par propriété : ≈ 200 en CI, `FUZZ_RUNS=5000` en local. */
export const FUZZ_RUNS = positiveInt(process.env.FUZZ_RUNS) ?? 200

/** Graine de la campagne : le même texte rejoue les mêmes cas. */
export const FUZZ_SEED = process.env.FUZZ_SEED?.trim() || 'tripbrain-modeles'

// ── Générateur pseudo-aléatoire ───────────────────────────────────────────────

export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number
  /** Entier dans [min, max], bornes comprises. */
  int(min: number, max: number): number
  bool(probability?: number): boolean
  pick<T>(items: readonly T[]): T
  /** `make()` avec la probabilité donnée, sinon `undefined`. */
  maybe<T>(probability: number, make: () => T): T | undefined
  /** Chaque élément gardé avec la probabilité donnée, ordre conservé. */
  subset<T>(items: readonly T[], probability?: number): T[]
  shuffle<T>(items: readonly T[]): T[]
}

/** FNV-1a 32 bits sur des morceaux de texte : une graine par cas. */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5
  for (const part of parts) {
    const text = String(part)
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193)
    }
    // Séparateur : ['ab', 'c'] et ['a', 'bc'] ne donnent pas la même graine.
    hash ^= 0xff
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Mulberry32 : 32 bits d'état, assez pour du test, reproductible partout. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1))
  const rng: Rng = {
    next,
    int,
    bool: (probability = 0.5) => next() < probability,
    pick: (items) => items[int(0, items.length - 1)],
    maybe: (probability, make) => (next() < probability ? make() : undefined),
    subset: (items, probability = 0.5) =>
      items.filter(() => next() < probability),
    shuffle: (items) => {
      const copy = [...items]
      for (let index = copy.length - 1; index > 0; index--) {
        const other = int(0, index)
        ;[copy[index], copy[other]] = [copy[other], copy[index]]
      }
      return copy
    },
  }
  return rng
}

// ── Exécution d'une propriété ─────────────────────────────────────────────────

export interface PropertyOptions<T> {
  /** Nombre de cas ; `FUZZ_RUNS` par défaut. */
  runs?: number
  /**
   * Graine figée, indépendante de `FUZZ_SEED` : pour un défaut connu marqué
   * `it.fails`, qui doit échouer à coup sûr tant qu'il n'est pas corrigé.
   */
  seed?: string
  /** Un candidat de minimisation n'est retenu que s'il reste une entrée valide. */
  shrinkValid?: (value: T) => boolean
  /** Évaluations de la propriété accordées à la minimisation. */
  shrinkBudget?: number
}

function runProperty<T>(property: (value: T) => void, value: T): unknown {
  try {
    property(value)
    return null
  } catch (error) {
    return error ?? new Error('exception sans valeur')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Copie d'un objet sans une clé, `__proto__` compris (clé propre). */
function withoutKey(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const other of Object.keys(value)) {
    if (other !== key) defineOwn(copy, other, value[other])
  }
  return copy
}

function withKey(
  value: Record<string, unknown>,
  key: string,
  item: unknown,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const other of Object.keys(value)) {
    defineOwn(copy, other, other === key ? item : value[other])
  }
  return copy
}

/** Pose une clé propre, même `__proto__`, sans passer par le setter hérité. */
export function defineOwn(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

/** Candidats plus petits, du plus agressif au plus fin, paresseusement. */
function* shrinkCandidates(value: unknown): Generator<unknown> {
  if (Array.isArray(value)) {
    for (
      let size = Math.max(1, Math.floor(value.length / 2));
      size >= 1;
      size = Math.floor(size / 2)
    ) {
      for (let start = 0; start + size <= value.length; start += size) {
        yield [...value.slice(0, start), ...value.slice(start + size)]
      }
      if (size === 1) break
    }
    for (let index = 0; index < value.length; index++) {
      for (const smaller of shrinkCandidates(value[index])) {
        const copy = [...value]
        copy[index] = smaller
        yield copy
      }
    }
    return
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) yield withoutKey(value, key)
    for (const key of Object.keys(value)) {
      for (const smaller of shrinkCandidates(value[key])) {
        yield withKey(value, key, smaller)
      }
    }
    return
  }
  if (typeof value === 'string' && value.length > 0) {
    // Comme un tableau de points de code : on retire des tranches de plus en
    // plus fines, sans jamais couper un emoji en deux.
    const chars = Array.from(value)
    yield ''
    for (
      let size = Math.max(1, Math.floor(chars.length / 2));
      size >= 1;
      size = Math.floor(size / 2)
    ) {
      for (let start = 0; start + size <= chars.length; start += size) {
        yield [...chars.slice(0, start), ...chars.slice(start + size)].join('')
      }
      if (size === 1) break
    }
    return
  }
  if (typeof value === 'number' && value !== 0 && Number.isFinite(value)) {
    yield 0
    if (!Number.isInteger(value)) yield Math.trunc(value)
    if (Math.abs(value) > 1) yield Math.trunc(value / 2)
    return
  }
  if (value === true) yield false
}

function minimise<T>(
  value: T,
  property: (value: T) => void,
  options: PropertyOptions<T>,
): { value: T; error: unknown; steps: number } {
  let current = value
  let error = runProperty(property, value)
  let budget = options.shrinkBudget ?? 6000
  let steps = 0
  let improved = true
  while (improved && budget > 0) {
    improved = false
    for (const candidate of shrinkCandidates(current)) {
      if (--budget <= 0) break
      if (options.shrinkValid && !options.shrinkValid(candidate as T)) continue
      const failure = runProperty(property, candidate as T)
      if (failure) {
        current = candidate as T
        error = failure
        steps++
        improved = true
        break
      }
    }
  }
  return { value: current, error, steps }
}

/** JSON lisible, qui montre aussi ce que JSON tait (`undefined`, `NaN`…). */
export function describeValue(value: unknown, max = 6000): string {
  const text = JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (item === undefined) return '«undefined»'
      if (typeof item === 'number' && !Number.isFinite(item)) {
        return `«${String(item)}»`
      }
      if (Object.is(item, -0)) return '«-0»'
      if (typeof item === 'bigint') return `«${item}n»`
      return item
    },
    1,
  )
  return text.length > max ? `${text.slice(0, max)}… (tronqué)` : text
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}

/**
 * Vérifie `property` sur `runs` valeurs tirées par `generate`. Au premier
 * échec, minimise le contre-exemple et lève une erreur qui donne la graine,
 * le numéro du cas et l'entrée minimale : `FUZZ_SEED=<graine>` rejoue tout.
 */
export function checkProperty<T>(
  name: string,
  generate: (rng: Rng) => T,
  property: (value: T) => void,
  options: PropertyOptions<T> = {},
): void {
  const runs = options.runs ?? FUZZ_RUNS
  const seed = options.seed ?? FUZZ_SEED
  for (let run = 0; run < runs; run++) {
    const caseSeed = hashSeed(seed, name, run)
    const value = generate(createRng(caseSeed))
    const failure = runProperty(property, value)
    if (!failure) continue
    const shrunk = minimise(value, property, options)
    const message = [
      `Propriété « ${name} » violée au cas n°${run + 1}/${runs}.`,
      `Rejouer : FUZZ_SEED=${JSON.stringify(seed)} (graine du cas : ${caseSeed}).`,
      `Erreur sur l'entrée d'origine : ${errorText(failure)}`,
      `Erreur sur l'entrée minimisée : ${errorText(shrunk.error)}`,
      `Contre-exemple minimisé (${shrunk.steps} réductions) :`,
      describeValue(shrunk.value),
    ].join('\n')
    throw new Error(message)
  }
}

// ── Dates de référence (sans `Date`) ──────────────────────────────────────────

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}

/** Jours depuis le 1970-01-01, calendrier grégorien proleptique. */
export function refDayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = floorDiv(y, 400)
  const yoe = y - era * 400
  const doy = floorDiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy
  return era * 146097 + doe - 719468
}

export function refCivil(dayNumber: number): {
  year: number
  month: number
  day: number
} {
  const z = dayNumber + 719468
  const era = floorDiv(z, 146097)
  const doe = z - era * 146097
  const yoe = floorDiv(
    doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096),
    365,
  )
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100))
  const mp = floorDiv(5 * doy + 2, 153)
  const day = doy - floorDiv(153 * mp + 2, 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day }
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function daysInMonth(year: number, month: number): number {
  return [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1]
}

/** Oracle de `isIsoDate` : `AAAA-MM-JJ`, chiffres ASCII, date qui existe. */
export function refIsIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [match[1], match[2], match[3]].map(Number)
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  )
}

export const MIN_DAY_NUMBER = refDayNumber(0, 1, 1)
export const MAX_DAY_NUMBER = refDayNumber(9999, 12, 31)

/** Jour → `AAAA-MM-JJ` ; seulement entre 0000-01-01 et 9999-12-31. */
export function refIsoDate(dayNumber: number): string {
  const { year, month, day } = refCivil(dayNumber)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function refToDayNumber(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return refDayNumber(year, month, day)
}

/**
 * Oracle du §3.2.3 : une date `AAAA-MM-JJ`, ou une date-heure
 * `AAAA-MM-JJTHH:MM…` ou `AAAA-MM-JJ HH:MM…`, glisse de `offset` jours ;
 * l'heure reste. Tout le reste revient tel quel.
 */
export function refShiftValue(value: string, offset: number): string {
  if (offset === 0) return value
  const match =
    /^([0-9]{4}-[0-9]{2}-[0-9]{2})(T.*| [0-9]{2}:[0-9]{2}.*)?$/.exec(value)
  if (!match || !refIsIsoDate(match[1])) return value
  return refIsoDate(refToDayNumber(match[1]) + offset) + (match[2] ?? '')
}

export function refShiftDeep<T>(value: T, offset: number): T {
  if (typeof value === 'string') return refShiftValue(value, offset) as T
  if (Array.isArray(value)) {
    return value.map((item: unknown) => refShiftDeep(item, offset)) as T
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      defineOwn(copy, key, refShiftDeep(item, offset))
    }
    return copy as T
  }
  return value
}

// ── Dates tirées ──────────────────────────────────────────────────────────────

/** Une date valide entre deux années, avec un faible penchant pour les bords. */
export function randomIsoDate(
  rng: Rng,
  minYear = 1990,
  maxYear = 2090,
): string {
  const first = refDayNumber(minYear, 1, 1)
  const last = refDayNumber(maxYear, 12, 31)
  const edge = rng.int(0, 9)
  if (edge === 0) {
    // 29 février d'une année bissextile, ou 28 février d'une année qui ne l'est pas.
    let year = rng.int(minYear, maxYear)
    while (!isLeapYear(year) && year < maxYear) year++
    if (isLeapYear(year)) return refIsoDate(refDayNumber(year, 2, 29))
  }
  if (edge === 1)
    return refIsoDate(refDayNumber(rng.int(minYear, maxYear), 12, 31))
  if (edge === 2)
    return refIsoDate(refDayNumber(rng.int(minYear, maxYear), 1, 1))
  if (edge === 3) {
    const year = rng.int(minYear, maxYear)
    const month = rng.int(1, 12)
    return refIsoDate(refDayNumber(year, month, daysInMonth(year, month)))
  }
  return refIsoDate(rng.int(first, last))
}

/** Valeurs de date que des imports réels laissent passer, et qui n'en sont pas. */
export const INVALID_DATES = [
  '',
  ' ',
  '2026-02-30',
  '2026-02-29',
  '2025-13-01',
  '2026-00-10',
  '2026-04-31',
  '2026-5-1',
  '10/05/2026',
  'demain',
  'Jour 3',
  ' 2026-05-10',
  '2026-05-10 ',
  '2026-05-10 au matin',
  '２０２６-０５-１０',
  '2026‐05‐10',
  '20260510',
  'NaN-NaN-NaN',
  '15:00',
] as const

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function randomClock(rng: Rng): string {
  return `${pad2(rng.int(0, 23))}:${pad2(rng.pick([0, 5, 15, 30, 45, rng.int(0, 59)]))}`
}

/**
 * Horaire de transport ou d'hébergement autour d'une date : heure seule,
 * date-heure ISO (avec ou sans secondes, zone), forme à espace des tableurs,
 * date seule, vide, ou texte.
 */
export function randomDateTime(rng: Rng, date: string): string {
  const clock = randomClock(rng)
  switch (rng.int(0, 11)) {
    case 0:
      return clock
    case 1:
      return `${date}T${clock}`
    case 2:
      return `${date}T${clock}:00`
    case 3:
      return `${date}T${clock}:00Z`
    case 4:
      return `${date}T${clock}:00+09:00`
    case 5:
      return `${date} ${clock}`
    case 6:
      return `${date} ${clock}:00`
    case 7:
      return date
    case 8:
      return ''
    case 9:
      return rng.pick(['vers midi', 'matin', `${date} au matin`, '—'])
    case 10:
      return `${date}T${clock}:00.000-05:00`
    default:
      return `${date}T${clock}`
  }
}

// ── Textes ────────────────────────────────────────────────────────────────────

/** Villes : accents, CJK, emoji, doublons de casse, noms imbriqués (York / New York). */
export const CITY_POOL = [
  'Tokyo',
  'Kyoto',
  'Osaka',
  'Shin Osaka',
  'Nara',
  'Narita',
  'Hakone',
  'Nikko',
  'Beijing',
  'Shanghai',
  'Qingdao',
  'Xi’an',
  "Xi'an",
  'Lisbonne',
  'Sintra',
  'Porto',
  'Đà Nẵng',
  'Hội An',
  'Wrocław',
  'São Paulo',
  'Zürich',
  'Reykjavík',
  'Québec',
  'New York',
  'York',
  'Saint-Malo',
  "L'Isle-sur-la-Sorgue",
  '東京',
  '京都',
  '서울',
  'Москва',
  'Μύκονος',
  'Paris 🗼',
  '🏝️',
  'Kyōto',
  'TOKYO',
  'tokyo ',
  '  ',
  '',
] as const

/** Façons de nommer un lieu de trajet à partir d'une ville. */
const PLACE_PATTERNS: readonly ((city: string) => string)[] = [
  (city) => city,
  (city) => city,
  (city) => `Gare de ${city}`,
  (city) => `${city} Station`,
  (city) => `PKX ${city} Daxing Intl.`,
  (city) => `Aéroport international de ${city}`,
  (city) => `${city}-Hauptbahnhof`,
  (city) => city.toUpperCase(),
  (city) => ` ${city} `,
  (city) => `${city} (centre)`,
]

/** Lieux de trajet sans rapport avec les étapes. */
const UNRELATED_PLACES = [
  'Aéroport CDG',
  'Paris',
  'Gare Montparnasse',
  'Domicile',
  '',
  'Narita Airport Terminal 1',
  'HND',
] as const

export function randomPlaceFor(rng: Rng, city: string): string {
  return rng.bool(0.1)
    ? rng.pick(UNRELATED_PLACES)
    : rng.pick(PLACE_PATTERNS)(city)
}

/** Points de code tirés de blocs variés, surrogates compris. */
const CODE_POINT_RANGES: readonly [number, number][] = [
  [0x20, 0x7e], // ASCII imprimable
  [0x61, 0x7a], // minuscules
  [0x41, 0x5a], // majuscules
  [0x30, 0x39], // chiffres
  [0xc0, 0xff], // Latin-1 accentué
  [0x100, 0x17f], // Latin étendu (đ, ł, œ…)
  [0x300, 0x36f], // diacritiques combinants
  [0x370, 0x3ff], // grec
  [0x400, 0x4ff], // cyrillique
  [0x600, 0x6ff], // arabe
  [0x660, 0x669], // chiffres arabes
  [0x3040, 0x309f], // hiragana
  [0x4e00, 0x9fff], // CJK
  [0xac00, 0xd7a3], // hangul
  [0xff10, 0xff19], // chiffres pleine chasse
  [0x1f300, 0x1faff], // emoji (paires de substitution)
  [0x1f1e6, 0x1f1ff], // indicateurs régionaux (drapeaux)
  [0x20000, 0x2a6df], // CJK extension B (lettres hors BMP)
]

const SPECIAL_CHARS = [
  ' ',
  ' ',
  ' ',
  '\n',
  '\r\n',
  '\t',
  ' ',
  ' ',
  '\u2028',
  '‍',
  '️',
  '’',
  "'",
  '«',
  '»',
  '…',
  '—',
  '-',
  '.',
  ',',
  ':',
  '@',
  '+',
  '(',
  ')',
  '#',
  '/',
  '%',
  '&',
  '?',
  '=',
] as const

/** Texte Unicode quelconque (bien formé si `loneSurrogates` est faux). */
export function randomUnicode(
  rng: Rng,
  maxLength = 40,
  loneSurrogates = false,
): string {
  const length = rng.int(0, maxLength)
  let text = ''
  for (let index = 0; index < length; index++) {
    const kind = rng.int(0, 9)
    if (kind < 3) {
      text += rng.pick(SPECIAL_CHARS)
    } else if (loneSurrogates && kind === 3 && rng.bool(0.3)) {
      text += String.fromCharCode(rng.int(0xd800, 0xdfff))
    } else {
      const [low, high] = rng.pick(CODE_POINT_RANGES)
      text += String.fromCodePoint(rng.int(low, high))
    }
  }
  return text
}

export const BOOKING_REFERENCES = [
  'K7X-2PQ',
  '4021 553 117',
  'AB',
  'ABC123',
  'X9Z',
  'HB-77812-FR',
  '6WQ4ZL',
] as const

export function randomReference(rng: Rng): string {
  if (rng.bool(0.6)) return rng.pick(BOOKING_REFERENCES)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  let reference = ''
  for (let index = rng.int(2, 10); index > 0; index--) {
    reference += alphabet[rng.int(0, alphabet.length - 1)]
    if (rng.bool(0.1)) reference += rng.pick(['-', ' '])
  }
  return reference.trim()
}

/** Pages publiques : un modèle peut les garder. */
const PUBLIC_URLS = [
  'https://www.booking.com/hotel/jp/gracery-shinjuku.fr.html',
  'https://gracery.com/shinjuku/',
  'https://www.japan-guide.com/e/e3900.html',
  'https://www.sncf-connect.com/',
  'http://example.org/musee?lang=fr',
  'HTTPS://WWW.EXAMPLE.COM/Visite',
  ' https://www.example.com/espaces ',
  'https://例え.jp/パス',
] as const

/** Pages de réservation privées ou liens inutilisables chez un inconnu. */
const PRIVATE_URLS = [
  'https://secure.booking.com/confirmation.fr.html?aid=2311236',
  'https://www.easyjet.com/fr/ViewBooking?bookingReference=K7X2PQ&lastName=Dupont',
  'https://www.airfrance.fr/?bookingCode=6WQ4ZL&lastName=DUPONT',
  'https://www.sncf-connect.com/app/trips?reference=QWERTY&name=dupont',
  'https://fr.trip.com/hotels/ctorderdetail?orderid=1128734',
  'https://www.airbnb.fr/trips/v1/reservation-details/HMXYZ',
  'https://example.com/manage/booking',
  'https://user:pass@example.com/',
  'https://example.com/?token=abc',
  'javascript:alert(1)',
  'data:text/html,<b>hi</b>',
  'blob:https://app.tripbrain.fr/1234-5678',
  'ftp://example.com/billet.pdf',
  'mailto:hotel@example.com',
  'www.example.com',
  '/reservation/123',
  '',
  '   ',
] as const

/** Lien qui contient la référence de l'entité, écrite à la façon du site. */
export function urlWithReference(rng: Rng, reference: string): string {
  const compact = reference.replace(/[^\p{L}\p{N}]/gu, '')
  const written = rng.pick([
    reference,
    compact,
    compact.toLowerCase(),
    encodeURIComponent(reference),
    reference.replace(/ /g, '-'),
  ])
  return rng.pick([
    `https://hotel.example.com/stay/${written}`,
    `https://example.com/?r=${written}&x=1`,
    `https://example.com/voyage#${written}`,
  ])
}

export function randomBookingUrl(rng: Rng, reference?: string): string {
  if (reference && rng.bool(0.3)) return urlWithReference(rng, reference)
  return rng.bool(0.5) ? rng.pick(PUBLIC_URLS) : rng.pick(PRIVATE_URLS)
}

const IMAGE_URLS = [
  'https://images.pexels.com/photos/687450/pexels-photo-687450.jpeg',
  'http://example.com/a.png',
  ' https://example.com/espace.jpg',
  'HTTPS://EXAMPLE.COM/B.JPG',
  'blob:https://app.tripbrain.fr/4f1c',
  'data:image/png;base64,iVBORw0KGgo=',
  'file:///Users/moi/photo.jpg',
  '/images/local.jpg',
  'https://',
  'https:// espace.jpg',
  '',
] as const

export function randomImageUrls(rng: Rng): string[] {
  return Array.from({ length: rng.int(0, 4) }, () => rng.pick(IMAGE_URLS))
}

export function randomDayImages(rng: Rng): DayImage[] {
  return Array.from({ length: rng.int(0, 3) }, () => ({
    url: rng.pick(IMAGE_URLS),
    caption: rng.bool(0.8) ? rng.pick(['Vue', '', 'Lobby de l’hôtel']) : '',
  }))
}

// ── Notes sensibles ───────────────────────────────────────────────────────────

/** Ce qu'une note ne devrait pas publier sans que l'auteur l'ait vu. */
export const PHONES = [
  '+33 6 12 34 56 78',
  '06 12 34 56 78',
  '0612345678',
  '080-3312-4471',
  '+81 80-3312-4471',
  '+1 (212) 555-1234',
  '03-1234-5678',
  '+86 138 0013 8000',
] as const

export const EMAILS = [
  'kenji.tanaka@example.co.jp',
  'marie@hôtel.fr',
  'contact+voyage@gracery.com',
  'li_wei@qq.com',
] as const

export const CODES = ['4821', '1234#', 'A4471', '000917', '20480'] as const

const NOTE_WORDS = [
  'Kenji',
  'Marie-Claire',
  'M. Tanaka',
  'Mme Dupont',
  'nous attend',
  'à la gare',
  'appeler',
  'digicode',
  'code porte',
  'réserver',
  'Attention',
  'le temple Kiyomizu',
  'Gare de Lyon',
  'au Japon',
  'vers Osaka',
  'avec Li Wei',
  'Check-in',
  'https://www.example.com/Tanaka/Plan',
  'www.Example.com',
  'puis',
  'et',
  '2026-05-10',
  '15:00',
  'vol AF276',
  '🍣',
  '🙂👍🏽',
] as const

const CJK_SENTENCES = [
  '酒店地址上海市静安区巨鹿路弄',
  'ホテルまでタクシーで約十五分かかります',
  '门禁密码请在入住当天询问前台',
  '駅の改札を出て右に進み二つ目の信号を左',
  '서울역에서공항철도를타세요',
] as const

/**
 * Note de journée ou de transport : du texte ordinaire, parfois très long,
 * parfois sans espace (CJK), avec téléphones, e-mails et codes plantés.
 */
export function randomNote(rng: Rng): string {
  const parts: string[] = []
  const count = rng.bool(0.15) ? rng.int(20, 80) : rng.int(0, 12)
  const spaced = !rng.bool(0.2)
  for (let index = 0; index < count; index++) {
    const kind = rng.int(0, 12)
    if (kind === 0) parts.push(rng.pick(PHONES))
    else if (kind === 1) parts.push(rng.pick(EMAILS))
    else if (kind === 2) parts.push(rng.pick(CODES))
    else if (kind === 3) parts.push(rng.pick(CJK_SENTENCES))
    else if (kind === 4) parts.push(randomUnicode(rng, 12))
    else if (kind === 5) parts.push(rng.pick(['.', '\n', ' — ', '!', ':']))
    else if (kind === 6) parts.push(rng.pick(CITY_POOL))
    else parts.push(rng.pick(NOTE_WORDS))
  }
  return parts.join(spaced ? ' ' : '')
}

// ── Voyages ───────────────────────────────────────────────────────────────────

export interface ItineraryOptions {
  minDays?: number
  maxDays?: number
  /** Probabilité qu'une journée porte une date vide ou illisible. */
  invalidDateRate?: number
  /** Ids de journée en double (un import peut en produire). */
  duplicateDayIds?: boolean
  /** Clés que le type ignore (`confirmationCode`, `phone`…), comme un import JSON. */
  unknownKeys?: boolean
  /** Bornes des années du voyage de l'auteur. */
  minYear?: number
  maxYear?: number
}

const HOTEL_NAMES = [
  'Hotel Gracery Shinjuku',
  'Ryokan Yachiyo',
  '柃居 B&B',
  'Auberge du Lac',
  'Pousada da Alfama',
  'Hôtel Saint-Pierre',
  '',
] as const

/** Même hôtel écrit autrement : casse et espaces (§3.2.4). */
function hotelVariant(rng: Rng, name: string): string {
  return rng.pick([
    name,
    name,
    name.toLowerCase(),
    name.toUpperCase(),
    name.replace(/ /g, '  '),
    ` ${name} `,
  ])
}

const ACTIVITY_TYPES = [
  'visit',
  'transport',
  'food',
  'experience',
  'shopping',
] as const
const TRANSPORT_TYPES = ['train', 'car', 'plane', 'bus'] as const
const SOURCES = ['user', 'import', 'ai'] as const
const PRIORITIES = ['must', 'nice', 'optional'] as const
const DAY_TYPES = [
  'arrival',
  'departure',
  'free',
  'rest',
  'libre',
  'Repos',
  'visit',
  'transfer',
  '',
] as const
const TITLES = [
  'Arrivée',
  'Journée libre',
  'Repos',
  'Jours libres à la plage',
  'Visite du centre',
  'Excursion',
  'Départ',
  'Journée LIBRE',
  'Librement',
] as const

function randomCoordinates(rng: Rng): [number, number] {
  // `|| 0` : jamais de -0, que msgpack et JSON ramènent à 0.
  const round = (value: number) => Math.round(value * 1e4) / 1e4 || 0
  return [round(rng.next() * 180 - 90), round(rng.next() * 360 - 180)]
}

function randomTexts(rng: Rng, max = 4): string[] {
  return Array.from({ length: rng.int(0, max) }, () =>
    rng.bool(0.7) ? rng.pick(NOTE_WORDS) : randomUnicode(rng, 20),
  )
}

function unknownExtras(rng: Rng, enabled: boolean): Record<string, unknown> {
  if (!enabled || !rng.bool(0.3)) return {}
  return rng.pick([
    { confirmationCode: 'ZX81' },
    { phone: '+33 6 12 34 56 78' },
    { passportNumber: '18AB12345', internalId: 42 },
    { travellers: ['Kenji', 'Marie'] },
  ])
}

function randomActivity(
  rng: Rng,
  id: string,
  date: string,
  options: ItineraryOptions,
): Activity {
  const activity: Activity = {
    id,
    name: rng.bool(0.9) ? rng.pick(NOTE_WORDS) : randomUnicode(rng, 30),
    type: rng.pick(ACTIVITY_TYPES),
  }
  const set = <K extends keyof Activity>(
    probability: number,
    key: K,
    make: () => Activity[K],
  ) => {
    if (rng.bool(probability)) activity[key] = make()
  }
  set(0.5, 'description', () => randomNote(rng))
  set(0.4, 'duration', () => rng.pick(['1h', '2h30', '45 min', '']))
  set(0.4, 'coordinates', () => randomCoordinates(rng))
  set(0.3, 'openAt', () =>
    rng.pick(['09:00–17:00', '24h/24', randomDateTime(rng, date)]),
  )
  set(0.3, 'address', () => rng.pick(CITY_POOL) + ' ' + randomUnicode(rng, 10))
  set(0.3, 'bookingUrl', () => randomBookingUrl(rng))
  set(0.3, 'reservationRequired', () => rng.bool())
  set(0.4, 'price', () => rng.pick([0, 12.5, 50, 1999, rng.int(1, 500)]))
  set(0.4, 'currency', () => rng.pick(['EUR', 'JPY', 'CNY', '']))
  set(0.3, 'rating', () => rng.int(0, 50) / 10)
  set(0.3, 'tags', () => randomTexts(rng))
  set(0.4, 'status', () => rng.pick(['planned', 'done', 'skipped'] as const))
  set(0.3, 'tips', () => randomNote(rng))
  set(0.3, 'images', () => randomImageUrls(rng))
  set(0.2, 'source', () => rng.pick(SOURCES))
  set(0.2, 'priority', () => rng.pick(PRIORITIES))
  return { ...activity, ...unknownExtras(rng, options.unknownKeys ?? true) }
}

function randomTransport(
  rng: Rng,
  id: string,
  from: string,
  to: string,
  date: string,
  nextDate: string,
  options: ItineraryOptions,
): Transport {
  const reference = rng.maybe(0.4, () => randomReference(rng))
  const transport: Transport = { id, type: rng.pick(TRANSPORT_TYPES) }
  if (rng.bool(0.9)) transport.from = from
  if (rng.bool(0.9)) transport.to = to
  const set = <K extends keyof Transport>(
    probability: number,
    key: K,
    make: () => Transport[K],
  ) => {
    if (rng.bool(probability)) transport[key] = make()
  }
  set(0.7, 'departureTime', () => randomDateTime(rng, date))
  set(0.6, 'arrivalTime', () =>
    randomDateTime(rng, rng.bool(0.8) ? date : nextDate),
  )
  set(0.3, 'details', () => rng.pick(['Shinkansen Nozomi', 'Voiture 7', '']))
  set(0.3, 'departureAddress', () => randomPlaceFor(rng, from))
  set(0.3, 'duration', () => rng.pick(['2h15', '45 min', '']))
  set(0.4, 'provider', () => rng.pick(['JR', 'Air France', 'FlixBus', '']))
  set(0.4, 'bookingUrl', () => randomBookingUrl(rng, reference))
  if (reference !== undefined) transport.bookingReference = reference
  set(0.3, 'price', () => rng.pick([0, 89.9, 13320]))
  set(0.3, 'currency', () => rng.pick(['EUR', 'JPY']))
  set(0.3, 'seat', () => rng.pick(['12A', 'Voiture 7, place 45']))
  set(0.2, 'gate', () => 'B42')
  set(0.2, 'terminal', () => '2E')
  set(0.4, 'status', () =>
    rng.pick(['planned', 'booked', 'checked-in', 'completed'] as const),
  )
  set(0.4, 'notes', () => randomNote(rng))
  set(0.2, 'source', () => rng.pick(SOURCES))
  set(0.2, 'priority', () => rng.pick(PRIORITIES))
  return { ...transport, ...unknownExtras(rng, options.unknownKeys ?? true) }
}

function randomCheck(rng: Rng, date: string): string {
  return rng.pick([
    date,
    date,
    `${date}T15:00`,
    `${date}T11:00:00`,
    `${date} 14:00`,
    `${date}T15:00:00+09:00`,
    '',
    rng.pick(['à confirmer', '15:00']),
  ])
}

function randomAccommodation(
  rng: Rng,
  id: string,
  name: string,
  checkIn: string,
  checkOut: string,
  options: ItineraryOptions,
): Accommodation {
  const reference = rng.maybe(0.4, () => randomReference(rng))
  const accommodation: Accommodation = {
    id,
    name,
    address: rng.bool(0.8) ? `${name}, ${rng.pick(CITY_POOL)}` : '',
    bookingUrl: rng.bool(0.8) ? randomBookingUrl(rng, reference) : '',
    checkIn,
    checkOut,
  }
  if (reference !== undefined) accommodation.bookingReference = reference
  if (rng.bool(0.3)) accommodation.images = randomImageUrls(rng)
  if (rng.bool(0.4)) accommodation.price = rng.pick([143, 89.5, 0])
  if (rng.bool(0.4)) accommodation.currency = rng.pick(['EUR', 'JPY'])
  if (rng.bool(0.4)) {
    accommodation.status = rng.pick([
      'planned',
      'booked',
      'checked-in',
      'completed',
    ] as const)
  }
  if (rng.bool(0.1)) accommodation.source = rng.pick(SOURCES)
  if (rng.bool(0.1)) accommodation.priority = rng.pick(PRIORITIES)
  return {
    ...accommodation,
    ...unknownExtras(rng, options.unknownKeys ?? true),
  }
}

interface Stop {
  city: string
  first: number
  nights: number
}

function randomStops(rng: Rng, dayCount: number): Stop[] {
  const stops: Stop[] = []
  let first = 0
  while (first < dayCount) {
    const nights = Math.min(dayCount - first, rng.int(1, 4))
    // Retour dans une ville déjà vue (Tokyo, Kyoto, Tokyo), ou variante d'écriture.
    const city =
      stops.length > 1 && rng.bool(0.15)
        ? rng.pick(stops).city
        : rng.pick(CITY_POOL)
    stops.push({ city, first, nights })
    first += nights
  }
  return stops
}

/**
 * Un voyage réaliste mais tiré au hasard. Les dates suivent le voyage, sauf
 * quelques-unes vides, illisibles ou en désordre ; les hôtels suivent l'une
 * des deux conventions (répété chaque nuit, ou porté par la journée
 * d'arrivée), parfois mêlées ; les trajets sont rangés au jour du départ, au
 * jour d'arrivée, ou aux deux.
 */
export function randomItinerary(
  rng: Rng,
  options: ItineraryOptions = {},
): DayItinerary[] {
  const minDays = options.minDays ?? 1
  const maxDays = options.maxDays ?? 14
  const dayCount = rng.bool(0.85)
    ? rng.int(minDays, Math.min(maxDays, Math.max(minDays, 8)))
    : rng.int(minDays, maxDays)
  const invalidDateRate = options.invalidDateRate ?? 0.08
  const start = refToDayNumber(
    randomIsoDate(rng, options.minYear ?? 1990, options.maxYear ?? 2090),
  )
  const stops = randomStops(rng, dayCount)
  const cityOf = (index: number) =>
    stops.find(
      (stop) => index >= stop.first && index < stop.first + stop.nights,
    )?.city ?? ''
  const isoOf = (index: number) => refIsoDate(start + index)
  const disordered = rng.bool(0.05)

  const days: DayItinerary[] = Array.from({ length: dayCount }, (_, index) => {
    const date = rng.bool(invalidDateRate)
      ? rng.pick(INVALID_DATES)
      : disordered && rng.bool(0.3)
        ? refIsoDate(start + rng.int(-3, dayCount + 3))
        : isoOf(index)
    const idKind = rng.int(0, 19)
    const id =
      idKind === 0
        ? isoOf(index) // un id qui a la forme d'une date (§3.2.3)
        : idKind === 1
          ? `jour ${index + 1} ✈️`
          : idKind === 2 && options.duplicateDayIds && index > 0
            ? `day-${rng.int(1, index)}`
            : `day-${index + 1}`
    const day: DayItinerary = {
      id,
      date,
      dayNumber: rng.bool(0.9) ? index + 1 : rng.int(-2, 40),
      city: cityOf(index),
      title: rng.bool(0.7)
        ? `${rng.pick(TITLES)} ${rng.bool(0.5) ? cityOf(index) : ''}`.trim()
        : randomUnicode(rng, 30),
      activities: Array.from(
        { length: rng.bool(0.9) ? rng.int(0, 5) : rng.int(6, 14) },
        (_, k) =>
          randomActivity(
            rng,
            rng.bool(0.05) ? isoOf(index) : `act-${index + 1}-${k + 1}`,
            isoOf(index),
            options,
          ),
      ),
      coordinates: randomCoordinates(rng),
    }
    const set = <K extends keyof DayItinerary>(
      probability: number,
      key: K,
      make: () => DayItinerary[K],
    ) => {
      if (rng.bool(probability)) day[key] = make()
    }
    set(0.4, 'highlights', () => randomTexts(rng))
    set(0.3, 'foodRecommendations', () => randomTexts(rng))
    set(0.3, 'walkingDistance', () => rng.pick(['6 km', '', '12 000 pas']))
    set(0.45, 'notes', () => randomNote(rng))
    set(0.2, 'packingTips', () => randomTexts(rng))
    set(0.4, 'dayType', () => rng.pick(DAY_TYPES))
    set(0.4, 'tips', () => randomTexts(rng))
    set(0.3, 'images', () => randomDayImages(rng))
    set(0.1, 'source', () => rng.pick(SOURCES))
    set(0.1, 'priority', () => rng.pick(PRIORITIES))
    return { ...day, ...unknownExtras(rng, options.unknownKeys ?? true) }
  })

  // Hébergements, étape par étape.
  stops.forEach((stop, stopIndex) => {
    const convention = rng.pick([
      'arrival',
      'arrival',
      'every',
      'every',
      'mixed',
      'none',
    ] as const)
    if (convention === 'none') return
    const name = rng.pick(HOTEL_NAMES)
    const checkIn = randomCheck(rng, isoOf(stop.first))
    const checkOut = rng.bool(0.9)
      ? randomCheck(rng, isoOf(stop.first + stop.nights))
      : randomCheck(rng, isoOf(stop.first + rng.int(-1, stop.nights + 2)))
    const sharedId = `acc-${stopIndex + 1}`
    for (let night = 0; night < stop.nights; night++) {
      const index = stop.first + night
      const carries =
        convention === 'every' ||
        night === 0 ||
        (convention === 'mixed' && rng.bool(0.5))
      if (!carries) continue
      days[index].accommodation = randomAccommodation(
        rng,
        rng.bool(0.7) ? sharedId : `${sharedId}-${night + 1}`,
        night === 0 ? name : hotelVariant(rng, name),
        checkIn,
        checkOut,
        options,
      )
    }
  })

  // Trajets entre étapes : au jour du départ, au jour d'arrivée, ou aux deux.
  stops.forEach((stop, stopIndex) => {
    const next = stops[stopIndex + 1]
    if (!next) return
    const convention = rng.pick([
      'departure',
      'arrival',
      'both',
      'none',
    ] as const)
    const lastDay = stop.first + stop.nights - 1
    const from = randomPlaceFor(rng, stop.city)
    const to = randomPlaceFor(rng, next.city)
    if (convention === 'departure' || convention === 'both') {
      days[lastDay].transport = randomTransport(
        rng,
        `tr-${lastDay + 1}`,
        from,
        to,
        isoOf(lastDay),
        isoOf(lastDay + 1),
        options,
      )
    }
    if (convention === 'arrival' || convention === 'both') {
      days[next.first].transport = randomTransport(
        rng,
        rng.bool(0.05) ? isoOf(next.first) : `tr-${next.first + 1}`,
        from,
        to,
        isoOf(next.first),
        isoOf(next.first + 1),
        options,
      )
    }
  })

  // Excursions à la journée, aller simple ou retour.
  for (let index = 0; index < dayCount; index++) {
    if (days[index].transport || !rng.bool(0.08)) continue
    const city = cityOf(index)
    const elsewhere = cityOf(rng.int(0, dayCount - 1))
    days[index].transport = randomTransport(
      rng,
      `tr-x-${index + 1}`,
      randomPlaceFor(rng, rng.bool(0.5) ? city : elsewhere),
      randomPlaceFor(rng, rng.bool(0.5) ? elsewhere : city),
      isoOf(index),
      isoOf(index + 1),
      options,
    )
  }
  return days
}

// ── Valeurs hostiles ──────────────────────────────────────────────────────────

const HOSTILE_NUMBERS = [
  0,
  -0,
  1,
  -1,
  0.5,
  1e308,
  -1e308,
  Number.MAX_SAFE_INTEGER + 2,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  2 ** 32,
] as const

const HOSTILE_KEYS = [
  'id',
  'date',
  'dayNumber',
  'city',
  'title',
  'activities',
  'coordinates',
  'accommodation',
  'transport',
  'images',
  'name',
  'type',
  'url',
  'caption',
  'checkIn',
  'checkOut',
  'bookingUrl',
  'bookingReference',
  'notes',
  'price',
  'status',
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'hasOwnProperty',
  'valueOf',
  '',
  ' ',
  '0',
  'length',
] as const

/** Valeur JSON quelconque, profondeur bornée ; clés pièges comprises. */
export function arbitraryJson(rng: Rng, depth = 4): unknown {
  const kind = rng.int(0, depth > 0 ? 9 : 5)
  switch (kind) {
    case 0:
      return null
    case 1:
      return rng.bool()
    case 2:
      return rng.bool(0.5)
        ? rng.pick(HOSTILE_NUMBERS)
        : (rng.next() - 0.5) * 10 ** rng.int(0, 12)
    case 3:
    case 4:
      return rng.bool(0.3)
        ? rng.pick([
            '',
            'javascript:alert(1)',
            'https://x.example/a.png',
            '2026-05-10',
          ])
        : randomUnicode(rng, 16, true)
    case 5:
      return undefined
    case 6:
    case 7:
      return Array.from({ length: rng.int(0, 5) }, () =>
        arbitraryJson(rng, depth - 1),
      )
    default: {
      const object: Record<string, unknown> = {}
      for (let index = rng.int(0, 6); index > 0; index--) {
        const key = rng.bool(0.8)
          ? rng.pick(HOSTILE_KEYS)
          : randomUnicode(rng, 6)
        defineOwn(object, key, arbitraryJson(rng, depth - 1))
      }
      return object
    }
  }
}

/** Remplace, retire ou ajoute au hasard quelques valeurs d'une structure. */
export function corrupt(rng: Rng, value: unknown, rate = 0.08): unknown {
  if (rng.bool(rate)) return arbitraryJson(rng, 2)
  if (Array.isArray(value)) {
    const items = value
      .filter(() => !rng.bool(rate / 2))
      .map((item) => corrupt(rng, item, rate))
    if (rng.bool(rate / 2)) items.push(arbitraryJson(rng, 2))
    return items
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (rng.bool(rate / 2)) continue
      defineOwn(copy, key, corrupt(rng, item, rate))
    }
    if (rng.bool(rate / 2)) {
      defineOwn(copy, rng.pick(HOSTILE_KEYS), arbitraryJson(rng, 2))
    }
    return copy
  }
  return value
}

/**
 * Entrée hostile pour `normalizeItineraryShape` : une valeur quelconque, ou
 * un vrai voyage dont quelques valeurs ont été corrompues (de quoi atteindre
 * le fond des normaliseurs plutôt que d'être refusé au premier niveau).
 */
export function hostileItinerary(rng: Rng): unknown {
  switch (rng.int(0, 5)) {
    case 0:
      return arbitraryJson(rng)
    case 1:
      return Array.from({ length: rng.int(0, 4) }, () => arbitraryJson(rng, 3))
    default:
      return corrupt(
        rng,
        randomItinerary(rng, { maxDays: 6 }),
        rng.pick([0.01, 0.04, 0.1]),
      )
  }
}

/** Octets quelconques. */
export function randomBytes(rng: Rng, maxLength = 256): Uint8Array {
  const bytes = new Uint8Array(rng.int(0, maxLength))
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = rng.int(0, 255)
  return bytes
}

const BASE64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Chaîne base64url quelconque, parfois avec des caractères hors alphabet. */
export function randomBase64Url(rng: Rng, maxLength = 512): string {
  let text = ''
  for (let index = rng.int(1, maxLength); index > 0; index--) {
    text += rng.bool(0.97)
      ? BASE64URL[rng.int(0, BASE64URL.length - 1)]
      : rng.pick(['=', '+', '/', ' ', '\n', '%', '€', '\u0000'])
  }
  return text
}
