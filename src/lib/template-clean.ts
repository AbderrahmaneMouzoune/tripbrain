/**
 * Itinéraires modèles : ce qui part, ce qui reste.
 *
 * Le partage (`share.ts`) envoie une copie exacte à un co-voyageur —
 * références, sièges, statuts compris. Un modèle part chez des inconnus, sur
 * une page publique, indexée et permanente : il ne garde que ce qui sert à
 * refaire le voyage. Les règles suivent le §5 de `docs/itineraire-modele.md`
 * et le §3.1 de `docs/itineraire-modele-technique.md`.
 *
 * `cleanForTemplate` est idempotente : le téléphone l'applique pour l'aperçu
 * (écran A2), le serveur la rejoue avant tout stockage, et le second passage
 * ne change rien. Les ids ne bougent jamais : la mise à jour d'un voyage repris
 * (V1.1) s'appuie dessus.
 *
 * Le reste du module sert les écrans de publication : les vrais chiffres de
 * « ce qui part / ce qui reste » (A2), et des extraits de notes où les données
 * sensibles sont surlignées (A3). Tout est pur et tourne aussi sur le serveur.
 */

import type {
  Accommodation,
  Activity,
  DayImage,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'
import {
  COUNTRY_CODES,
  countryName,
  type TemplateOptions,
} from '@/lib/template-model'

// ── Champs qui peuvent partir ─────────────────────────────────────────────────

/*
 * Liste blanche, entité par entité. Le §5 garde « tout le reste », mais un
 * voyage importé d'un fichier JSON ou reçu par partage peut porter des clés que
 * le type ignore (`confirmationCode`, `phone`…) : rien ne les filtre à l'import.
 * Ce qui n'est pas listé ici ne part donc pas.
 *
 * Les champs toujours retirés sont nommés à part, et les assertions
 * `…Classified` font échouer `tsc` dès qu'un champ est ajouté à un type sans
 * qu'on ait décidé s'il part ou reste.
 */

const DAY_KEYS = [
  'id',
  'date',
  'dayNumber',
  'city',
  'title',
  'highlights',
  'foodRecommendations',
  'walkingDistance',
  'notes',
  'packingTips',
  'dayType',
  'tips',
  'accommodation',
  'activities',
  'transport',
  'coordinates',
  'images',
  'source',
  'priority',
] as const satisfies readonly (keyof DayItinerary)[]

const ACTIVITY_KEYS = [
  'id',
  'name',
  'description',
  'type',
  'duration',
  'coordinates',
  'openAt',
  'address',
  'bookingUrl',
  'reservationRequired',
  'price',
  'currency',
  'rating',
  'tags',
  'tips',
  'images',
  'source',
  'priority',
] as const satisfies readonly (keyof Activity)[]
/** Fait, sauté… : le repreneur repart de « prévu ». */
type ActivityRemoved = 'status'

const TRANSPORT_KEYS = [
  'id',
  'type',
  'from',
  'to',
  'details',
  'departureAddress',
  'departureTime',
  'arrivalTime',
  'duration',
  'provider',
  'bookingUrl',
  'price',
  'currency',
  'notes',
  'source',
  'priority',
] as const satisfies readonly (keyof Transport)[]
type TransportRemoved =
  | 'bookingReference'
  | 'seat'
  | 'gate'
  | 'terminal'
  | 'status'

const ACCOMMODATION_KEYS = [
  'id',
  'name',
  'address',
  'bookingUrl',
  'checkIn',
  'checkOut',
  'images',
  'price',
  'currency',
  'source',
  'priority',
] as const satisfies readonly (keyof Accommodation)[]
type AccommodationRemoved = 'bookingReference' | 'status'

/** `true` seulement si chaque champ de `T` est soit gardé, soit retiré. */
type AllClassified<
  T,
  Kept extends readonly (keyof T)[],
  Removed extends keyof T,
> = [Exclude<keyof T, Kept[number] | Removed>] extends [never] ? true : false

const dayKeysClassified: AllClassified<DayItinerary, typeof DAY_KEYS, never> =
  true
const activityKeysClassified: AllClassified<
  Activity,
  typeof ACTIVITY_KEYS,
  ActivityRemoved
> = true
const transportKeysClassified: AllClassified<
  Transport,
  typeof TRANSPORT_KEYS,
  TransportRemoved
> = true
const accommodationKeysClassified: AllClassified<
  Accommodation,
  typeof ACCOMMODATION_KEYS,
  AccommodationRemoved
> = true
void [
  dayKeysClassified,
  activityKeysClassified,
  transportKeysClassified,
  accommodationKeysClassified,
]

const DAY_KEY_SET: ReadonlySet<string> = new Set(DAY_KEYS)
const ACTIVITY_KEY_SET: ReadonlySet<string> = new Set(ACTIVITY_KEYS)
const TRANSPORT_KEY_SET: ReadonlySet<string> = new Set(TRANSPORT_KEYS)
const ACCOMMODATION_KEY_SET: ReadonlySet<string> = new Set(ACCOMMODATION_KEYS)

/**
 * Copie réduite aux clés listées, sans valeur `undefined` : le JSON stocké ne
 * garde aucune trace de ce qui a été retiré. Un champ requis doit figurer dans
 * la liste, sinon le résultat ne serait plus du type annoncé.
 */
function pickKnown<T extends object>(entity: T, keys: ReadonlySet<string>): T {
  const copy = { ...entity }
  for (const key of Object.keys(copy)) {
    const value: unknown = Reflect.get(copy, key)
    if (!keys.has(key) || value === undefined) Reflect.deleteProperty(copy, key)
  }
  return copy
}

function omitNotes<T extends { notes?: string }>(entity: T): Omit<T, 'notes'> {
  const { notes: _notes, ...rest } = entity
  return rest
}

function omitPrice<T extends { price?: number; currency?: string }>(
  entity: T,
): Omit<T, 'price' | 'currency'> {
  const { price: _price, currency: _currency, ...rest } = entity
  return rest
}

function omitBookingUrl<T extends { bookingUrl?: string }>(
  entity: T,
): Omit<T, 'bookingUrl'> {
  const { bookingUrl: _url, ...rest } = entity
  return rest
}

// ── Liens et images ───────────────────────────────────────────────────────────

/**
 * Marqueurs d'une page de réservation privée. On les cherche dans le chemin, la
 * requête et l'ancre, jamais dans le domaine : `booking.com/hotel/…` est une
 * page publique, `secure.booking.com/confirmation…` ne l'est pas. Accents
 * ignorés : `ma-réservation` contient `reservation`.
 *
 * Un faux positif retire un lien utile ; un faux négatif publie l'accès à la
 * réservation de l'auteur. La liste penche donc vers le retrait. Un lien qui
 * porte une adresse e-mail ou un numéro de téléphone est retiré lui aussi,
 * quel que soit le nom du paramètre (voir `isPrivateBookingUrl`).
 */
const PRIVATE_URL_MARKERS = [
  'confirm', // confirmation, confirmed, confirm.html…
  'mybooking',
  'my-booking',
  'manage',
  'reservation',
  'booking_id',
  'bookingid',
  'itinerary_id',
  // Hotels.com `?itineraryId=…`, Expedia, et leurs variantes.
  'itineraryid',
  'itinerarynumber',
  'itinerary-number',
  'bookingnumber',
  'booking_number',
  'booking-number',
  'booking_no',
  // Klook `/order/detail/?orderNo=…`, et autres numéros de commande.
  'orderno',
  'order_no',
  'ordernumber',
  'order/detail',
  // Espaces client : Viator `/account/booking/…`, Trainline `/my-account/…`.
  'account/booking',
  'my-account',
  'mytickets',
  'my-trips',
  // Booking.com `?pincode=…` : avec le numéro, l'accès à la réservation.
  'pincode',
  'voucher',
  // Trip.com : `/hotels/ctorderdetail?orderid=…` (voyage de démo).
  'orderid',
  'order_id',
  'orderdetail',
  'pnr',
  'token',
  'auth',
  'secret',
  'bn=',
  'conf=',
  // Gestion d'un billet : un code de réservation et un nom de famille
  // suffisent pour voir, modifier ou annuler un vol (easyJet
  // `ViewBooking?bookingReference=…&lastName=…`, Air France
  // `?bookingCode=…&lastName=…`, SNCF Connect `?reference=…&name=…`).
  // Pas de `ref=` nu : trop de liens publics s'en servent pour le suivi.
  'bookingref', // bookingRef, bookingReference
  'booking_reference',
  'booking-reference',
  'bookingcode',
  'booking_code',
  'reference=',
  'recordlocator',
  'recloc',
  'viewbooking',
  'lastname',
  'last_name',
  'surname',
  'familyname',
  'email=',
]

/** Formes de chemin privées : Expedia `/trips/72118734123456`. */
const PRIVATE_URL_SHAPES = [/\/trips\/\d{8,}/]

/** En dessous, une « référence » (`12`, `AB`) se retrouverait dans n'importe quelle URL. */
const MIN_REFERENCE_LENGTH = 4

/** Minuscules sans accents : `Réservation` → `reservation`. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Lettres et chiffres seuls, en minuscules, sans accents : `4021 553 117`
 * doit se reconnaître dans `/stay/4021553117`, et `K7X-2PQ` dans
 * `?ref=k7x2pq`.
 */
function alphanumeric(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Les références de réservation d'un voyage, prêtes à comparer : celles de
 * chaque transport et hébergement, sans séparateurs, assez longues pour
 * compter. Un lien qui en contient une est privé, quelle que soit l'entité
 * qui le porte : une activité n'a pas de référence, et un hôtel sur plusieurs
 * nuits est souvent saisi avec sa référence sur la première seulement.
 */
function tripReferences(itinerary: readonly DayItinerary[]): Set<string> {
  const references = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value !== 'string') return
    const reference = alphanumeric(value)
    if (reference.length >= MIN_REFERENCE_LENGTH) references.add(reference)
  }
  for (const day of itinerary) {
    add(day.transport?.bookingReference)
    add(day.accommodation?.bookingReference)
  }
  return references
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Un lien de réservation est-il privé ? Vrai s'il n'est pas en http(s), s'il
 * porte des identifiants, si son chemin ou sa requête ressemble à une
 * confirmation ou à un espace client, s'il porte une adresse e-mail ou un
 * numéro de téléphone, ou s'il contient l'une des `references` (une seule,
 * ou toutes celles du voyage).
 */
export function isPrivateBookingUrl(
  url: string,
  references: Iterable<string> | string = [],
): boolean {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return true
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
  if (parsed.username || parsed.password) return true

  const raw = parsed.pathname + parsed.search + parsed.hash
  const decoded = safeDecode(raw)
  const haystacks = [fold(raw), fold(decoded)]
  const contains = (needle: string) =>
    haystacks.some((haystack) => haystack.includes(needle))

  if (PRIVATE_URL_MARKERS.some(contains)) return true
  if (
    PRIVATE_URL_SHAPES.some((shape) => haystacks.some((h) => shape.test(h)))
  ) {
    return true
  }
  // `?mail=…`, `?e=…`, `/clients/<adresse>/…`, `?tel=%2B33…` : pas une page
  // publique. Sur le texte brut et décodé (`%40`, `%2B`), avant les minuscules.
  if ([raw, decoded].some(containsContact)) return true
  // La référence est comparée sans séparateurs, d'un côté comme de l'autre :
  // l'auteur la saisit comme elle est imprimée, le site l'écrit à sa façon.
  const refs = (typeof references === 'string' ? [references] : [...references])
    .map(alphanumeric)
    .filter((ref) => ref.length >= MIN_REFERENCE_LENGTH)
  if (refs.length === 0) return false
  const squashed = haystacks.map(alphanumeric)
  return refs.some((ref) => squashed.some((haystack) => haystack.includes(ref)))
}

/** Lien gardé dans le modèle : une URL http(s) publique, non vide. */
function isShareableBookingUrl(
  url: unknown,
  references: ReadonlySet<string>,
): boolean {
  return (
    typeof url === 'string' &&
    url.trim() !== '' &&
    !isPrivateBookingUrl(url, references)
  )
}

/**
 * Une image `blob:` ou `data:` ne vit que sur l'appareil qui l'a créée : chez le
 * repreneur, elle ne mène nulle part (et une `data:` alourdit le modèle).
 */
function isPortableImageUrl(url: unknown): boolean {
  return typeof url === 'string' && /^https?:\/\/\S/i.test(url.trim())
}

function withPortableImages<T extends { images?: string[] }>(
  entity: T,
): T | Omit<T, 'images'> {
  if (entity.images === undefined) return entity
  const images = Array.isArray(entity.images)
    ? entity.images.filter(isPortableImageUrl)
    : []
  if (images.length > 0) return { ...entity, images }
  const { images: _dropped, ...rest } = entity
  return rest
}

function withPortableDayImages(day: DayItinerary): DayItinerary {
  if (day.images === undefined) return day
  const images: DayImage[] = Array.isArray(day.images)
    ? day.images
        .filter((image) => isPortableImageUrl(image?.url))
        .map((image) => ({
          url: image.url,
          caption: typeof image.caption === 'string' ? image.caption : '',
        }))
    : []
  if (images.length > 0) return { ...day, images }
  const { images: _dropped, ...rest } = day
  return rest
}

// ── Nettoyage ─────────────────────────────────────────────────────────────────

/**
 * Ce que le nettoyage d'une journée doit savoir du voyage entier : les
 * références de réservation (`tripReferences`), lues avant d'être retirées.
 */
interface CleanContext {
  options: TemplateOptions
  references: ReadonlySet<string>
}

function cleanActivity(activity: Activity, context: CleanContext): Activity {
  const { options, references } = context
  let cleaned: Activity = pickKnown(activity, ACTIVITY_KEY_SET)
  if (!options.includePrices) cleaned = omitPrice(cleaned)
  if (
    cleaned.bookingUrl !== undefined &&
    !isShareableBookingUrl(cleaned.bookingUrl, references)
  ) {
    cleaned = omitBookingUrl(cleaned)
  }
  return withPortableImages(cleaned)
}

function cleanTransport(
  transport: Transport,
  context: CleanContext,
): Transport {
  const { options, references } = context
  let cleaned: Transport = pickKnown(transport, TRANSPORT_KEY_SET)
  if (!options.includeNotes) cleaned = omitNotes(cleaned)
  if (!options.includePrices) cleaned = omitPrice(cleaned)
  // Les références du voyage (la sienne comprise) sont lues sur l'original.
  if (
    cleaned.bookingUrl !== undefined &&
    !isShareableBookingUrl(cleaned.bookingUrl, references)
  ) {
    cleaned = omitBookingUrl(cleaned)
  }
  return cleaned
}

function cleanAccommodation(
  accommodation: Accommodation,
  context: CleanContext,
): Accommodation {
  const { options, references } = context
  let cleaned: Accommodation = pickKnown(accommodation, ACCOMMODATION_KEY_SET)
  if (!options.includePrices) cleaned = omitPrice(cleaned)
  // `bookingUrl` est requis par le type : on le vide au lieu de le retirer.
  if (!isShareableBookingUrl(cleaned.bookingUrl, references)) {
    cleaned = { ...cleaned, bookingUrl: '' }
  }
  return withPortableImages(cleaned)
}

function cleanDay(day: DayItinerary, context: CleanContext): DayItinerary {
  const { options } = context
  let cleaned: DayItinerary = {
    ...pickKnown(day, DAY_KEY_SET),
    activities: day.activities.map((activity) =>
      cleanActivity(activity, context),
    ),
  }
  if (cleaned.accommodation) {
    cleaned = {
      ...cleaned,
      accommodation: cleanAccommodation(cleaned.accommodation, context),
    }
  }
  if (cleaned.transport) {
    cleaned = {
      ...cleaned,
      transport: cleanTransport(cleaned.transport, context),
    }
  }
  if (!options.includeNotes) cleaned = omitNotes(cleaned)
  return withPortableDayImages(cleaned)
}

/**
 * L'itinéraire tel qu'il part dans un modèle (§5 de la spec) :
 * - toujours retirés : `bookingReference`, `seat`, `gate`, `terminal` et tous
 *   les `status` ;
 * - `notes` (journée, transport) : retirées sauf si `includeNotes` ;
 * - `price` et `currency` : retirés sauf si `includePrices` ;
 * - `bookingUrl` privé : vidé sur un hébergement (champ requis), retiré
 *   ailleurs ; un lien qui contient la référence de n'importe quelle
 *   réservation du voyage est privé ;
 * - images hors http(s) retirées ; un tableau vide disparaît ;
 * - clés inconnues du type retirées (voir la liste blanche plus haut).
 *
 * Pure, idempotente ; ids, ordre des journées et des activités inchangés. Une
 * clé retirée disparaît : jamais de valeur `undefined` dans le résultat.
 */
export function cleanForTemplate(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
): DayItinerary[] {
  const context = { options, references: tripReferences(itinerary) }
  return itinerary.map((day) => cleanDay(day, context))
}

// ── Écran A2 : ce qui part, ce qui reste ──────────────────────────────────────

/**
 * Les chiffres réels de l'écran A2. `goes` décrit le contenu du modèle ;
 * `stays` ce qui ne quittera pas le téléphone. Une rubrique à 0 n'a rien à
 * afficher.
 */
export interface TemplateCleaningSummary {
  /** Ce qui part avec le modèle. */
  goes: {
    days: number
    activities: number
    /** Hébergements distincts : même nom (casse ignorée) = un seul hôtel. */
    accommodations: number
    /** Journées avec un trajet (train, vol, voiture, bus). */
    transports: number
    /** Conseils de journée (un par ligne) et d'activité. */
    tips: number
  }
  /** Ce qui reste sur le téléphone. */
  stays: {
    /** Références de réservation distinctes (hébergements, transports). */
    bookingReferences: number
    /** Champs siège, porte et terminal renseignés, tous trajets confondus. */
    seats: number
    /**
     * Statuts autres que « prévu » (fait, sauté, réservé, enregistré,
     * terminé). « Prévu » est déjà l'état de départ du repreneur : le compter
     * gonflerait le chiffre sans rien apprendre à l'auteur. Un hôtel sur
     * plusieurs nuits compte une fois.
     */
    statuses: number
    /** Notes de journée et de transport — 0 quand l'auteur les inclut. */
    notes: number
    /** Prix renseignés — 0 quand l'auteur les inclut. Un hôtel compte une fois. */
    prices: number
    /** Liens de réservation privés distincts (confirmation, espace client…). */
    privateLinks: number
    /** Images distinctes stockées sur l'appareil (`blob:`, `data:`…). */
    deviceImages: number
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function nameKey(value: string): string {
  return value.trim().toLocaleLowerCase('fr')
}

/** Un hôtel répété sur plusieurs nuits : même nom, casse ignorée (sinon son id). */
function accommodationKey(accommodation: Accommodation): string {
  return hasText(accommodation.name)
    ? `name:${nameKey(accommodation.name)}`
    : `id:${accommodation.id}`
}

function hasInformativeStatus(entity: { status?: string }): boolean {
  return hasText(entity.status) && entity.status !== 'planned'
}

export function summarizeTemplateCleaning(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
): TemplateCleaningSummary {
  const stays = new Map<string, Accommodation[]>()
  const references = new Set<string>()
  const privateLinks = new Set<string>()
  const deviceImages = new Set<string>()
  let activities = 0
  let transports = 0
  let tips = 0
  let seats = 0
  let statuses = 0
  let notes = 0
  let prices = 0

  // Mêmes références que `cleanForTemplate` : le chiffre est ce qui part.
  const tripRefs = tripReferences(itinerary)
  const noteLink = (url: unknown) => {
    if (hasText(url) && !isShareableBookingUrl(url, tripRefs)) {
      privateLinks.add(url.trim())
    }
  }
  const noteImages = (urls: readonly unknown[] | undefined) => {
    for (const url of urls ?? []) {
      if (hasText(url) && !isPortableImageUrl(url)) deviceImages.add(url)
    }
  }

  for (const day of itinerary) {
    tips += (day.tips ?? []).filter(hasText).length
    if (hasText(day.notes)) notes += 1
    noteImages(day.images?.map((image) => image?.url))

    for (const activity of day.activities) {
      activities += 1
      if (hasText(activity.tips)) tips += 1
      if (hasInformativeStatus(activity)) statuses += 1
      if (typeof activity.price === 'number') prices += 1
      noteLink(activity.bookingUrl)
      noteImages(activity.images)
    }

    const transport = day.transport
    if (transport) {
      transports += 1
      if (hasText(transport.bookingReference)) {
        references.add(nameKey(transport.bookingReference))
      }
      for (const field of [
        transport.seat,
        transport.gate,
        transport.terminal,
      ]) {
        if (hasText(field)) seats += 1
      }
      if (hasInformativeStatus(transport)) statuses += 1
      if (hasText(transport.notes)) notes += 1
      if (typeof transport.price === 'number') prices += 1
      noteLink(transport.bookingUrl)
    }

    const accommodation = day.accommodation
    if (accommodation) {
      const key = accommodationKey(accommodation)
      stays.set(key, [...(stays.get(key) ?? []), accommodation])
      if (hasText(accommodation.bookingReference)) {
        references.add(nameKey(accommodation.bookingReference))
      }
      noteLink(accommodation.bookingUrl)
      noteImages(accommodation.images)
    }
  }

  for (const nights of stays.values()) {
    if (nights.some(hasInformativeStatus)) statuses += 1
    if (nights.some((night) => typeof night.price === 'number')) prices += 1
  }

  return {
    goes: {
      days: itinerary.length,
      activities,
      accommodations: stays.size,
      transports,
      tips,
    },
    stays: {
      bookingReferences: references.size,
      seats,
      statuses,
      notes: options.includeNotes ? 0 : notes,
      prices: options.includePrices ? 0 : prices,
      privateLinks: privateLinks.size,
      deviceImages: deviceImages.size,
    },
  }
}

// ── Écran A3 : données sensibles dans les notes ───────────────────────────────

export type SensitiveKind = 'digits' | 'phone' | 'email' | 'name'

/** Un passage à surligner : `text.slice(start, end)`. */
export interface SensitiveSpan {
  start: number
  end: number
  kind: SensitiveKind
}

/** Le plus précis l'emporte quand deux détections se chevauchent. */
const KIND_PRIORITY: Record<SensitiveKind, number> = {
  email: 0,
  phone: 1,
  digits: 2,
  name: 3,
}

const EMAIL =
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu
/** Codes, digicodes, numéros de réservation. */
const DIGITS = /\d{4,}/g
/** `+33 6 12 34 56 78`, `+81 80-3312-4471`, `+1 (212) 555-1234`. */
const INTERNATIONAL_PHONE =
  /\+\d{1,3}(?:[ .\-\u00a0\u202f]?\(0\))?(?:[ .\-\u00a0\u202f]?(?:\(\d{1,4}\)|\d{1,4})){1,7}(?!\d)/g
/**
 * `06 12 34 56 78`, `0612345678`, `080-3312-4471`, `03-1234-5678`. Le `(?!\d)`
 * final force à prendre le numéro entier plutôt qu'un préfixe collé à la suite.
 */
const NATIONAL_PHONE = /0\d{1,4}(?:[ .\-\u00a0\u202f]?\d{2,4}){1,5}(?!\d)/g
/**
 * Numéros de vol ou de train : `CA1590`, `AF 274`, `9C8951`, `TGV 6231`,
 * `ICE 578`. Publics par nature (horaires affichés partout), ils ne sont pas
 * surlignés, ni leurs chiffres.
 */
const SERVICE_NUMBER =
  /\b(?:[A-Z]{2}\s?|\d[A-Z]|(?:TGV|ICE|TER|AVE|KTX|SRT|THSR|RJX|EST)\s?)\d{2,4}\b/g
const URL_LIKE = /(?:https?:\/\/|www\.)\S+/gi
/** Un mot, apostrophes et traits d'union compris : `Xi’an`, `Jean-Pierre`. */
const WORD = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu
/** `l'`, `d’`, `qu'`… : « d'Osaka » se lit « Osaka ». */
const ELISION = /^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu|quoiqu)['’]/i

const INTERNATIONAL_DIGITS = { min: 8, max: 15 }
const NATIONAL_DIGITS = { min: 9, max: 12 }

/** Comparaison sans casse, sans accents, apostrophe droite. */
function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
}

function squash(word: string): string {
  return word.replace(/['-]/g, '')
}

function wordSet(words: string): ReadonlySet<string> {
  return new Set(words.split(/\s+/).filter(Boolean).map(normalizeWord))
}

/**
 * Mots à majuscule qui ne sont pas des noms de personne : calendrier, mots de
 * voyage, civilités, marques et applis qu'on cite dans ses notes, gentilés.
 * Ils ne sont jamais surlignés.
 */
const STOP_WORDS = wordSet(`
  lundi mardi mercredi jeudi vendredi samedi dimanche
  janvier février mars avril mai juin juillet août septembre octobre novembre décembre
  monday tuesday wednesday thursday friday saturday sunday
  january february march april may june july august september october november december
  jour jours journée matin midi après-midi soir soirée nuit semaine week-end weekend
  noël pâques nouvel an
  note notes nb attention important rappel astuce conseil conseils info infos ok
  check check-in check-out checkin checkout wifi wi-fi
  monsieur madame mademoiselle mme mlle mr mrs ms dr
  alipay wechat didi uber grab airbnb booking expedia agoda google maps waze
  whatsapp line telegram instagram facebook suica pasmo icoca klook trip ctrip
  tripadvisor tabelog visa mastercard amex revolut wise paypal apple android
  iphone tripbrain pass rail eurail metro métro euro euros yen yens yuan
  français anglais japonais chinois coréen coréens taïwanais thaï vietnamien
  européen européens américain américains english french japanese chinese korean
  the and all this my your our we you they
  premier premium gold platinum infinite classic business economy
  prime plus pro lite translate traduction lens drive wallet pay special
  lounge
`)
/*
 * Les deux dernières lignes : gammes de cartes et d'abonnements (« Visa
 * Premier »), produits d'applis (« Google Traduction ») — des marques, pas des
 * personnes.
 */

/**
 * Libellés qui annoncent une personne : après « Hôte : », « Contact : »,
 * « Guide : », le mot à majuscule est un prénom, pas un début de phrase.
 */
const PERSON_LABELS = wordSet(`
  hôte hôtes hôtesse host hosts contact contacts guide guides chauffeur
  chauffeurs driver propriétaire proprio owner gérant gérante manager
  responsable interlocuteur interlocutrice référent référente nom name prénom
  rdv rendez-vous appeler contacter demander
`)

/**
 * Mots de lieu. Un mot à majuscule voisin de l'un d'eux appartient à un nom de
 * lieu (« Musée Ghibli », « Gare de Lyon », « Grand Palais », « le temple
 * Kiyomizu ») : ni lui ni ses voisins ne sont surlignés.
 */
const PLACE_WORDS = wordSet(`
  hôtel hotel auberge ryokan hostel guesthouse gare station aéroport airport
  terminal port quai pier jetée musée museum galerie gallery temple sanctuaire
  shrine pagode pagoda église church cathédrale cathedral basilique basilica
  chapelle chapel abbaye abbey monastère monastery mosquée mosque synagogue
  château castle palais palace fort citadelle citadel tour tower pont bridge
  porte gate mur muraille wall parc park jardin jardins garden gardens forêt
  forest bois mont mount montagne mountain colline hill volcan volcano lac lake
  rivière river fleuve cascade chute chutes falls baie bay plage beach île
  island cap cape vallée valley gorge gorges grotte cave canyon désert rue
  street avenue boulevard place square plaza piazza road lane allée alley
  ruelle chemin route quartier district ward village ville city cité marché
  market bazar souk mall centre center stade stadium théâtre theatre theater
  opéra opera zoo aquarium université university bibliothèque library
  restaurant café bar brasserie bistrot izakaya monument mémorial memorial
  mausolée mausoleum tombeau tomb statue observatoire observatory belvédère
  terrasse onsen spa hutong hutongs international intl
  shinkansen express limited rapid ferry
  nord sud est ouest north south east west central grand grande petit petite
  vieux vieille nouveau nouvelle saint sainte san santa new old upper lower
  haut haute
  europe asie afrique amérique océanie antarctique
  paris lyon marseille toulouse nice nantes bordeaux lille strasbourg
  montpellier rennes bruxelles genève lausanne montréal québec londres
`)
/*
 * Les dernières lignes ci-dessus : services de train ou de bateau, nommés
 * comme des lieux (« Tobu Limited Express », « Shinkansen Hikari ») ;
 * continents, et les villes de départ les plus probables d'un auteur
 * francophone (« vol retour vers Paris »), qui ne sont souvent pas des étapes
 * du voyage.
 */

/**
 * Après eux, un mot à majuscule est un lieu : « en Chine », « au Japon »,
 * « vers Osaka ». Pas « à », qui précède aussi bien une personne (« dire à
 * Kenji ») qu'un lieu.
 */
const PLACE_PREPOSITIONS = wordSet('en au aux vers depuis')

let countryWords: ReadonlySet<string> | null = null

/** Mots des noms de pays en français (« Japon », « Corée du Sud »). */
function countryWordSet(): ReadonlySet<string> {
  countryWords ??= new Set(
    COUNTRY_CODES.flatMap(
      (code) => normalizeWord(countryName(code)).match(WORD) ?? [],
    ),
  )
  return countryWords
}

/** Mots de liaison à l'intérieur d'un nom propre : « Place de la Concorde ». */
const CONNECTORS = wordSet('de du des la le les of the')

/** Un point après eux n'ouvre pas de phrase : « M. Tanaka ». */
const HONORIFICS = wordSet('m mme mlle mr mrs ms dr pr')

/** Après eux, une majuscule ouvre une phrase ou un élément de liste. */
const SENTENCE_BREAKS = '.!?…:;—–-|•·*>→/'
/** Sautés en remontant vers le début de la phrase : « (Kenji », « “Kenji ». */
const OPENERS = '([{«“‘"\'¿¡'

interface PlaceIndex {
  words: ReadonlySet<string>
}

/** Mots des lieux du voyage, entiers, sans ponctuation et découpés. */
function buildPlaceIndex(knownPlaces: readonly string[]): PlaceIndex {
  const words = new Set<string>()
  for (const place of knownPlaces) {
    for (const token of normalizeWord(place).match(WORD) ?? []) {
      words.add(token)
      words.add(squash(token))
      for (const part of token.split(/['-]/)) if (part) words.add(part)
    }
  }
  return { words }
}

/** Lieu du voyage, ou pays : « Japon » n'est pas un prénom. */
function isKnownPlace(norm: string, index: PlaceIndex): boolean {
  const countries = countryWordSet()
  const known = (word: string) => index.words.has(word) || countries.has(word)
  if (known(norm) || known(squash(norm))) return true
  const parts = norm.split(/['-]/).filter(Boolean)
  return parts.length > 1 && parts.every(known)
}

function inWordSet(norm: string, set: ReadonlySet<string>): boolean {
  return set.has(norm) || set.has(squash(norm))
}

function isHonorificBefore(text: string, dot: number): boolean {
  let start = dot
  while (start > 0 && /\p{L}/u.test(text[start - 1])) start -= 1
  return HONORIFICS.has(normalizeWord(text.slice(start, dot)))
}

/**
 * Le mot qui commence en `index` suit-il un deux-points (« Hôte : Rui ») ?
 * Renvoie alors le libellé, le mot juste avant les deux-points (normalisé,
 * `''` s'il n'y en a pas) ; `null` s'il n'y a pas de deux-points.
 */
function colonLabel(text: string, index: number): string | null {
  let colon = index - 1
  while (
    colon >= 0 &&
    ((/\s/.test(text[colon]) && text[colon] !== '\n' && text[colon] !== '\r') ||
      OPENERS.includes(text[colon]))
  ) {
    colon -= 1
  }
  if (colon < 0 || text[colon] !== ':') return null
  let end = colon
  while (end > 0 && /[^\S\n\r]/.test(text[end - 1])) end -= 1
  let start = end
  while (start > 0 && /[\p{L}\p{M}'’-]/u.test(text[start - 1])) start -= 1
  return normalizeWord(text.slice(start, end))
}

/** Le mot qui commence en `index` ouvre-t-il une phrase (ou une ligne) ? */
function isSentenceStart(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const char = text[i]
    if (char === '\n' || char === '\r') return true
    if (/\s/.test(char) || OPENERS.includes(char)) continue
    if (char === '.' && isHonorificBefore(text, i)) return false
    return SENTENCE_BREAKS.includes(char)
  }
  return true
}

interface Token {
  /** Début du mot, élision comprise (`d'Osaka` → le `d`). */
  rawStart: number
  /** Début du mot sans l'élision (`Osaka`). */
  start: number
  end: number
  norm: string
  capitalized: boolean
  /**
   * Peut-il être un nom de personne ? Une majuscule suivie d'au moins deux
   * minuscules : ni sigle (`PKX`, `VIP`), ni mot de deux lettres (`Le`, `Mo`).
   */
  nameLike: boolean
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(WORD)) {
    const rawStart = match.index ?? 0
    const elision = ELISION.exec(match[0])?.[0].length ?? 0
    const word = match[0].slice(elision)
    // Tout en capitales (`PKX`, `VIP`, `JR`) : un sigle, pas un nom.
    const capitalized = /^\p{Lu}/u.test(word) && /\p{Ll}/u.test(word)
    tokens.push({
      rawStart,
      start: rawStart + elision,
      end: rawStart + match[0].length,
      norm: normalizeWord(word),
      capitalized,
      nameLike: capitalized && (word.match(/\p{Ll}/gu)?.length ?? 0) >= 2,
    })
  }
  return tokens
}

function rangesOf(text: string, pattern: RegExp): [number, number][] {
  return Array.from(text.matchAll(pattern), (match) => {
    const start = match.index ?? 0
    return [start, start + match[0].length]
  })
}

function insideAny(ranges: readonly [number, number][], at: number): boolean {
  return ranges.some(([start, end]) => at >= start && at < end)
}

/**
 * Noms propres hors lieux : un indice pour l'auteur, pas une garantie. On
 * préfère en manquer un que surligner des mots ordinaires, d'où les règles :
 * - un nom a une majuscule et au moins deux minuscules (`Rui`, pas `Li` ni
 *   `VIP`) ;
 * - un mot en début de phrase ou de ligne n'est jamais surligné, sauf après
 *   un deux-points quand le libellé annonce une personne (« Hôte : Rui ») ou
 *   qu'un second nom le suit (« Rdv : Kaori Tanaka ») ;
 * - une suite de mots à majuscule (« Taiwan Taoyuan International Airport »)
 *   qui touche un lieu du voyage ou un mot de lieu est un lieu, en entier ;
 * - de même après un mot de lieu en minuscules (« le restaurant Jiro ») ou
 *   une préposition de lieu (« au Japon ») ; un pays n'est jamais surligné ;
 * - mots courants, marques et gammes (`STOP_WORDS` : « Visa Premier »),
 *   sigles et mots dans une URL ignorés.
 */
function nameSpans(text: string, places: PlaceIndex): SensitiveSpan[] {
  const tokens = tokenize(text)
  const urls = rangesOf(text, URL_LIKE)
  const spans: SensitiveSpan[] = []
  const gapIsSpace = (from: number, to: number) =>
    to > from && /^\s+$/.test(text.slice(from, to))

  let sequence: Token[] = []
  let before: Token | null = null

  const flush = () => {
    if (sequence.length === 0) return
    const afterPlaceWord =
      before !== null &&
      !before.capitalized &&
      (inWordSet(before.norm, PLACE_WORDS) ||
        PLACE_PREPOSITIONS.has(before.norm)) &&
      gapIsSpace(before.end, sequence[0].rawStart)
    const isPlace =
      afterPlaceWord ||
      sequence.some(
        (token) =>
          isKnownPlace(token.norm, places) ||
          inWordSet(token.norm, PLACE_WORDS),
      )
    if (!isPlace) {
      const candidate = (token: Token) =>
        token.nameLike &&
        !inWordSet(token.norm, STOP_WORDS) &&
        !insideAny(urls, token.start)
      // Après « Libellé : », le premier mot ouvre la valeur. C'est un prénom
      // si le libellé annonce une personne (« Hôte : Rui ») ou si un second
      // nom le suit (« Guide : Kaori Tanaka ») ; sinon un début de phrase
      // (« Note : Penser à réserver »).
      const label = colonLabel(text, sequence[0].rawStart)
      const opensValue =
        label !== null &&
        (inWordSet(label, PERSON_LABELS) ||
          (sequence.length > 1 && candidate(sequence[1])))
      let current: SensitiveSpan | null = null
      for (const [position, token] of sequence.entries()) {
        const flagged =
          (!isSentenceStart(text, token.rawStart) ||
            (position === 0 && opensValue)) &&
          candidate(token)
        if (!flagged) {
          current = null
        } else if (current) {
          current.end = token.end // « Kenji Tanaka » : un seul surlignage
        } else {
          current = { start: token.start, end: token.end, kind: 'name' }
          spans.push(current)
        }
      }
    }
    sequence = []
  }

  let previous: Token | null = null
  for (const token of tokens) {
    const contiguous =
      previous !== null &&
      sequence.length > 0 &&
      gapIsSpace(previous.end, token.rawStart)
    if (token.capitalized) {
      if (!contiguous) {
        flush()
        before = previous
      }
      sequence.push(token)
    } else if (!(contiguous && CONNECTORS.has(token.norm))) {
      flush()
    }
    previous = token
  }
  flush()
  return spans
}

function countDigits(value: string): number {
  return value.replace(/\D/g, '').length
}

/** Retire les derniers groupes d'un numéro trop long (« 06 12 34 56 78 2026 »). */
function trimPhone(value: string, max: number): string {
  let phone = value
  while (countDigits(phone) > max) {
    const shorter = phone.replace(/[ .\-\u00a0\u202f]?\(?\d+\)?$/, '')
    if (shorter === phone) break
    phone = shorter
  }
  return phone
}

/**
 * Numéros de téléphone, qui peuvent se chevaucher (`findSpans` les fusionne).
 * Après chaque correspondance, retenue ou non, la recherche repart du
 * caractère suivant et non de sa fin : un numéro peut commencer dans les
 * chiffres qu'une autre a avalés (« 2026-05-10 06 12 34 56 78 », où « 05-10
 * 06… » est rejeté, collé à « 2026 » ; « 06 12 34 56 78 06 98 76 54 32 », où
 * le premier numéro prend le « 06 » du second).
 */
function phoneSpans(text: string): SensitiveSpan[] {
  const spans: SensitiveSpan[] = []
  const patterns = [
    { pattern: INTERNATIONAL_PHONE, limits: INTERNATIONAL_DIGITS },
    { pattern: NATIONAL_PHONE, limits: NATIONAL_DIGITS },
  ]
  for (const { pattern, limits } of patterns) {
    // Copie locale : `lastIndex` est modifié ici, jamais sur le motif partagé.
    const search = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = search.exec(text)) !== null) {
      const start = match.index
      const phone = trimPhone(match[0], limits.max)
      const end = start + phone.length
      const digits = countDigits(phone)
      // Collé à un mot ou à d'autres chiffres, ce n'est pas un numéro isolé.
      const glued =
        /[\p{L}\p{N}+]/u.test(text[start - 1] ?? '') ||
        /\p{N}/u.test(text[end] ?? '')
      if (!glued && digits >= limits.min && digits <= limits.max) {
        spans.push({ start, end, kind: 'phone' })
      }
      search.lastIndex = start + 1
    }
  }
  return spans
}

/** Une donnée de contact : e-mail ou numéro de téléphone. */
function containsContact(text: string): boolean {
  return rangesOf(text, EMAIL).length > 0 || phoneSpans(text).length > 0
}

function findSpans(text: string, places: PlaceIndex): SensitiveSpan[] {
  // Les chiffres d'un numéro de vol ou de train (« CA1590 ») ne sont pas un code.
  const services = rangesOf(text, SERVICE_NUMBER)
  const candidates: SensitiveSpan[] = [
    ...rangesOf(text, EMAIL).map(([start, end]) => ({
      start,
      end,
      kind: 'email' as const,
    })),
    ...phoneSpans(text),
    ...rangesOf(text, DIGITS)
      .filter(([start]) => !insideAny(services, start))
      .map(([start, end]) => ({
        start,
        end,
        kind: 'digits' as const,
      })),
    ...nameSpans(text, places),
  ]
  candidates.sort(
    (a, b) =>
      KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
      a.start - b.start ||
      b.end - a.end,
  )
  let kept: SensitiveSpan[] = []
  for (const candidate of candidates) {
    let span = candidate
    // Un numéro qui avale le début d'une adresse e-mail (« +1 555-1234
    // 555-1234 li@qq.com ») s'arrête juste avant elle, au lieu de disparaître.
    if (span.kind === 'phone') {
      const email = kept.find(
        (other) =>
          other.kind === 'email' &&
          other.start > span.start &&
          other.start < span.end,
      )
      if (email) {
        const head = text.slice(span.start, email.start).replace(/[^\d)]+$/, '')
        if (countDigits(head) < INTERNATIONAL_DIGITS.min) continue
        span = { ...span, end: span.start + head.length }
      }
    }
    const clashes = kept.filter(
      (other) => span.start < other.end && other.start < span.end,
    )
    if (clashes.length === 0) {
      kept.push(span)
    } else if (
      span.kind === 'phone' &&
      clashes.every((other) => other.kind === 'phone')
    ) {
      // Deux numéros qui se chevauchent (« 06 12 34 56 78 06 98 76 54 32 ») :
      // un seul surlignage, qui les couvre tous les deux.
      kept = kept.filter((other) => !clashes.includes(other))
      kept.push({
        start: Math.min(span.start, ...clashes.map((other) => other.start)),
        end: Math.max(span.end, ...clashes.map((other) => other.end)),
        kind: 'phone',
      })
    }
  }
  return kept.sort((a, b) => a.start - b.start)
}

/**
 * Données sensibles d'un texte libre, triées et sans chevauchement :
 * - `digits` : 4 chiffres ou plus à la suite (codes, digicodes, numéros),
 *   sauf ceux d'un numéro de vol ou de train (`CA1590`, `TGV 6231`) ;
 * - `phone` : numéros internationaux (`+33 6…`) ou nationaux (`06…`, `080-…`) ;
 * - `email` ;
 * - `name` : mots à majuscule hors début de phrase, hors lieux du voyage
 *   (`knownPlaces`, comparés sans casse ni accents, mot à mot) et hors mots
 *   courants. Voir `nameSpans` pour les garde-fous.
 * Sur un chevauchement, le plus précis gagne : e-mail > téléphone > chiffres >
 * nom.
 */
export function sensitiveSpans(
  text: string,
  knownPlaces: readonly string[] = [],
): SensitiveSpan[] {
  return findSpans(text, buildPlaceIndex(knownPlaces))
}

/**
 * Lieux du voyage, pour ne pas les prendre pour des noms de personne : titre
 * du voyage (`tripTitle`) et des journées (« Asakusa et Ueno »), villes,
 * activités, hébergements, départs et arrivées, compagnies et loueurs
 * (« Hertz », « Tobu »), et les adresses (des lieux, elles aussi). Tout cela
 * part publié de toute façon. Dans l'ordre du voyage, sans doublon.
 */
export function templateKnownPlaces(
  itinerary: readonly DayItinerary[],
  tripTitle?: string,
): string[] {
  const seen = new Set<string>()
  const places: string[] = []
  const add = (value: unknown) => {
    if (!hasText(value)) return
    const place = value.trim()
    const key = normalizeWord(place)
    if (seen.has(key)) return
    seen.add(key)
    places.push(place)
  }
  add(tripTitle)
  for (const day of itinerary) {
    add(day.title)
    add(day.city)
    for (const activity of day.activities) {
      add(activity.name)
      add(activity.address)
    }
    add(day.accommodation?.name)
    add(day.accommodation?.address)
    add(day.transport?.from)
    add(day.transport?.to)
    add(day.transport?.departureAddress)
    add(day.transport?.provider)
  }
  return places
}

/** Notes du voyage, pour le libellé de A3 : « 25 notes, dont 5 sur des trajets ». */
export interface TemplateNoteStats {
  /** Notes non vides, de journée et de trajet. */
  total: number
  /** Parmi elles, les notes de trajet (`Transport.notes`). */
  onTransports: number
}

/**
 * Compte les notes que l'interrupteur « notes » de A3 publierait : celles des
 * journées et celles des trajets (§5 de la spec), non vides. Chaque note
 * compte, même identique à une autre.
 */
export function templateNoteStats(
  itinerary: readonly DayItinerary[],
): TemplateNoteStats {
  let total = 0
  let onTransports = 0
  for (const day of itinerary) {
    if (hasText(day.notes)) total += 1
    if (hasText(day.transport?.notes)) {
      total += 1
      onTransports += 1
    }
  }
  return { total, onTransports }
}

// ── Écran A3 : extraits de notes ──────────────────────────────────────────────

/** Longueur visée d'un extrait, hors « … ». */
export const NOTE_EXCERPT_LENGTH = 160
/** Contexte gardé avant une donnée sensible quand l'extrait ne part pas du début. */
const EXCERPT_LEAD = 40

export interface NoteExcerpt {
  dayId: string
  dayNumber: number
  source: 'day' | 'transport'
  /** Extrait sur une ligne, coupé sur un mot avec « … ». */
  text: string
  /** Relatifs à `text`. */
  spans: SensitiveSpan[]
}

/** Une moitié basse de paire UTF-16 : le second code d'un emoji. */
function isLowSurrogate(char: string | undefined): boolean {
  return char !== undefined && /^[\uDC00-\uDFFF]$/.test(char)
}

/** Où couper un texte trop long : sur la dernière espace avant la limite. */
function cutPoint(text: string): number {
  if (text.length <= NOTE_EXCERPT_LENGTH) return text.length
  const space = text.lastIndexOf(' ', NOTE_EXCERPT_LENGTH)
  if (space >= NOTE_EXCERPT_LENGTH / 2) return space
  // Un mot interminable (une URL, du japonais sans espace) : on coupe dedans
  // plutôt que tout perdre, mais jamais entre les deux moitiés d'un emoji.
  return isLowSurrogate(text[NOTE_EXCERPT_LENGTH])
    ? NOTE_EXCERPT_LENGTH - 1
    : NOTE_EXCERPT_LENGTH
}

/**
 * Coupe une note autour de ce qui compte : depuis le début, ou un peu avant la
 * donnée la plus grave (`spanLevel` ; à égalité, la première du texte) si elle
 * tomberait au-delà de la coupe — un extrait choisi pour un téléphone doit
 * montrer ce téléphone, pas seulement le prénom qui le précède. Les données
 * moins graves placées avant elle sortent alors de l'extrait.
 *
 * Le début de l'extrait est alors pris sur une espace, si l'une tombe dans les
 * `EXCERPT_LEAD` caractères qui précèdent le contexte gardé ; sinon (japonais
 * ou chinois sans espace, long lien), dans le mot. La donnée commence donc au
 * plus à ~80 caractères du début, toujours avant la coupe de fin.
 */
function clip(
  text: string,
  spans: readonly SensitiveSpan[],
): { text: string; spans: SensitiveSpan[] } {
  if (text.length <= NOTE_EXCERPT_LENGTH) return { text, spans: [...spans] }

  let from = 0
  // Les passages sont dans l'ordre du texte : `<` garde le premier à égalité.
  const anchor = spans.reduce<SensitiveSpan | undefined>(
    (best, span) => (!best || spanLevel(span) < spanLevel(best) ? span : best),
    undefined,
  )
  if (anchor && anchor.end > cutPoint(text)) {
    const lead = Math.max(0, anchor.start - EXCERPT_LEAD)
    const space = text.lastIndexOf(' ', lead)
    from = space >= 0 && lead - space <= EXCERPT_LEAD ? space + 1 : lead
    // Jamais au milieu d'un emoji.
    if (isLowSurrogate(text[from])) from -= 1
  }
  const prefix = from > 0 ? '…' : ''

  let body = text.slice(from)
  let suffix = ''
  if (body.length > NOTE_EXCERPT_LENGTH) {
    body = body.slice(0, cutPoint(body)).replace(/[\s,;:.!?–—-]+$/, '')
    suffix = '…'
  }

  const shift = prefix.length - from
  const limit = from + body.length
  const clipped = spans
    .filter((span) => span.start >= from && span.start < limit)
    .map((span) => ({
      start: span.start + shift,
      end: Math.min(span.end, limit) + shift,
      kind: span.kind,
    }))
  return { text: prefix + body + suffix, spans: clipped }
}

/**
 * Gravité d'un passage, de 0 (le plus grave) à 3 : un téléphone ou un e-mail,
 * puis une suite de 6 chiffres ou plus, puis un nom, puis un code de 4 ou 5
 * chiffres.
 */
function spanLevel(span: SensitiveSpan): number {
  return span.kind === 'phone' || span.kind === 'email'
    ? 0
    : span.kind === 'digits' && span.end - span.start >= 6
      ? 1
      : span.kind === 'name'
        ? 2
        : 3
}

/** Gravité d'une note : celle de son passage le plus grave, 4 sans passage. */
function severity(spans: readonly SensitiveSpan[]): number {
  return Math.min(4, ...spans.map(spanLevel))
}

/**
 * Extraits réels des notes du voyage pour l'écran A3, où l'auteur décide s'il
 * les publie. On montre d'abord les notes les plus graves (`severity` :
 * téléphone ou e-mail, puis 6 chiffres ou plus, puis un nom, puis 4–5
 * chiffres), puis celles qui ont le plus de passages surlignés, puis les plus
 * longues ; les extraits retenus reviennent dans l'ordre du voyage. Une note
 * longue est coupée autour de la donnée qui l'a fait choisir (`clip`) : elle
 * est toujours visible et surlignée dans l'extrait. Une note identique à une
 * autre n'est montrée qu'une fois. `tripTitle` : le titre du voyage, dont les
 * mots ne sont pas des prénoms (`templateKnownPlaces`).
 */
export function noteExcerpts(
  itinerary: readonly DayItinerary[],
  limit = 2,
  options: { tripTitle?: string } = {},
): NoteExcerpt[] {
  if (limit <= 0) return []
  const places = buildPlaceIndex(
    templateKnownPlaces(itinerary, options.tripTitle),
  )
  const seen = new Set<string>()
  const notes: (NoteExcerpt & { order: number })[] = []

  for (const day of itinerary) {
    const sources = [
      { source: 'day' as const, value: day.notes },
      { source: 'transport' as const, value: day.transport?.notes },
    ]
    for (const { source, value } of sources) {
      if (!hasText(value)) continue
      const text = value.trim()
      if (seen.has(text)) continue
      seen.add(text)
      notes.push({
        dayId: day.id,
        dayNumber: day.dayNumber,
        source,
        // Une ligne : chaque blanc devient une espace, les positions restent.
        text: text.replace(/\s/g, ' '),
        spans: findSpans(text, places),
        order: notes.length,
      })
    }
  }

  return notes
    .map((note) => ({ ...note, severity: severity(note.spans) }))
    .sort(
      (a, b) =>
        a.severity - b.severity ||
        b.spans.length - a.spans.length ||
        b.text.length - a.text.length ||
        a.order - b.order,
    )
    .slice(0, limit)
    .sort((a, b) => a.order - b.order)
    .map(({ dayId, dayNumber, source, text, spans }) => ({
      dayId,
      dayNumber,
      source,
      ...clip(text, spans),
    }))
}
