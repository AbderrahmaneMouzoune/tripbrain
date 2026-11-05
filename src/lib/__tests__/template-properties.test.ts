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
  looksLikePrivateStay,
  templateKnownPlaces,
  templateStays,
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
  MAX_STAY_KEY_LENGTH,
  MAX_TEMPLATE_CITIES,
  MAX_TEMPLATE_CITY_LENGTH,
  MAX_TEMPLATE_DAYS,
  MAX_TEMPLATE_DAY_ACTIVITIES,
  TEMPLATE_ID_ALPHABET,
  countrySlug,
  createTemplateId,
  idSuffixedSlug,
  isStayKey,
  isTemplateId,
  isTemplateSlug,
  parsePrivateStays,
  slugify,
  stayKey,
  suffixedSlug,
  templateCities,
  templateSlug,
  tripYear,
  type TemplateOptions,
  type TemplateOrigin,
} from '@/lib/template-model'
import {
  buildTemplateOrigin,
  durationChoice,
  groupDaysByCity,
  looksLikeRestDay,
  needsBooking,
  retimeTemplate,
  suggestKeptDayIds,
  templateTodo,
} from '@/lib/template-redate'
import {
  parseTemplatePublish,
  parseTemplateUpdate,
} from '@/lib/template-request'
import { normalizeItineraryShape } from '@/lib/template-shape'
import { normalizeTransportType } from '@/lib/transport-type'
import { templatePublishBlocker, type StoredTrip } from '@/lib/trips'
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

/**
 * Réglages tirés au hasard ; les hébergements privés parmi ceux du voyage
 * (`templateStays`), plus parfois une clé qui ne désigne rien.
 */
function randomOptions(
  rng: Rng,
  itinerary: readonly DayItinerary[] = [],
): TemplateOptions {
  const keys = templateStays(itinerary).map((stay) => stay.key)
  const privateStays = rng.bool(0.5) ? rng.subset(keys, 0.6) : []
  if (rng.bool(0.1)) {
    privateStays.push(rng.pick(['inconnu', '#absent', 'chezpersonne']))
  }
  return { includeNotes: rng.bool(), includePrices: rng.bool(), privateStays }
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
  required: {
    id: isText,
    type: oneOf('train', 'car', 'plane', 'bus', 'boat', 'other'),
  },
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

interface RefStage {
  key: string
  first: number
  last: number
}

/** Étapes du modèle : suites maximales de journées consécutives de même ville. */
function refStages(itinerary: readonly DayItinerary[]): RefStage[] {
  const stages: RefStage[] = []
  itinerary.forEach((day, index) => {
    const key = refPlaceKey(day.city)
    const current = stages[stages.length - 1]
    if (current && current.key === key) current.last = index
    else stages.push({ key, first: index, last: index })
  })
  return stages
}

/**
 * Oracle du §3.2.5 : le départ, l'arrivée du trajet de la journée `index`
 * tombent-ils sur une étape retirée ? Un lieu désigne l'étape de sa ville la
 * plus proche dans le sens du trajet (celle de la journée d'abord) ; sans
 * étape de ce côté, sa ville entière. Un départ inconnu, au premier jour d'une
 * étape où le trajet arrive, vient de l'étape d'avant.
 */
function refRemovedEnds(
  input: RetimeCase,
  index: number,
): { from: boolean; to: boolean } {
  const { itinerary } = input
  const transport = itinerary[index].transport
  if (!transport) return { from: false, to: false }
  const keptIds = new Set(input.keptDayIds)
  const cities = [
    ...new Set(itinerary.map((day) => refPlaceKey(day.city)).filter(Boolean)),
  ]
  const stages = refStages(itinerary)
  const own = stages.findIndex(
    (stage) => index >= stage.first && index <= stage.last,
  )
  const stageKept = (stage: RefStage) =>
    itinerary
      .slice(stage.first, stage.last + 1)
      .some((day) => keptIds.has(day.id))
  const cityKept = (city: string) =>
    itinerary.some(
      (day) => keptIds.has(day.id) && refPlaceKey(day.city) === city,
    )
  const removed = (place: string | undefined, direction: 1 | -1) => {
    const city = refMatchCity(place, cities)
    if (city === null || city === stages[own].key) return false
    const side =
      direction === 1 ? stages.slice(own + 1) : stages.slice(0, own).reverse()
    const nearest = side.find((stage) => stage.key === city)
    return nearest ? !stageKept(nearest) : !cityKept(city)
  }
  const inferred =
    refMatchCity(transport.from, cities) === null &&
    refMatchCity(transport.to, cities) === stages[own].key &&
    index === stages[own].first &&
    own > 0 &&
    !stageKept(stages[own - 1])
  return {
    from: removed(transport.from, -1) || inferred,
    to: removed(transport.to, 1),
  }
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
  // Deux interrupteurs tirés, sans hébergement privé : le recalage ignore
  // les adresses, et le flux aléatoire reste celui des contre-exemples
  // connus du recalage (`KNOWN_BUG`).
  const itinerary = cleanForTemplate(randomItinerary(rng, { maxDays: 16 }), {
    includeNotes: rng.bool(),
    includePrices: rng.bool(),
    privateStays: [],
  })
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
    // « Ne publier que le nom et la ville » : ni adresse, ni lien, ni photo.
    if (
      source.accommodation &&
      options.privateStays.includes(stayKey(source.accommodation))
    ) {
      const kept = day.accommodation
      if (kept?.address !== '')
        errors.push(`${path}.accommodation.address privée gardée`)
      if (kept?.bookingUrl !== '')
        errors.push(`${path}.accommodation.bookingUrl privé gardé`)
      if (kept && Object.hasOwn(kept, 'images'))
        errors.push(`${path}.accommodation.images privées gardées`)
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
  const generate = (rng: Rng) => {
    const itinerary = randomItinerary(rng)
    return { itinerary, options: randomOptions(rng, itinerary) }
  }
  const valid = (input: ReturnType<typeof generate>) =>
    isRecord(input) &&
    isRecord(input.options) &&
    typeof input.options.includeNotes === 'boolean' &&
    typeof input.options.includePrices === 'boolean' &&
    Array.isArray(input.options.privateStays) &&
    input.options.privateStays.every((key) => typeof key === 'string') &&
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
          expect(summary.stays.privateLinks).toBe(
            removedLinks(itinerary, output).size,
          )
          expect(summary.stays.privateStays).toBe(
            hiddenStayKeys(itinerary, options).size,
          )
          expect(summary.goes.accommodations).toBe(
            templateStays(itinerary).length,
          )
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )
})

/** Liens retirés ou vidés par le nettoyage, sans espaces autour, sans doublon. */
function removedLinks(
  itinerary: readonly DayItinerary[],
  output: readonly DayItinerary[],
): Set<string> {
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
  return removed
}

/** Clés des hébergements du voyage que l'auteur a choisi de masquer. */
function hiddenStayKeys(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
): Set<string> {
  const wanted = new Set(options.privateStays)
  return new Set(
    itinerary.flatMap((day) =>
      day.accommodation && wanted.has(stayKey(day.accommodation))
        ? [stayKey(day.accommodation)]
        : [],
    ),
  )
}

// ── Hébergements privés (§3.1) ────────────────────────────────────────────────

const HOME_STREETS = [
  'rue des Lilas',
  'Rua dos Remédios',
  "rue de l'Église",
  'avenue Jean-Jaurès',
  'Calle Mayor',
  'Baker Street',
  'Kabukicho',
] as const
const HOME_DETAILS = ['', '3e étage', 'digicode 4521', 'Apt 4B', 'porte 12']

interface HomeAddress {
  address: string
  /**
   * Ce qui désigne le logement : l'adresse, la rue et son numéro, le détail
   * d'accès ; sans numéro, l'adresse entière seulement.
   */
  needles: string[]
  /** Façons dont un voyageur la recopie ailleurs dans son voyage. */
  variants: string[]
}

/** Maisons à la campagne, sans numéro : on ne cherche que l'adresse entière. */
const HOME_HOUSES = [
  'Quinta das Rosas',
  'Le Mas des Oliviers',
  'Villa Les Tamaris',
  'Casa Azul',
  'Ferme de la Combe',
] as const
const HOME_PLACES = [
  'chemin de la Source',
  'lieu-dit Kerbrat',
  'hameau des Granges',
  "route de l'Étang",
  'Estrada de Monserrate',
] as const

/** « <maison>, <lieu-dit ou chemin>, <ville> » : aucun chiffre, plusieurs morceaux. */
function randomCountryHome(rng: Rng, city: string): HomeAddress {
  const address = [rng.pick(HOME_HOUSES), rng.pick(HOME_PLACES), city.trim()]
    .filter(Boolean)
    .join(', ')
  return {
    address,
    needles: [address],
    variants: [
      address,
      address.toUpperCase(),
      address.toLowerCase(),
      address.replace(/ /g, '  '),
      address.replace(/, /g, ' ; '),
      address.normalize('NFD').replace(/\p{M}/gu, ''),
      address.replace(/'/g, '’'),
    ],
  }
}

function randomHomeAddress(rng: Rng, city: string): HomeAddress {
  if (rng.bool(0.25)) return randomCountryHome(rng, city)
  const street = `${rng.int(1, 240)} ${rng.pick(HOME_STREETS)}`
  const detail = rng.pick(HOME_DETAILS)
  const town = `${rng.int(10000, 99999)} ${city}`.trim()
  const address = [street, detail, town].filter(Boolean).join(', ')
  return {
    address,
    needles: [address, street, ...(detail ? [detail] : [])],
    variants: [
      address,
      street,
      address.toUpperCase(),
      street.toLowerCase(),
      street.replace(' ', ', '),
      address.replace(/ /g, '  '),
      street.normalize('NFD').replace(/\p{M}/gu, ''),
      street.replace(/'/g, '’'),
      ...(detail ? [detail] : []),
    ],
  }
}

/** Recopie l'adresse (`variant`) quelque part dans le voyage, comme le ferait un voyageur. */
function leakAddress(
  rng: Rng,
  itinerary: DayItinerary[],
  variant: string,
  address: string,
  serial: number,
): void {
  const day = rng.pick(itinerary)
  const id = `home-${serial}`
  switch (rng.int(0, 11)) {
    case 0:
      day.notes = `${day.notes ?? ''} Adresse : ${variant}.`
      break
    case 1:
      day.tips = [...(day.tips ?? []), `Rentrer au ${variant} avant minuit`]
      break
    case 2:
      day.highlights = [...(day.highlights ?? []), variant]
      break
    case 3:
      day.title = `${day.title} — ${variant}`
      break
    case 4:
      day.packingTips = [...(day.packingTips ?? []), variant]
      break
    case 5:
      day.activities.push({
        id,
        name: `Dîner au ${variant}`,
        type: 'food',
        address: variant,
        coordinates: [48.85, 2.38],
        description: `Chez nous : ${variant}`,
        tips: variant,
      })
      break
    case 6:
      day.activities.push({
        id,
        name: 'Plan',
        type: 'visit',
        bookingUrl: `https://www.google.com/maps/search/${encodeURIComponent(address)}`,
      })
      break
    case 7:
      day.activities.push({
        id,
        name: 'Carte',
        type: 'visit',
        images: [
          `https://maps.googleapis.com/maps/api/staticmap?center=${address.replace(/ /g, '+')}`,
        ],
      })
      break
    case 8:
      day.transport = day.transport
        ? {
            ...day.transport,
            departureAddress: variant,
            details: `Taxi depuis ${variant}`,
          }
        : { id, type: 'car', from: variant, to: day.city }
      break
    case 9:
      day.images = [
        ...(day.images ?? []),
        {
          url: `https://example.com/carte?q=${encodeURIComponent(variant)}`,
          caption: `Vue du ${variant}`,
        },
      ]
      break
    case 10:
      day.walkingDistance = `3 km depuis le ${variant}`
      break
    default:
      day.activities.push({
        id,
        name: 'Courses',
        type: 'shopping',
        tags: ['marché', variant],
        openAt: `08:00, devant le ${variant}`,
      })
  }
}

interface PrivateStayCase {
  itinerary: DayItinerary[]
  options: TemplateOptions
  /** Les morceaux des adresses masquées, à ne retrouver nulle part. */
  needles: string[]
}

/**
 * Un voyage où l'auteur masque un ou plusieurs hébergements, dont l'adresse
 * (avec numéro, parfois étage ou digicode) revient dans les notes, les
 * conseils, les activités, les trajets, les liens et les images. Parfois le
 * nom porte aussi la rue (« Hôtel Saint-Pierre 12 rue des Lilas »).
 */
function privateStayCase(rng: Rng): PrivateStayCase {
  const itinerary = randomItinerary(rng, { maxDays: 8 })
  if (!itinerary.some((day) => day.accommodation)) {
    itinerary[0].accommodation = {
      id: 'acc-home',
      name: rng.pick(['Chez Marie', '']),
      address: '',
      bookingUrl: 'https://www.airbnb.fr/rooms/12345678901234',
      checkIn: itinerary[0].date,
      checkOut: '',
      images: ['https://images.example.com/salon.jpeg'],
    }
  }
  const stays = templateStays(itinerary)
  const chosen = rng.subset(stays, 0.5)
  if (chosen.length === 0) chosen.push(rng.pick(stays))
  const hidden = new Set<Accommodation>()
  const needles: string[] = []
  let serial = 0
  for (const stay of chosen) {
    const home = randomHomeAddress(rng, stay.cities[0] ?? '')
    const renamed = rng.bool(0.2)
    for (const day of itinerary) {
      const accommodation = day.accommodation
      if (!accommodation || stayKey(accommodation) !== stay.key) continue
      if (hidden.has(accommodation)) continue
      accommodation.address = home.address
      // Le nom porte aussi la rue (ou, sans numéro, l'adresse entière).
      if (renamed) {
        accommodation.name = `${accommodation.name} ${home.needles[1] ?? home.address}`
      }
      hidden.add(accommodation)
    }
    needles.push(...home.needles)
    for (let count = rng.int(1, 6); count > 0; count -= 1) {
      leakAddress(rng, itinerary, rng.pick(home.variants), home.address, serial)
      serial += 1
    }
  }
  const privateStays = [...new Set(Array.from(hidden, stayKey))]
  if (rng.bool(0.1)) privateStays.push('#absent')
  return {
    itinerary,
    options: {
      includeNotes: rng.bool(),
      includePrices: rng.bool(),
      privateStays,
    },
    needles,
  }
}

/** Sans accents ni casse, apostrophes et tirets unifiés, séparateurs ramenés à une espace. */
function refPlain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[\s,;]+/gu, ' ')
}

/** Le texte contient-il l'un des morceaux, en mots entiers ? `url` : lu aussi décodé. */
function refHasNeedle(
  text: string,
  needles: readonly string[],
  url = false,
): boolean {
  const forms = [text]
  if (url) {
    const spaced = text.replace(/\+/g, ' ')
    forms.push(spaced)
    try {
      forms.push(decodeURIComponent(spaced))
    } catch {
      // Séquence `%` invalide : les formes brutes suffisent.
    }
  }
  const isWord = (char: string | undefined) =>
    char !== undefined && /[\p{L}\p{N}]/u.test(char)
  return forms.some((form) => {
    const hay = refPlain(form)
    return needles.some((needle) => {
      const plainNeedle = refPlain(needle).trim()
      for (
        let at = hay.indexOf(plainNeedle);
        at !== -1;
        at = hay.indexOf(plainNeedle, at + 1)
      ) {
        const end = at + plainNeedle.length
        const opens = isWord(plainNeedle[0]) && isWord(hay[at - 1])
        const closes =
          isWord(plainNeedle[plainNeedle.length - 1]) && isWord(hay[end])
        if (!opens && !closes) return true
      }
      return false
    })
  })
}

const URL_KEYS = new Set(['bookingUrl', 'url'])

/** Chemins des textes du modèle où l'un des morceaux d'adresse ressort. */
function addressLeaks(
  value: unknown,
  needles: readonly string[],
  path = '',
  key = '',
  inImages = false,
): string[] {
  if (typeof value === 'string') {
    if (key === 'id') return []
    return refHasNeedle(value, needles, inImages || URL_KEYS.has(key))
      ? [`${path} : ${value}`]
      : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      addressLeaks(item, needles, `${path}[${index}]`, '', key === 'images'),
    )
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([name, item]) =>
      addressLeaks(item, needles, `${path}.${name}`, name, false),
    )
  }
  return []
}

/**
 * Ce que le masquage ne doit pas toucher : chaque texte, lien, image ou
 * coordonnée sans adresse masquée reste celui d'un nettoyage sans
 * hébergement privé (`baseline`). Seuls l'adresse, le lien et les photos de
 * l'hébergement masqué changent.
 */
function collateralDamage(
  baseline: readonly DayItinerary[],
  output: readonly DayItinerary[],
  needles: readonly string[],
  hiddenDays: ReadonlySet<number>,
): string[] {
  const errors: string[] = []
  const compare = (
    before: unknown,
    after: unknown,
    path: string,
    skip: readonly string[] = [],
  ) => {
    if (!isRecord(before)) return
    const kept = isRecord(after) ? after : {}
    for (const [key, value] of Object.entries(before)) {
      if (skip.includes(key) || key === 'activities') continue
      if (typeof value === 'string') {
        if (refHasNeedle(value, needles, URL_KEYS.has(key))) continue
        if (kept[key] !== value) {
          errors.push(
            `${path}.${key} : « ${value} » → « ${String(kept[key])} »`,
          )
        }
      } else if (Array.isArray(value) && key !== 'coordinates') {
        const after = Array.isArray(kept[key]) ? (kept[key] as unknown[]) : []
        for (const item of value) {
          const text =
            typeof item === 'string'
              ? item
              : isRecord(item)
                ? `${item.url} ${item.caption}`
                : ''
          if (refHasNeedle(text, needles, key === 'images')) continue
          if (
            !after.some(
              (other) => JSON.stringify(other) === JSON.stringify(item),
            )
          ) {
            errors.push(`${path}.${key} : ${JSON.stringify(item)} perdu`)
          }
        }
      }
    }
  }
  baseline.forEach((day, index) => {
    const out = output[index]
    const path = `[${index}]`
    compare(day, out, path, ['accommodation', 'transport'])
    compare(day.transport, out.transport, `${path}.transport`)
    compare(
      day.accommodation,
      out.accommodation,
      `${path}.accommodation`,
      hiddenDays.has(index) ? ['address', 'bookingUrl', 'images'] : [],
    )
    day.activities.forEach((activity, k) => {
      const after = out.activities[k]
      compare(activity, after, `${path}.activities[${k}]`)
      const located = [activity.name, activity.address ?? '']
      if (
        activity.coordinates &&
        !located.some((text) => refHasNeedle(text, needles)) &&
        JSON.stringify(after.coordinates) !==
          JSON.stringify(activity.coordinates)
      ) {
        errors.push(`${path}.activities[${k}].coordinates perdues`)
      }
    })
  })
  return errors
}

describe('propriétés — hébergements privés', () => {
  const valid = (input: PrivateStayCase) =>
    isRecord(input) &&
    isRecord(input.options) &&
    Array.isArray(input.options.privateStays) &&
    input.options.privateStays.every((key) => typeof key === 'string') &&
    typeof input.options.includeNotes === 'boolean' &&
    typeof input.options.includePrices === 'boolean' &&
    Array.isArray(input.needles) &&
    // Un morceau vide ou réduit à rien se trouverait partout.
    input.needles.every(
      (needle) => typeof needle === 'string' && needle.trim().length >= 6,
    ) &&
    isTypedItinerary(input.itinerary)

  it(
    'ne laisse l’adresse masquée nulle part, et ne touche à rien d’autre',
    () => {
      checkProperty(
        'adresse masquée partout',
        privateStayCase,
        ({ itinerary, options, needles }) => {
          const output = cleanForTemplate(deepFreeze(itinerary), options)
          const errors = cleanedErrors(itinerary, output, options)
          if (errors.length > 0) throw new Error(errors.slice(0, 5).join(' ; '))
          const leaks = addressLeaks(output, needles)
          if (leaks.length > 0) {
            throw new Error(
              `adresse publiée : ${leaks.slice(0, 5).join(' ; ')}`,
            )
          }
          const wanted = new Set(options.privateStays)
          const hiddenDays = new Set(
            itinerary.flatMap((day, index) =>
              day.accommodation && wanted.has(stayKey(day.accommodation))
                ? [index]
                : [],
            ),
          )
          const baseline = cleanForTemplate(itinerary, {
            ...options,
            privateStays: [],
          })
          const damage = collateralDamage(baseline, output, needles, hiddenDays)
          if (damage.length > 0) throw new Error(damage.slice(0, 5).join(' ; '))
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )

  it(
    'reste idempotente, typée, et résumée exactement (A2)',
    () => {
      checkProperty(
        'masquage idempotent et résumé',
        privateStayCase,
        ({ itinerary, options }) => {
          const output = cleanForTemplate(itinerary, options)
          expect(cleanForTemplate(deepFreeze(output), options)).toStrictEqual(
            output,
          )
          expect(JSON.parse(JSON.stringify(output))).toStrictEqual(output)
          expect(normalizeItineraryShape(output)).toStrictEqual(output)
          expect(output.map((day) => day.id)).toEqual(
            itinerary.map((day) => day.id),
          )
          const summary = summarizeTemplateCleaning(itinerary, options)
          expect(summary.stays.privateLinks).toBe(
            removedLinks(itinerary, output).size,
          )
          expect(summary.stays.privateStays).toBe(
            hiddenStayKeys(itinerary, options).size,
          )
        },
        { shrinkValid: valid },
      )
    },
    TIMEOUT,
  )

  it(
    'templateStays : un hébergement par clé, dans l’ordre du voyage, clés valides',
    () => {
      checkProperty(
        'hébergements du voyage',
        (rng) => randomItinerary(rng),
        (itinerary) => {
          const stays = templateStays(itinerary)
          const keys = stays.map((stay) => stay.key)
          const inOrder = itinerary
            .flatMap((day) =>
              day.accommodation ? [stayKey(day.accommodation)] : [],
            )
            .filter((key, index, all) => all.indexOf(key) === index)
          expect(keys).toEqual(inOrder)
          expect(parsePrivateStays(keys)).toEqual(keys)
          for (const stay of stays) {
            const days = itinerary.filter(
              (day) =>
                day.accommodation && stayKey(day.accommodation) === stay.key,
            )
            expect(stay.nights).toBeGreaterThanOrEqual(1)
            expect(stay.name).toBe(stay.name.trim())
            const cities = days.map((day) => day.city.trim())
            for (const city of stay.cities) expect(cities).toContain(city)
            expect(stay.suggestedPrivate).toBe(
              days.some((day) =>
                looksLikePrivateStay(day.accommodation as Accommodation),
              ),
            )
          }
        },
        { shrinkValid: isTypedItinerary },
      )
    },
    TIMEOUT,
  )

  it(
    'stayKey : stable, bornée, insensible aux espaces, acceptée par la validation',
    () => {
      checkProperty(
        'clé d’hébergement',
        (rng) => ({
          name: rng.bool(0.8) ? randomUnicode(rng, 60) : rng.pick(HOME_STREETS),
          padding: rng.pick(['', ' ', '  ', ' ', '\t']),
        }),
        ({ name, padding }) => {
          const key = stayKey({ id: 'acc-1', name })
          expect(isStayKey(key)).toBe(true)
          expect(key.length).toBeLessThanOrEqual(MAX_STAY_KEY_LENGTH)
          expect(
            stayKey({
              id: 'acc-1',
              name: `${padding}${name.replace(/ /g, '  ')}${padding}`,
            }),
          ).toBe(key)
          if (!key.startsWith('#')) {
            expect(stayKey({ id: 'acc-2', name: key })).toBe(key)
          }
        },
      )
    },
    TIMEOUT,
  )
})

// ── Republier un voyage repris (§2.4) ─────────────────────────────────────────

/** Le voyage d'un repreneur : `itinerary`, repris de `base`. */
function takenTrip(
  base: readonly DayItinerary[],
  itinerary: DayItinerary[],
): StoredTrip {
  const origin: TemplateOrigin = {
    templateId: '0123456789abcdef',
    version: 1,
    title: 'Modèle',
    authorName: null,
    tripYear: null,
    startDate: '2027-01-01',
    keptDayIds: base.map((day) => day.id),
    base: JSON.parse(JSON.stringify(base)) as DayItinerary[],
    takenAt: 0,
  }
  return {
    id: 'trip-repris',
    title: 'Repris',
    itinerary,
    source: 'template',
    createdAt: 0,
    updatedAt: 0,
    origin,
  }
}

/** Tout le voyage décalé de `offset` jours, ids compris tels quels. */
function shiftedKeepingIds(
  itinerary: readonly DayItinerary[],
  offset: number,
): DayItinerary[] {
  return itinerary.map((day) => {
    const moved = refShiftDeep(day, offset)
    return {
      ...moved,
      id: day.id,
      activities: moved.activities.map((activity, k) => ({
        ...activity,
        id: day.activities[k].id,
      })),
      ...(moved.accommodation && day.accommodation
        ? {
            accommodation: { ...moved.accommodation, id: day.accommodation.id },
          }
        : {}),
      ...(moved.transport && day.transport
        ? { transport: { ...moved.transport, id: day.transport.id } }
        : {}),
    }
  })
}

/**
 * Ce que le repreneur change sans que rien ne parte jamais dans un modèle.
 * Une référence n'est ajoutée que là où il n'y en a pas : en remplacer une
 * rendrait public un lien qui la contenait, ce qui change bien le modèle.
 */
function privateOnlyEdits(rng: Rng, days: DayItinerary[]): DayItinerary[] {
  let edited = structuredClone(days)
  for (const day of edited) {
    for (const activity of day.activities) {
      if (rng.bool(0.3))
        activity.status = rng.pick(['done', 'skipped'] as const)
      if (rng.bool(0.1) && activity.bookingUrl === undefined) {
        activity.bookingUrl =
          'https://secure.booking.com/confirmation.fr.html?aid=1'
      }
      if (rng.bool(0.1)) {
        activity.images = [
          ...(activity.images ?? []),
          'blob:https://app.tripbrain.fr/6f1c',
        ]
      }
    }
    if (day.transport && rng.bool(0.4)) {
      day.transport = {
        ...day.transport,
        status: 'booked',
        bookingReference: day.transport.bookingReference ?? 'ZQ9X7W2K',
        seat: '12A',
        gate: 'B42',
      }
    }
    if (day.accommodation && rng.bool(0.4)) {
      day.accommodation = {
        ...day.accommodation,
        status: 'checked-in',
        bookingReference: day.accommodation.bookingReference ?? 'ZQ9X7W2K',
      }
    }
  }
  if (rng.bool(0.3))
    edited = shiftedKeepingIds(edited, rng.pick([-28, -7, -1, 1, 3, 30, 365]))
  return edited
}

/** Une vraie retouche, de celles qui changent le modèle publié. */
function contentEdit(rng: Rng, days: DayItinerary[]): string {
  const day = rng.pick(days)
  const kind = rng.int(0, 6)
  if (kind === 0 && days.length > 1) {
    days.splice(days.indexOf(day), 1)
    return 'journée retirée'
  }
  if (kind === 1 && days.length > 1) {
    days.reverse()
    return 'journées inversées'
  }
  if (kind === 2) {
    day.title = `${day.title} (modifié)`
    return 'titre de journée'
  }
  if (kind === 3) {
    day.tips = [...(day.tips ?? []), 'Nouveau conseil']
    return 'conseil ajouté'
  }
  if (kind === 4 && day.accommodation) {
    day.accommodation = {
      ...day.accommodation,
      name: `${day.accommodation.name} (autre)`,
    }
    return 'hôtel changé'
  }
  if (kind === 5 && day.activities.length > 0) {
    const activity = rng.pick(day.activities)
    activity.price = (activity.price ?? 0) + 1
    return 'prix changé'
  }
  day.activities.push({
    id: 'nouvelle-activite',
    name: 'Nouvelle activité',
    type: 'visit',
  })
  return 'activité ajoutée'
}

describe('propriétés — templatePublishBlocker', () => {
  it(
    'un voyage repris ne se republie qu’une fois son contenu retouché',
    () => {
      checkProperty(
        'reprise retouchée',
        (rng) => {
          const base = randomItinerary(rng, { maxDays: 8 })
          const untouched = privateOnlyEdits(rng, base)
          const edited = structuredClone(untouched)
          const edit = contentEdit(rng, edited)
          return { base, untouched, edited, edit }
        },
        ({ base, untouched, edited, edit }) => {
          expect(
            templatePublishBlocker(takenTrip(base, structuredClone(base))),
          ).toBe('unmodified-take')
          expect(templatePublishBlocker(takenTrip(base, untouched))).toBe(
            'unmodified-take',
          )
          expect(
            templatePublishBlocker(takenTrip(base, edited)),
            edit,
          ).toBeNull()
        },
        {
          shrinkValid: (input) =>
            isRecord(input) &&
            typeof input.edit === 'string' &&
            isTypedItinerary(input.base) &&
            input.base.length > 0 &&
            isTypedItinerary(input.untouched) &&
            input.untouched.length > 0 &&
            isTypedItinerary(input.edited) &&
            input.edited.length > 0,
        },
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
    'garde chaque trajet qui a un id, son type ramené à un type de l’app',
    () => {
      // Ce qu'un tableur, une autre version de l'app ou msgpack peut dire.
      const rawTypes = [
        'Ferry',
        'navette maritime',
        'TGV',
        'Métro',
        'taxi',
        'teleporter',
        '',
        'BOAT',
        42,
        null,
        { type: 'ferry' },
      ] as const
      checkProperty(
        'trajets gardés',
        (rng) =>
          randomItinerary(rng, { maxDays: 6, unknownKeys: false }).map((day) =>
            day.transport && rng.bool(0.6)
              ? {
                  ...day,
                  transport: {
                    ...day.transport,
                    type: rng.pick(rawTypes) as unknown as string,
                  },
                }
              : day,
          ),
        (itinerary) => {
          const output = normalizeItineraryShape(itinerary)
          expect(output).not.toBeNull()
          itinerary.forEach((day, index) => {
            const kept = output?.[index].transport
            if (!day.transport) return expect(kept).toBeUndefined()
            expect(kept?.id).toBe(day.transport.id)
            expect(kept?.type).toBe(normalizeTransportType(day.transport.type))
          })
        },
      )
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
    'ne garde aucun trajet vers ou depuis une étape retirée, ni une ville entièrement retirée',
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
          for (const { rank, index, day, offset } of keptDays(input)) {
            const out = output[rank].transport
            const source = day.transport
            if (!source) {
              expect(out).toBeUndefined()
              continue
            }
            const ends = refRemovedEnds(input, index)
            // Parti d'une étape retirée pour une étape retirée : il ne décrit plus rien.
            if (ends.from && ends.to) expect(out).toBeUndefined()
            if (!out) continue
            expect(out.id).toBe(source.id)
            expect(out.type).toBe(source.type)
            if (removed(out.to))
              throw new Error(`vers une ville retirée : ${out.to}`)
            if (removed(out.from))
              throw new Error(`depuis une ville retirée : ${out.from}`)
            const moved = { ...refShiftDeep(source, offset), id: source.id }
            if (!ends.from && !ends.to) {
              // Intact, à part le glissement des dates.
              expect(out).toEqual(moved)
              continue
            }
            // Recousu : il ne garde que son id, son type et ses extrémités…
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
            // … entre l'étape gardée précédente et la suivante.
            const cityAt = (k: number) => output[k]?.city.trim() ?? ''
            if (ends.to) {
              expect(out.to).toBe(cityAt(rank + 1))
              expect(out.from).toBe(moved.from)
            } else {
              expect(out.to).toBe(moved.to)
              expect(out.from ?? '').toBe(cityAt(rank - 1))
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
          const entries = groups.flatMap((group) => group.entries)
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
            const kept = group.entries.filter((day) => day.kept)
            expect(group.days).toBe(kept.length)
            expect(group).not.toHaveProperty('nights')
            expect(group.range).toEqual(
              kept.length > 0
                ? { start: kept[0].date, end: kept[kept.length - 1].date }
                : null,
            )
            const keys = new Set(
              group.entries.map((entry) =>
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
            for (const day of group.entries) expect(day.date).toBeNull()
          }
        },
      )
    },
    TIMEOUT,
  )

  it(
    'propose exactement min(durée, n) journées : jour 1 et départ gardés, journées libres d’abord, puis les plus longs séjours, puis les étapes les plus courtes',
    () => {
      checkProperty(
        'sélection par défaut',
        (rng) => {
          const itinerary = randomItinerary(rng, { maxDays: 20 })
          return { itinerary, count: rng.int(1, itinerary.length + 3) }
        },
        ({ itinerary, count }) => {
          const ids = suggestKeptDayIds(itinerary, count)
          const n = itinerary.length
          expect(ids).toHaveLength(Math.min(count, n))
          expect(ids[0]).toBe(itinerary[0].id)
          expect(durationChoice(n, ids.length)).toBe(
            count < n ? 'shorter' : 'same',
          )
          // Ids distincts dans ces voyages : on retrouve les rangs gardés.
          const keptIndexes = ids.map((id) =>
            itinerary.findIndex((day) => day.id === id),
          )
          for (let k = 1; k < keptIndexes.length; k++) {
            expect(keptIndexes[k]).toBeGreaterThan(keptIndexes[k - 1])
          }
          if (count >= n || count === 1) return
          const last = n - 1
          const kept = new Set(keptIndexes)
          // Le jour du départ reste dès qu'on garde deux journées.
          expect(kept.has(last)).toBe(true)

          const locked = (index: number) => index === 0 || index === last
          const freeDay = (index: number) =>
            !locked(index) && looksLikeRestDay(itinerary[index])
          const dropped = itinerary
            .map((_, index) => index)
            .filter((index) => !kept.has(index))
          // On n'a sacrifié une vraie journée qu'une fois les libres parties.
          if (dropped.some((index) => !freeDay(index))) {
            for (let index = 0; index < n; index++) {
              if (freeDay(index)) expect(kept.has(index)).toBe(false)
            }
          } else {
            return
          }

          const stages = refStages(itinerary)
          const range = (stage: RefStage) =>
            Array.from(
              { length: stage.last - stage.first + 1 },
              (_, k) => stage.first + k,
            )
          const keptIn = (stage: RefStage) =>
            range(stage).filter((index) => kept.has(index))
          const sizes = stages.map((stage) => keptIn(stage).length)
          const shortenable = (stage: RefStage) =>
            keptIn(stage)
              .slice(1)
              .some((index) => !locked(index))
          const middles = stages
            .map((stage, s) => ({ stage, s }))
            .filter(({ s }) => s > 0 && s < stages.length - 1)

          stages.forEach((stage, s) => {
            if (sizes[s] === 0) return
            // Un séjour raccourci l'a été parce qu'il était parmi les plus longs.
            const shortened = range(stage).some(
              (index) => !kept.has(index) && !freeDay(index),
            )
            if (shortened) {
              stages.forEach((other, t) => {
                if (shortenable(other)) {
                  expect(sizes[t]).toBeLessThanOrEqual(sizes[s] + 1)
                }
              })
            }
            // Un séjour garde son arrivée (sa première journée qui n'est pas
            // libre) — sauf la dernière étape réduite au jour du départ,
            // quand toutes les autres étapes sont déjà parties.
            const arrival = range(stage).find((index) => !freeDay(index))
            if (arrival === undefined) return
            const lastStageReduced =
              s === stages.length - 1 &&
              middles.every(({ s: m }) => sizes[m] === 0)
            if (!lastStageReduced) expect(kept.has(arrival)).toBe(true)
          })

          // Une étape entière (avec une vraie journée) ne part que quand
          // chaque étape est à une journée, la plus courte du modèle d'abord.
          for (const { stage, s } of middles) {
            if (sizes[s] > 0 || range(stage).every(freeDay)) continue
            stages.forEach((other, t) => {
              expect(sizes[t]).toBeLessThanOrEqual(
                t === stages.length - 1 ? 2 : 1,
              )
            })
            for (const { stage: other, s: t } of middles) {
              if (sizes[t] === 0) continue
              const a = stage.last - stage.first
              const b = other.last - other.first
              expect(a < b || (a === b && s > t)).toBe(true)
            }
          }
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

/** La durée accordée : `1-jour`, `2-jours`… */
function refSlugDuration(dayCount: number): string {
  return dayCount === 1 ? '1-jour' : `${dayCount}-jours`
}

describe('propriétés — slug', () => {
  it(
    'templateSlug donne toujours un slug de modèle valide, tête intacte',
    () => {
      checkProperty(
        'slug valide',
        slugInput,
        (input) => {
          const slug = templateSlug(input)
          const head = `${countrySlug(input.country)}-${refSlugDuration(input.dayCount)}`
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
          const head = `${countrySlug(input.country)}-${refSlugDuration(input.dayCount)}`
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
  it(
    'montre d’abord les notes les plus graves : contact, 6 chiffres, nom, 4–5 chiffres',
    () => {
      const gravity = (spans: readonly SensitiveSpan[], text: string) =>
        Math.min(
          4,
          ...spans.map((span) => {
            if (span.kind === 'phone' || span.kind === 'email') return 0
            const slice = text.slice(span.start, span.end)
            if (span.kind === 'digits' && slice.length >= 6) return 1
            return span.kind === 'name' ? 2 : 3
          }),
        )
      checkProperty(
        'extraits par gravité',
        (rng) => ({
          itinerary: randomItinerary(rng, { maxDays: 10 }),
          limit: rng.int(1, 4),
        }),
        ({ itinerary, limit }) => {
          const places = templateKnownPlaces(itinerary)
          const notes = new Map<string, number>()
          for (const day of itinerary) {
            for (const note of [day.notes, day.transport?.notes]) {
              const text = (note ?? '').trim()
              if (text && !notes.has(text)) {
                notes.set(text, gravity(sensitiveSpans(text, places), text))
              }
            }
          }
          const shown = noteExcerpts(itinerary, limit).map((excerpt) =>
            noteOf(itinerary, excerpt.dayId, excerpt.source),
          )
          const worstShown = Math.max(
            -1,
            ...shown.map((text) => notes.get(text) ?? 4),
          )
          for (const [text, level] of notes) {
            if (!shown.includes(text)) {
              expect(level).toBeGreaterThanOrEqual(worstShown)
            }
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
        (rng) => ({
          itinerary: randomItinerary(rng),
          title: rng.bool() ? randomUnicode(rng, 30) : undefined,
        }),
        ({ itinerary, title }) => {
          const places = templateKnownPlaces(itinerary, title)
          if (title !== undefined && title.trim() !== '') {
            expect(places[0]).toBe(title.trim())
          }
          for (const day of itinerary) {
            const provider = day.transport?.provider?.trim()
            if (provider) {
              expect(
                places.some(
                  (place) => place.toLowerCase() === provider.toLowerCase(),
                ),
              ).toBe(true)
            }
          }
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
        {
          shrinkValid: (input) =>
            isTypedItinerary(input.itinerary) &&
            (input.title === undefined || typeof input.title === 'string'),
        },
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
              ['train', 'plane', 'bus', 'boat'].includes(
                day.transport?.type ?? '',
              ),
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
    'une seule règle « à réserver » : la bannière compte ce que needsBooking signale',
    () => {
      const blank = (value: string | undefined) => (value ?? '').trim() === ''
      const booked = (status: string | undefined) =>
        ['booked', 'checked-in', 'completed'].includes(status ?? '')
      checkProperty(
        'needsBooking',
        (rng) => randomItinerary(rng, { maxDays: 12 }),
        (itinerary) => {
          const hotels = new Map<string, string>()
          let transports = 0
          let activities = 0
          for (const day of itinerary) {
            const stay = day.accommodation
            if (stay) {
              const expected =
                blank(stay.bookingReference) && !booked(stay.status)
              expect(needsBooking(stay)).toBe(expected)
              const name = stay.name.trim()
              const key = refStayKey(stay)
              if (expected && name && !hotels.has(key)) hotels.set(key, name)
            }
            const transport = day.transport
            if (transport) {
              const expected =
                ['train', 'plane', 'bus', 'boat'].includes(transport.type) &&
                blank(transport.bookingReference) &&
                !booked(transport.status)
              expect(needsBooking(transport)).toBe(expected)
              if (expected) transports++
            }
            for (const activity of day.activities) {
              const expected =
                activity.reservationRequired === true &&
                !['done', 'skipped'].includes(activity.status ?? '')
              expect(needsBooking(activity)).toBe(expected)
              if (expected) activities++
            }
          }
          expect(templateTodo(itinerary)).toEqual({
            accommodations: [...hotels.values()],
            transports,
            bookableActivities: activities,
          })
        },
        { shrinkValid: isTypedItinerary },
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
        // Graine libre : le défaut que figeait `KNOWN_BUG` est corrigé, la
        // propriété suit désormais FUZZ_SEED et FUZZ_RUNS comme les autres.
        { shrinkValid: isValidRetimeCase },
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
      for (const entry of groups.flatMap((group) => group.entries)) {
        if (entry.date !== null) expect(isIsoDate(entry.date)).toBe(true)
      }

      checkProperty(
        'bords du calendrier',
        (rng) => {
          const authored = randomItinerary(rng, { maxDays: 6 })
          const itinerary = cleanForTemplate(
            authored,
            randomOptions(rng, authored),
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
