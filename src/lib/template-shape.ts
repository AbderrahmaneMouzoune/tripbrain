/**
 * Itinéraires modèles : chaque valeur gardée a le type que l'app attend.
 *
 * `isDayItinerary` (`share.ts`) ne regarde que la surface d'une journée, et
 * `cleanForTemplate` choisit les clés qui partent sans regarder ce qu'elles
 * contiennent. Or la publication est publique et sans compte, et msgpack
 * transporte n'importe quoi : un `name` objet, des coordonnées en texte, un
 * prix `NaN`, une image `javascript:`… Sans ce contrôle, cela serait stocké,
 * servi sur tripbrain.fr et repris dans des apps qui supposent les types de
 * `itinerary-data.ts`.
 *
 * `normalizeItineraryShape` remet chaque valeur à son type :
 * - une journée dont un champ requis est faux fait refuser tout l'itinéraire
 *   (`null`, 400 côté route) : on ne devine ni une date ni des coordonnées ;
 * - un champ facultatif mal typé est retiré ; dans une liste de textes, seuls
 *   les textes restent ; une image n'est gardée qu'en http(s) ;
 * - une activité sans id ou sans nom en texte est retirée ; un type inconnu
 *   devient `visit` ;
 * - un transport qui n'est pas un objet, sans id ou d'un type inconnu, est
 *   retiré (l'app choisit son icône d'après le type) ;
 * - un hébergement qui n'est pas un objet, sans id ou sans nom, est retiré ;
 *   nommé, il garde sa place : adresse, lien et horaires manquants deviennent
 *   `''`, comme à l'import d'un tableur.
 *
 * Les clés inconnues ne sont pas recopiées. Celles que `cleanForTemplate`
 * retire ensuite (`bookingReference`, `status`…) le sont, typées : il lit la
 * référence pour reconnaître un lien de réservation privé.
 *
 * Pure et idempotente. Le serveur l'applique à la lecture d'une écriture
 * (`template-request.ts`) et avant tout stockage (`template-store.ts`).
 */

import type {
  Accommodation,
  Activity,
  DayImage,
  DayItinerary,
  EntityMetadata,
  Transport,
} from '@/lib/itinerary-data'

type Fields = Record<string, unknown>

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ── Valeurs ───────────────────────────────────────────────────────────────────

/** Un normaliseur rend la valeur bien typée, ou `undefined` pour la retirer. */
type Normalize<T> = (value: unknown) => T | undefined

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Texte requis par le type : vide plutôt qu'absent. */
function textOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Ni `NaN` ni `Infinity`, que msgpack sait transporter. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function texts(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined
}

function coordinates(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [lat, lng] = value.map(finite)
  return lat === undefined || lng === undefined ? undefined : [lat, lng]
}

/** Même règle que `cleanForTemplate` : une image `blob:`, `data:` ou `javascript:` ne part pas. */
function isImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/\S/i.test(value.trim())
}

function imageUrls(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter(isImageUrl) : undefined
}

function dayImage(value: unknown): DayImage | undefined {
  if (!isRecord(value) || !isImageUrl(value.url)) return undefined
  return { url: value.url, caption: textOrEmpty(value.caption) }
}

function dayImages(value: unknown): DayImage[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(dayImage).filter((image) => image !== undefined)
}

function oneOf<T extends string>(allowed: readonly T[]): Normalize<T> {
  return (value) => allowed.find((candidate) => candidate === value)
}

// ── Listes fermées ────────────────────────────────────────────────────────────

/** `true` seulement si `List` couvre toute l'union `T` : `tsc` échoue sinon. */
type Covers<T, List extends readonly T[]> = [Exclude<T, List[number]>] extends [
  never,
]
  ? true
  : false

const ACTIVITY_TYPES = [
  'visit',
  'transport',
  'food',
  'experience',
  'shopping',
] as const satisfies readonly Activity['type'][]
const TRANSPORT_TYPES = [
  'train',
  'car',
  'plane',
  'bus',
] as const satisfies readonly Transport['type'][]
const ACTIVITY_STATUSES = [
  'planned',
  'done',
  'skipped',
] as const satisfies readonly NonNullable<Activity['status']>[]
const BOOKING_STATUSES = [
  'planned',
  'booked',
  'checked-in',
  'completed',
] as const satisfies readonly NonNullable<Transport['status']>[]
const SOURCES = [
  'user',
  'import',
  'ai',
] as const satisfies readonly NonNullable<EntityMetadata['source']>[]
const PRIORITIES = [
  'must',
  'nice',
  'optional',
] as const satisfies readonly NonNullable<EntityMetadata['priority']>[]

const listsCovered: [
  Covers<Activity['type'], typeof ACTIVITY_TYPES>,
  Covers<Transport['type'], typeof TRANSPORT_TYPES>,
  Covers<NonNullable<Activity['status']>, typeof ACTIVITY_STATUSES>,
  Covers<NonNullable<Transport['status']>, typeof BOOKING_STATUSES>,
  Covers<NonNullable<Accommodation['status']>, typeof BOOKING_STATUSES>,
  Covers<NonNullable<EntityMetadata['source']>, typeof SOURCES>,
  Covers<NonNullable<EntityMetadata['priority']>, typeof PRIORITIES>,
] = [true, true, true, true, true, true, true]
void listsCovered

// ── Formes ────────────────────────────────────────────────────────────────────

/**
 * Un normaliseur par champ du type, requis compris : `tsc` échoue dès qu'un
 * champ est ajouté à `itinerary-data.ts` sans qu'on ait dit comment le lire.
 */
type Shape<T> = { [K in keyof T]-?: Normalize<T[K]> }

/** Les champs dont la valeur a le bon type, et eux seuls. */
function applyShape<T>(raw: Fields, shape: Shape<T>): Partial<T> {
  const result: Partial<T> = {}
  for (const key of Object.keys(shape) as (keyof T & string)[]) {
    // Une clé héritée (`constructor`…) n'est pas une valeur envoyée.
    const value = Object.hasOwn(raw, key) ? raw[key] : undefined
    const normalized = shape[key](value)
    if (normalized !== undefined) result[key] = normalized
  }
  return result
}

const activityType = oneOf(ACTIVITY_TYPES)

const ACTIVITY_SHAPE: Shape<Activity> = {
  id: text,
  name: text,
  description: text,
  // Le type ne sert qu'à l'icône et au libellé : à défaut, une visite.
  type: (value) => activityType(value) ?? 'visit',
  duration: text,
  coordinates,
  openAt: text,
  address: text,
  bookingUrl: text,
  reservationRequired: flag,
  price: finite,
  currency: text,
  rating: finite,
  tags: texts,
  status: oneOf(ACTIVITY_STATUSES),
  tips: text,
  images: imageUrls,
  source: oneOf(SOURCES),
  priority: oneOf(PRIORITIES),
}

const TRANSPORT_SHAPE: Shape<Transport> = {
  id: text,
  type: oneOf(TRANSPORT_TYPES),
  from: text,
  to: text,
  details: text,
  departureAddress: text,
  departureTime: text,
  arrivalTime: text,
  duration: text,
  provider: text,
  bookingUrl: text,
  bookingReference: text,
  price: finite,
  currency: text,
  seat: text,
  gate: text,
  terminal: text,
  status: oneOf(BOOKING_STATUSES),
  notes: text,
  source: oneOf(SOURCES),
  priority: oneOf(PRIORITIES),
}

const ACCOMMODATION_SHAPE: Shape<Accommodation> = {
  id: text,
  name: text,
  address: textOrEmpty,
  bookingUrl: textOrEmpty,
  checkIn: textOrEmpty,
  checkOut: textOrEmpty,
  images: imageUrls,
  price: finite,
  currency: text,
  bookingReference: text,
  status: oneOf(BOOKING_STATUSES),
  source: oneOf(SOURCES),
  priority: oneOf(PRIORITIES),
}

function normalizeActivity(value: unknown): Activity | undefined {
  if (!isRecord(value)) return undefined
  const activity = applyShape(value, ACTIVITY_SHAPE)
  const { id, name, type } = activity
  if (id === undefined || name === undefined || type === undefined) {
    return undefined
  }
  return { ...activity, id, name, type }
}

function activities(value: unknown): Activity[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .map(normalizeActivity)
    .filter((activity) => activity !== undefined)
}

function normalizeTransport(value: unknown): Transport | undefined {
  if (!isRecord(value)) return undefined
  const transport = applyShape(value, TRANSPORT_SHAPE)
  const { id, type } = transport
  if (id === undefined || type === undefined) return undefined
  return { ...transport, id, type }
}

function normalizeAccommodation(value: unknown): Accommodation | undefined {
  if (!isRecord(value)) return undefined
  const accommodation = applyShape(value, ACCOMMODATION_SHAPE)
  const { id, name } = accommodation
  if (id === undefined || name === undefined) return undefined
  return {
    ...accommodation,
    id,
    name,
    address: textOrEmpty(accommodation.address),
    bookingUrl: textOrEmpty(accommodation.bookingUrl),
    checkIn: textOrEmpty(accommodation.checkIn),
    checkOut: textOrEmpty(accommodation.checkOut),
  }
}

const DAY_SHAPE: Shape<DayItinerary> = {
  id: text,
  date: text,
  dayNumber: finite,
  city: text,
  title: text,
  highlights: texts,
  foodRecommendations: texts,
  walkingDistance: text,
  notes: text,
  packingTips: texts,
  dayType: text,
  tips: texts,
  accommodation: normalizeAccommodation,
  activities,
  transport: normalizeTransport,
  coordinates,
  images: dayImages,
  source: oneOf(SOURCES),
  priority: oneOf(PRIORITIES),
}

/** La journée bien typée, ou `undefined` si un champ requis est faux. */
function normalizeDay(value: unknown): DayItinerary | undefined {
  if (!isRecord(value)) return undefined
  const day = applyShape(value, DAY_SHAPE)
  const { id, date, dayNumber, city, title } = day
  if (
    id === undefined ||
    date === undefined ||
    dayNumber === undefined ||
    city === undefined ||
    title === undefined ||
    day.activities === undefined ||
    day.coordinates === undefined
  ) {
    return undefined
  }
  return {
    ...day,
    id,
    date,
    dayNumber,
    city,
    title,
    activities: day.activities,
    coordinates: day.coordinates,
  }
}

/**
 * L'itinéraire avec chaque valeur à son type, ou `null` si ce n'est pas une
 * liste de journées, ou si l'une d'elles a un champ requis faux (`id`,
 * `date`, `city`, `title` en texte, `dayNumber` fini, `activities` en liste,
 * `coordinates` à deux nombres finis).
 */
export function normalizeItineraryShape(value: unknown): DayItinerary[] | null {
  if (!Array.isArray(value)) return null
  const days: DayItinerary[] = []
  for (const candidate of value) {
    const day = normalizeDay(candidate)
    if (!day) return null
    days.push(day)
  }
  return days
}
