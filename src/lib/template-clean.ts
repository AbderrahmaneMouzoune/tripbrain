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
 * « ce qui part / ce qui reste » et les hébergements à publier sans adresse
 * (A2), et des extraits de notes où les données sensibles sont surlignées
 * (A3). Tout est pur et tourne aussi sur le serveur.
 */

import { isIsoDate, splitIsoDateValue, toDayNumber } from '@/lib/iso-date'
import type {
  Accommodation,
  Activity,
  DayImage,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'
import {
  COUNTRY_CODES,
  MAX_TEMPLATE_DAYS,
  countryName,
  stayKey,
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

function omitCoordinates<T extends { coordinates?: [number, number] }>(
  entity: T,
): Omit<T, 'coordinates'> {
  const { coordinates: _coordinates, ...rest } = entity
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
function isPortableImageUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\/\S/i.test(url.trim())
}

/** Image gardée : en http(s), et sans adresse masquée (carte d'un logement). */
function isPublishableImageUrl(
  url: unknown,
  search: AddressSearch,
): url is string {
  return isPortableImageUrl(url) && !urlHasAddress(url, search)
}

function withPortableImages<T extends { images?: string[] }>(
  entity: T,
  search: AddressSearch,
): T | Omit<T, 'images'> {
  if (entity.images === undefined) return entity
  const images = Array.isArray(entity.images)
    ? entity.images.filter((url) => isPublishableImageUrl(url, search))
    : []
  if (images.length > 0) return { ...entity, images }
  const { images: _dropped, ...rest } = entity
  return rest
}

function withPortableDayImages(
  day: DayItinerary,
  search: AddressSearch,
): DayItinerary {
  if (day.images === undefined) return day
  const images: DayImage[] = Array.isArray(day.images)
    ? day.images
        .filter((image) => isPublishableImageUrl(image?.url, search))
        .map((image) => ({
          url: image.url,
          caption:
            typeof image.caption === 'string'
              ? scrubAddresses(image.caption, search)
              : '',
        }))
    : []
  if (images.length > 0) return { ...day, images }
  const { images: _dropped, ...rest } = day
  return rest
}

// ── Hébergements privés ───────────────────────────────────────────────────────

/*
 * « Ne publier que le nom et la ville » (écran A2) : chez des proches ou dans
 * un appartement loué, l'adresse est celle de quelqu'un. L'hébergement part
 * avec son nom, ses dates et son prix (si l'auteur publie les prix) ; la
 * ville est celle de sa journée. Son adresse, son lien et ses photos restent
 * sur le téléphone, et l'adresse est effacée de tous les textes du voyage
 * (notes, conseils, « départ du 12 rue des Lilas »…) pour ne pas ressortir
 * ailleurs.
 *
 * On cherche l'adresse entière et ceux de ses morceaux qui désignent un
 * logement. L'adresse entière est cherchée dès qu'elle a un numéro ou
 * plusieurs morceaux (« Quinta das Rosas, Sintra » : une maison à la
 * campagne n'a souvent pas de numéro) ; un morceau, seulement s'il a un
 * numéro (`pinpointsAHome`). Ni un quartier seul (« Montmartre »), ni le
 * code postal et la ville (« 75011 Paris ») : les effacer partout abîmerait
 * le reste du voyage sans rien protéger.
 *
 * La recherche est linéaire : le texte est plié une fois (sans accents ni
 * casse, séparateurs ramenés à une espace), puis parcouru par un automate
 * d'Aho-Corasick qui trouve tous les morceaux d'un coup. Le serveur renettoie
 * ce que n'importe qui envoie : une expression régulière, elle, pouvait
 * s'acharner des minutes sur une adresse forgée (`MAX_ADDRESS_SEARCH_WORK`).
 */

/** Nom publié d'un hébergement dont le nom n'était que son adresse masquée. */
export const PRIVATE_STAY_NAME = 'Logement privé'

/** En dessous, un bout d'adresse (`12`, `Apt 4`) se retrouverait n'importe où. */
const MIN_HIDDEN_ADDRESS_LENGTH = 6

/** Une seule passe suffit, sauf adresse imbriquée dans elle-même. */
const MAX_SCRUB_PASSES = 5

/**
 * Morceaux cherchés par hébergement privé, adresse entière comprise : une
 * vraie adresse en donne deux à cinq.
 */
const MAX_HIDDEN_ADDRESS_PARTS_PER_STAY = 8

/**
 * Morceaux cherchés pour tout le voyage, au plus : quatre hébergements privés
 * aux adresses détaillées. Un envoi forgé ne doit pas faire chercher des
 * milliers d'adresses dans chaque texte.
 */
const MAX_HIDDEN_ADDRESS_PARTS = 32

/** Un morceau plus long n'est pas une adresse : seuls ses morceaux plus courts sont cherchés. */
const MAX_HIDDEN_ADDRESS_PART_LENGTH = 120

/**
 * Coût du parcours d'un caractère (le plier, avancer l'automate), compté
 * comme autant de morceaux : relire un texte face à un seul morceau coûte
 * presque autant que face à trente.
 */
const SCAN_COST = 24

/**
 * Travail maximal de la recherche d'adresses sur le serveur, en caractères
 * parcourus × (morceaux cherchés + `SCAN_COST`) : les textes une fois, les
 * liens et les images trois fois, les noms des autres hébergements à chaque
 * tour de `stayPrivacy`, et chaque passe de plus de `scrubAddresses`. Un vrai
 * voyage en demande quelques millions ; ce plafond (2 Mio de textes face à
 * 32 morceaux) se parcourt en un quart de seconde environ. Au-delà, la
 * publication est refusée (`AddressSearchTooCostlyError`) : un modèle ne
 * part jamais sans la recherche.
 */
export const MAX_ADDRESS_SEARCH_WORK = 2 ** 28

/** Message de `AddressSearchTooCostlyError`, montré à l'auteur. */
export const ADDRESS_SEARCH_TOO_COSTLY =
  'Ce voyage est trop long à vérifier avant publication : raccourcis ses textes ou l’adresse de ses hébergements privés.'

/**
 * La recherche des adresses masquées dépasserait `maxAddressSearchWork`
 * (`cleanForTemplate`, côté serveur) : le nettoyage s'interrompt, et rien
 * ne doit partir.
 */
export class AddressSearchTooCostlyError extends Error {
  constructor() {
    super(ADDRESS_SEARCH_TOO_COSTLY)
    this.name = 'AddressSearchTooCostlyError'
  }
}

export function isAddressSearchTooCostlyError(
  error: unknown,
): error is AddressSearchTooCostlyError {
  return error instanceof AddressSearchTooCostlyError
}

/** Bornes du nettoyage qu'impose le serveur, qui renettoie ce que n'importe qui envoie. */
export interface TemplateCleaningLimits {
  /**
   * Travail maximal de la recherche d'adresses (`MAX_ADDRESS_SEARCH_WORK`).
   * La première passe sur les textes est comptée avant d'en toucher un seul,
   * les passes de plus au fil de l'eau ; au-delà,
   * `AddressSearchTooCostlyError`.
   */
  maxAddressSearchWork: number
}

/** Ce qu'il reste à dépenser ; `null` : sans limite (le téléphone). */
interface WorkBudget {
  left: number
}

/** Dépense le parcours de `chars` caractères face à `needles` morceaux. */
function charge(
  budget: WorkBudget | null,
  chars: number,
  needles: number,
): void {
  if (!budget || needles === 0) return
  budget.left -= chars * (needles + SCAN_COST)
  if (budget.left < 0) throw new AddressSearchTooCostlyError()
}

/** Automate d'Aho-Corasick des morceaux pliés, en unités UTF-16. */
interface Automaton {
  /** Transitions de chaque état ; l'état 0 est la racine. */
  next: Map<number, number>[]
  /** Lien d'échec : le plus long suffixe propre qui est encore un préfixe. */
  fail: Int32Array
  /** Longueur du morceau qui finit à cet état ; 0 si aucun. */
  length: Int32Array
  /** Premier état, en suivant les liens d'échec, où finit un morceau ; 0 si aucun. */
  output: Int32Array
  /** Transition de l'état `s` sur l'unité ASCII `u`, en `s * 128 + u`. */
  ascii: Int32Array
}

interface AddressSearch {
  /** Morceaux cherchés, pliés (`foldForSearch`), sans doublon. */
  needles: readonly (readonly number[])[]
  /** Chaque morceau a un chiffre : un texte sans chiffre n'en contient aucun. */
  needsDigit: boolean
  /** `null` : rien à chercher. */
  automaton: Automaton | null
  /** Où compter les passes de plus de `scrubAddresses` ; `null` : nulle part. */
  budget: WorkBudget | null
}

const NO_SEARCH: AddressSearch = {
  needles: [],
  needsDigit: true,
  automaton: null,
  budget: null,
}

interface StayPrivacy {
  /** Hébergements de l'entrée publiés sans adresse, ni lien, ni photo. */
  hidden: ReadonlySet<Accommodation>
  /** Les adresses masquées et leurs morceaux qui désignent un logement. */
  search: AddressSearch
}

const NO_PRIVACY: StayPrivacy = { hidden: new Set(), search: NO_SEARCH }

/** Mots (deux lettres ou plus) des villes du voyage, sans accents ni casse. */
function tripCityWords(itinerary: readonly DayItinerary[]): Set<string> {
  const words = new Set<string>()
  for (const day of itinerary) {
    if (typeof day.city !== 'string') continue
    for (const word of fold(day.city).match(/\p{L}{2,}/gu) ?? []) {
      words.add(word)
    }
  }
  return words
}

/**
 * Le texte va-t-il au-delà du code postal et des villes du voyage
 * (« 75011 Paris », « Kyoto 600-8216 ») ? Ceux-là, la journée les publie
 * déjà, et un code postal désigne un quartier, pas un logement.
 */
function namesMoreThanTheCity(
  text: string,
  cityWords: ReadonlySet<string>,
): boolean {
  const words = fold(text).match(/\p{L}{2,}/gu) ?? []
  return !words.every((word) => cityWords.has(word))
}

/**
 * Ce morceau d'adresse désigne-t-il un logement ? Il faut des lettres, un
 * chiffre (numéro de rue, étage, code), au moins `MIN_HIDDEN_ADDRESS_LENGTH`
 * caractères, et plus que le code postal et une ville du voyage.
 */
function pinpointsAHome(part: string, cityWords: ReadonlySet<string>): boolean {
  if (part.length < MIN_HIDDEN_ADDRESS_LENGTH) return false
  if (!/\p{N}/u.test(part) || !/\p{L}/u.test(part)) return false
  return namesMoreThanTheCity(part, cityWords)
}

/**
 * L'adresse entière est-elle cherchée ? Comme un morceau, mais un numéro
 * n'est pas exigé d'une adresse en plusieurs morceaux : « Quinta das Rosas,
 * Sintra », « Le Mas des Oliviers, chemin de la Source » désignent une
 * maison. Un seul morceau sans numéro est un quartier (« Montmartre »).
 */
function wholeAddressIsSearched(
  whole: string,
  pieces: number,
  cityWords: ReadonlySet<string>,
): boolean {
  if (whole.length < MIN_HIDDEN_ADDRESS_LENGTH) return false
  if (!/\p{L}/u.test(whole)) return false
  if (!namesMoreThanTheCity(whole, cityWords)) return false
  return /\p{N}/u.test(whole) || pieces >= 2
}

/** Espaces resserrées, bornée par des lettres ou des chiffres : elle se lit en mots entiers. */
function trimAddressPart(raw: string): string {
  return raw
    .replace(/\s+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

const APOSTROPHE_CHARS: ReadonlySet<string> = new Set("'’‘ʼ`")
const DASH_CHARS: ReadonlySet<string> = new Set('-‐‑‒–—')
/** Ce qui sépare deux mots d'une adresse : blancs, virgules, points-virgules. */
const SEPARATOR = /^[\s,;]+$/u
const SPACE = 0x20
/** Plis des caractères hors ASCII déjà vus ; borné, il ne grossit pas indéfiniment. */
const FOLDED_CHARS = new Map<string, string>()
const MAX_FOLDED_CHARS = 8192

/**
 * Un caractère ASCII tel qu'on le compare : en minuscule, `` ` `` en `'`,
 * un blanc, une virgule ou un point-virgule en espace.
 */
function foldAscii(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code + 0x20
  if (code === 0x2c || code === 0x3b || code === SPACE) return SPACE
  if (code >= 0x09 && code <= 0x0d) return SPACE
  return code === 0x60 ? 0x27 : code
}

/**
 * Un caractère hors ASCII tel qu'on le compare : sans accents (NFD, marques
 * retirées), en minuscules, apostrophes et tirets ramenés à `'` et `-`,
 * `ς` final à `σ`, un séparateur (`SEPARATOR`) à une espace. Une marque
 * seule ne donne rien.
 */
function foldChar(char: string): string {
  const cached = FOLDED_CHARS.get(char)
  if (cached !== undefined) return cached
  let folded = char
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
  if (APOSTROPHE_CHARS.has(folded)) folded = "'"
  else if (DASH_CHARS.has(folded)) folded = '-'
  else if (folded === 'ς') folded = 'σ'
  else if (folded !== '' && SEPARATOR.test(folded)) folded = ' '
  if (FOLDED_CHARS.size < MAX_FOLDED_CHARS) FOLDED_CHARS.set(char, folded)
  return folded
}

/**
 * Un texte plié, unité UTF-16 par unité, et d'où vient chacune dans
 * l'original. Les tableaux sont partagés d'un pli à l'autre (`foldBuffer`) :
 * le résultat ne vaut que jusqu'au pli suivant.
 */
interface FoldedText {
  codes: Uint16Array
  /** Début, dans l'original, du caractère qui a donné l'unité `i`. */
  starts: Int32Array
  /** Fin, dans l'original, de ce caractère et des marques qui le suivent. */
  ends: Int32Array
  length: number
}

/**
 * Tampon des plis : la recherche plie chaque texte du voyage, et allouer
 * trois tableaux par texte coûtait plus que la recherche elle-même.
 */
const foldBuffer: FoldedText = {
  codes: new Uint16Array(1024),
  starts: new Int32Array(1024),
  ends: new Int32Array(1024),
  length: 0,
}

/** Agrandit le tampon pour `size` unités, en gardant les `foldBuffer.length` premières. */
function reserveFold(size: number): void {
  if (size <= foldBuffer.codes.length) return
  const capacity = Math.max(size, foldBuffer.codes.length * 2)
  const codes = new Uint16Array(capacity)
  const starts = new Int32Array(capacity)
  const ends = new Int32Array(capacity)
  codes.set(foldBuffer.codes.subarray(0, foldBuffer.length))
  starts.set(foldBuffer.starts.subarray(0, foldBuffer.length))
  ends.set(foldBuffer.ends.subarray(0, foldBuffer.length))
  foldBuffer.codes = codes
  foldBuffer.starts = starts
  foldBuffer.ends = ends
}

/**
 * Le texte tel qu'on y cherche les adresses (`foldAscii`, `foldChar`),
 * chaque suite de séparateurs ramenée à une espace : « 12, Rue de l’Église »
 * devient « 12 rue de l'eglise ». Une marque qui suit un caractère lui est
 * rattachée : effacer le caractère l'efface aussi.
 */
function foldForSearch(text: string): FoldedText {
  foldBuffer.length = 0
  reserveFold(text.length)
  let { codes, starts, ends } = foldBuffer
  let length = 0
  let offset = 0
  while (offset < text.length) {
    const code = text.charCodeAt(offset)
    if (code < 0x80) {
      const folded = foldAscii(code)
      if (folded === SPACE && length > 0 && codes[length - 1] === SPACE) {
        ends[length - 1] = offset + 1
      } else {
        // Une unité ASCII n'en donne qu'une : le tampon a la place.
        codes[length] = folded
        starts[length] = offset
        ends[length] = offset + 1
        length += 1
      }
      offset += 1
      continue
    }
    const next = text.charCodeAt(offset + 1)
    const end = offset + (isHighUnit(code) && isLowUnit(next) ? 2 : 1)
    const folded = foldChar(text.slice(offset, end))
    if (
      folded === '' ||
      (folded === ' ' && length > 0 && codes[length - 1] === SPACE)
    ) {
      // Une marque, ou un séparateur de plus : rattachés au caractère d'avant.
      if (length > 0) ends[length - 1] = end
    } else {
      // Un caractère peut en donner plusieurs (syllabe coréenne) : il reste
      // au moins une place par unité du texte qui suit.
      foldBuffer.length = length
      reserveFold(length + folded.length + (text.length - end))
      ;({ codes, starts, ends } = foldBuffer)
      for (let unit = 0; unit < folded.length; unit += 1) {
        codes[length] = folded.charCodeAt(unit)
        starts[length] = offset
        ends[length] = end
        length += 1
      }
    }
    offset = end
  }
  foldBuffer.length = length
  return foldBuffer
}

/** Le morceau tel qu'on le cherche : plié comme le texte. */
function foldNeedle(part: string): number[] {
  const folded = foldForSearch(part)
  return Array.from(folded.codes.subarray(0, folded.length))
}

function buildAutomaton(needles: readonly (readonly number[])[]): Automaton {
  const next: Map<number, number>[] = [new Map()]
  const length = [0]
  for (const needle of needles) {
    let state = 0
    for (const unit of needle) {
      let target = next[state].get(unit)
      if (target === undefined) {
        target = next.length
        next.push(new Map())
        length.push(0)
        next[state].set(unit, target)
      }
      state = target
    }
    length[state] = needle.length
  }
  const fail = new Int32Array(next.length)
  const output = new Int32Array(next.length)
  // En largeur : le lien d'échec d'un état pointe toujours moins profond.
  const queue = [...next[0].values()]
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head]
    for (const [unit, child] of next[state]) {
      let link = fail[state]
      while (link !== 0 && !next[link].has(unit)) link = fail[link]
      const target = next[link].get(unit) ?? 0
      fail[child] = target === child ? 0 : target
      output[child] =
        length[fail[child]] > 0 ? fail[child] : output[fail[child]]
      queue.push(child)
    }
  }
  // Transitions ASCII précalculées (un automate déterministe) : le cas
  // courant se lit dans un tableau, sans suivre les liens d'échec.
  const ascii = new Int32Array(next.length * 0x80)
  for (const state of [0, ...queue]) {
    for (let unit = 0; unit < 0x80; unit += 1) {
      const own = next[state].get(unit)
      ascii[state * 0x80 + unit] =
        own ?? (state === 0 ? 0 : ascii[fail[state] * 0x80 + unit])
    }
  }
  return { next, fail, length: Int32Array.from(length), output, ascii }
}

const WORD_CHAR = /[\p{L}\p{N}]/u

function isWordCodePoint(codePoint: number): boolean {
  if (codePoint < 0x80) {
    return (
      (codePoint >= 0x30 && codePoint <= 0x39) ||
      (codePoint >= 0x61 && codePoint <= 0x7a) ||
      (codePoint >= 0x41 && codePoint <= 0x5a)
    )
  }
  return WORD_CHAR.test(String.fromCodePoint(codePoint))
}

function isHighUnit(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff
}

function isLowUnit(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff
}

/** Une lettre ou un chiffre finit-il juste avant `index` ? */
function isWordBefore(folded: FoldedText, index: number): boolean {
  if (index <= 0) return false
  const unit = folded.codes[index - 1]
  if (isLowUnit(unit) && index >= 2) {
    const high = folded.codes[index - 2]
    if (isHighUnit(high)) {
      return isWordCodePoint(((high - 0xd800) << 10) + unit - 0xdc00 + 0x10000)
    }
  }
  return isWordCodePoint(unit)
}

/** Une lettre ou un chiffre commence-t-il à `index` ? */
function isWordAt(folded: FoldedText, index: number): boolean {
  if (index >= folded.length) return false
  const unit = folded.codes[index]
  if (isHighUnit(unit) && index + 1 < folded.length) {
    const low = folded.codes[index + 1]
    if (isLowUnit(low)) {
      return isWordCodePoint(((unit - 0xd800) << 10) + low - 0xdc00 + 0x10000)
    }
  }
  return isWordCodePoint(unit)
}

/**
 * Les passages du texte original où se trouve un morceau, en mots entiers
 * (ni lettre, ni chiffre, ni marque de part et d'autre : « 12 rue des Lilas »
 * n'est pas dans « 112 rue des Lilas »), triés et fusionnés quand ils se
 * chevauchent. `first` : s'arrête au premier.
 */
function addressSpans(
  text: string,
  search: AddressSearch,
  first = false,
): [number, number][] {
  const { automaton } = search
  if (!automaton) return []
  const folded = foldForSearch(text)
  const { codes } = folded
  const { next, fail, length, output, ascii } = automaton
  // Les passages arrivent par fin croissante : chacun absorbe ceux qu'il
  // chevauche, et la liste reste triée et sans chevauchement.
  const spans: [number, number][] = []
  let state = 0
  for (let index = 0; index < folded.length; index += 1) {
    const unit = codes[index]
    if (unit < 0x80) {
      state = ascii[state * 0x80 + unit]
    } else {
      let target = next[state].get(unit)
      while (target === undefined && state !== 0) {
        state = fail[state]
        target = next[state].get(unit)
      }
      state = target ?? 0
    }
    const end = index + 1
    // Du plus long morceau qui finit ici au plus court : le premier en mots
    // entiers couvre tous les suivants.
    for (
      let found = length[state] > 0 ? state : output[state];
      found !== 0;
      found = output[found]
    ) {
      const start = end - length[found]
      if (isWordBefore(folded, start) || isWordAt(folded, end)) continue
      let from = folded.starts[start]
      while (spans.length > 0 && spans[spans.length - 1][1] > from) {
        from = Math.min(from, (spans.pop() as [number, number])[0])
      }
      spans.push([from, folded.ends[index]])
      if (first) return spans
      break
    }
  }
  return spans
}

/**
 * Les adresses des hébergements masqués, et ceux de leurs morceaux qui
 * désignent un logement, prêts à chercher : au plus
 * `MAX_HIDDEN_ADDRESS_PARTS_PER_STAY` par hébergement (même clé `stayKey`)
 * et `MAX_HIDDEN_ADDRESS_PARTS` en tout, dans l'ordre du voyage, l'adresse
 * entière d'abord. Ajouter un hébergement ne fait qu'allonger la liste.
 */
function addressSearch(
  hidden: Iterable<Accommodation>,
  cityWords: ReadonlySet<string>,
  budget: WorkBudget | null,
): AddressSearch {
  const needles: number[][] = []
  const seen = new Set<string>()
  const perStay = new Map<string, number>()
  const add = (key: string, part: string): void => {
    if (part.length > MAX_HIDDEN_ADDRESS_PART_LENGTH) return
    if ((perStay.get(key) ?? 0) >= MAX_HIDDEN_ADDRESS_PARTS_PER_STAY) return
    const needle = foldNeedle(part)
    const text = String.fromCharCode(...needle)
    if (text === '' || seen.has(text)) return
    seen.add(text)
    needles.push(needle)
    perStay.set(key, (perStay.get(key) ?? 0) + 1)
  }
  for (const accommodation of hidden) {
    if (needles.length >= MAX_HIDDEN_ADDRESS_PARTS) break
    const address: unknown = accommodation.address
    if (typeof address !== 'string') continue
    const key = stayKey(accommodation)
    const pieces = address
      .split(/[,;\n\r]+/)
      .map(trimAddressPart)
      .filter((piece) => /[\p{L}\p{N}]/u.test(piece))
    const whole = trimAddressPart(address)
    if (wholeAddressIsSearched(whole, pieces.length, cityWords)) {
      add(key, whole)
    }
    for (const piece of pieces) {
      if (needles.length >= MAX_HIDDEN_ADDRESS_PARTS) break
      if (pinpointsAHome(piece, cityWords)) add(key, piece)
    }
  }
  if (needles.length === 0) return NO_SEARCH
  return {
    needles,
    needsDigit: needles.every((needle) =>
      /\p{N}/u.test(String.fromCharCode(...needle)),
    ),
    automaton: buildAutomaton(needles),
    budget,
  }
}

const HAS_DIGIT = /\p{N}/u

/** Le texte peut-il contenir un morceau ? Un test rapide, avant de plier. */
function mayContainAddress(text: string, search: AddressSearch): boolean {
  return (
    search.automaton !== null && (!search.needsDigit || HAS_DIGIT.test(text))
  )
}

function containsAddress(text: string, search: AddressSearch): boolean {
  return (
    mayContainAddress(text, search) &&
    addressSpans(text, search, true).length > 0
  )
}

/** Le lien mène-t-il à une adresse masquée (`maps…?q=12+rue+des+Lilas`) ? */
function urlHasAddress(url: string, search: AddressSearch): boolean {
  if (!search.automaton) return false
  const spaced = url.replace(/\+/g, ' ')
  return [url, spaced, safeDecode(spaced)].some((text) =>
    containsAddress(text, search),
  )
}

/**
 * La ponctuation qu'un effacement laisse orpheline : parenthèses vides,
 * blancs doublés (les sauts de ligne restent), espace avant une virgule ou
 * un point, virgules répétées ou suivies d'un point, séparateurs au début ou
 * à la fin. Sans lettre ni chiffre, il ne reste rien.
 */
function tidyAfterRemoval(text: string): string {
  const tidied = text
    .replace(/\(\s*[,;]?\s*\)/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/ +(?=\r?\n)/g, '')
    .replace(/(\n) +/g, '$1')
    .replace(/ (?=[,.])/g, '')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/[,;]+(?=[.!?])/g, '')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
  return /[\p{L}\p{N}]/u.test(tidied) ? tidied : ''
}

/**
 * Le texte sans les adresses masquées : chaque passage effacé laisse une
 * espace, puis `tidyAfterRemoval` range la ponctuation. On recommence tant
 * qu'une adresse réapparaît (« 12 rue des 12 rue des Lilas Lilas ») : le
 * résultat n'en contient plus, et le nettoyer encore ne change rien. Un texte
 * sans adresse revient tel quel, au caractère près.
 */
function scrubAddresses(text: string, search: AddressSearch): string {
  if (!mayContainAddress(text, search)) return text
  let current = text
  for (let pass = 0; pass < MAX_SCRUB_PASSES; pass += 1) {
    // La première passe est comptée d'avance (`cleanForTemplate`, `stayPrivacy`).
    if (pass > 0) charge(search.budget, current.length, search.needles.length)
    const spans = addressSpans(current, search)
    if (spans.length === 0) return current
    let kept = ''
    let from = 0
    for (const [start, end] of spans) {
      kept += `${current.slice(from, start)} `
      from = end
    }
    current = tidyAfterRemoval(kept + current.slice(from))
  }
  charge(search.budget, current.length, search.needles.length)
  return containsAddress(current, search) ? '' : current
}

/**
 * Nom publié d'un hébergement : sans les adresses masquées. S'il n'était que
 * l'adresse (« 12 rue des Lilas »), il devient « Logement privé ».
 */
function publishedStayName(name: string, search: AddressSearch): string {
  if (typeof name !== 'string') return name
  const scrubbed = scrubAddresses(name, search)
  return scrubbed === '' && name.trim() !== '' ? PRIVATE_STAY_NAME : scrubbed
}

/**
 * Les hébergements à publier sans adresse, et la recherche de leurs adresses.
 *
 * Un hébergement est masqué si sa clé (`stayKey`) est dans `privateStays`,
 * ou si elle y entre une fois son nom publié : « Chez Marie, 12 rue des
 * Lilas » devient « Chez Marie ». On repasse jusqu'à ce que plus rien ne
 * bouge, pour que nettoyer deux fois revienne à nettoyer une fois. Chaque
 * tour relit les noms distincts des autres hébergements, compté dans
 * `budget` ; il n'y a de tour suivant que si les morceaux cherchés ont
 * grandi, soit `MAX_HIDDEN_ADDRESS_PARTS` tours au plus.
 */
function stayPrivacy(
  itinerary: readonly DayItinerary[],
  privateStays: unknown,
  budget: WorkBudget | null,
): StayPrivacy {
  const wanted = new Set(
    Array.isArray(privateStays)
      ? privateStays.filter((key): key is string => typeof key === 'string')
      : [],
  )
  if (wanted.size === 0) return NO_PRIVACY
  const stays = itinerary.flatMap((day) =>
    day.accommodation && typeof day.accommodation === 'object'
      ? [day.accommodation]
      : [],
  )
  const hidden = new Set(stays.filter((stay) => wanted.has(stayKey(stay))))
  const cityWords = tripCityWords(itinerary)
  let search = addressSearch(hidden, cityWords, budget)
  for (;;) {
    if (!search.automaton) return { hidden, search }
    const others = stays.filter((stay) => !hidden.has(stay))
    // Un nom par texte distinct : les nuits d'un même hébergement le répètent.
    const published = new Map<unknown, string>()
    for (const stay of others) published.set(stay.name, '')
    let scanned = 0
    for (const name of published.keys()) {
      if (typeof name === 'string') scanned += name.length
    }
    charge(budget, scanned, search.needles.length)
    for (const name of published.keys()) {
      published.set(name, publishedStayName(name as string, search))
    }
    const renamed = others.filter((stay) =>
      wanted.has(
        stayKey({ id: stay.id, name: published.get(stay.name) ?? '' }),
      ),
    )
    if (renamed.length === 0) return { hidden, search }
    for (const stay of renamed) hidden.add(stay)
    const grown = addressSearch(hidden, cityWords, budget)
    // Mêmes morceaux : un tour de plus rendrait les mêmes noms.
    if (grown.needles.length === search.needles.length) {
      return { hidden, search: grown }
    }
    search = grown
  }
}

/**
 * Ce que la recherche parcourra au plus, en caractères : chaque texte une
 * fois, chaque lien et chaque image trois fois (brut, `+` en espace,
 * décodé). Tout l'itinéraire est compté, champs retirés compris : c'est un
 * plafond, pas une estimation.
 */
function searchedLength(value: unknown, key = ''): number {
  if (typeof value === 'string') {
    return key === 'bookingUrl' || key === 'url' || key === 'images'
      ? value.length * 3
      : value.length
  }
  let total = 0
  if (Array.isArray(value)) {
    for (const item of value) total += searchedLength(item, key)
  } else if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      if (name !== 'id') total += searchedLength(item, name)
    }
  }
  return total
}

/**
 * Les textes libres d'une entité, sans les adresses masquées. Un champ
 * facultatif vidé disparaît, un champ requis (`required`) reste vide ; une
 * liste perd les entrées vidées, et disparaît si plus rien n'y reste.
 */
function scrubTexts<T extends object>(
  entity: T,
  keys: readonly string[],
  search: AddressSearch,
  required: ReadonlySet<string> = new Set(),
): T {
  if (!search.automaton) return entity
  let copy: T | null = null
  for (const key of keys) {
    const value: unknown = Reflect.get(entity, key)
    if (typeof value === 'string') {
      const scrubbed = scrubAddresses(value, search)
      if (scrubbed === value) continue
      copy ??= { ...entity }
      if (scrubbed === '' && !required.has(key)) {
        Reflect.deleteProperty(copy, key)
      } else {
        Reflect.set(copy, key, scrubbed)
      }
    } else if (Array.isArray(value)) {
      const scrubbed: unknown[] = value.map((item: unknown) =>
        typeof item === 'string' ? scrubAddresses(item, search) : item,
      )
      if (scrubbed.every((item, index) => item === value[index])) continue
      const kept = scrubbed.filter(
        (item, index) => item !== '' || value[index] === '',
      )
      copy ??= { ...entity }
      if (kept.length === 0) Reflect.deleteProperty(copy, key)
      else Reflect.set(copy, key, kept)
    }
  }
  return copy ?? entity
}

/** Textes libres où une adresse masquée est effacée, entité par entité. */
const DAY_TEXT_KEYS = [
  'title',
  'city',
  'highlights',
  'foodRecommendations',
  'walkingDistance',
  'notes',
  'packingTips',
  'dayType',
  'tips',
] as const satisfies readonly (keyof DayItinerary)[]
const DAY_REQUIRED_TEXTS: ReadonlySet<string> = new Set(['title', 'city'])

const ACTIVITY_TEXT_KEYS = [
  'name',
  'description',
  'duration',
  'openAt',
  'address',
  'tips',
  'tags',
] as const satisfies readonly (keyof Activity)[]
const ACTIVITY_REQUIRED_TEXTS: ReadonlySet<string> = new Set(['name'])

const TRANSPORT_TEXT_KEYS = [
  'from',
  'to',
  'details',
  'departureAddress',
  'departureTime',
  'arrivalTime',
  'duration',
  'provider',
  'notes',
] as const satisfies readonly (keyof Transport)[]

/** Le nom passe par `publishedStayName` ; ces trois-là sont requis. */
const ACCOMMODATION_TEXT_KEYS = [
  'address',
  'checkIn',
  'checkOut',
] as const satisfies readonly (keyof Accommodation)[]
const ACCOMMODATION_REQUIRED_TEXTS: ReadonlySet<string> = new Set(
  ACCOMMODATION_TEXT_KEYS,
)

// ── Nettoyage ─────────────────────────────────────────────────────────────────

/**
 * Ce que le nettoyage d'une journée doit savoir du voyage entier : les
 * références de réservation (`tripReferences`) et les hébergements privés
 * (`stayPrivacy`), lus sur l'original avant d'être retirés.
 */
interface CleanContext {
  options: TemplateOptions
  references: ReadonlySet<string>
  privacy: StayPrivacy
}

/** Lien gardé : une page publique, qui ne mène pas à une adresse masquée. */
function keepsLink(url: unknown, context: CleanContext): boolean {
  return (
    isShareableBookingUrl(url, context.references) &&
    !urlHasAddress(url as string, context.privacy.search)
  )
}

function cleanActivity(activity: Activity, context: CleanContext): Activity {
  const { options, privacy } = context
  let cleaned: Activity = pickKnown(activity, ACTIVITY_KEY_SET)
  if (!options.includePrices) cleaned = omitPrice(cleaned)
  if (
    cleaned.bookingUrl !== undefined &&
    !keepsLink(cleaned.bookingUrl, context)
  ) {
    cleaned = omitBookingUrl(cleaned)
  }
  const scrubbed = scrubTexts(
    cleaned,
    ACTIVITY_TEXT_KEYS,
    privacy.search,
    ACTIVITY_REQUIRED_TEXTS,
  )
  // Une activité nommée ou située à l'adresse masquée (« Dîner au 12 rue des
  // Lilas ») y est aussi sur la carte : ses coordonnées ne partent pas.
  const atHiddenAddress =
    scrubbed.name !== cleaned.name || scrubbed.address !== cleaned.address
  cleaned = atHiddenAddress ? omitCoordinates(scrubbed) : scrubbed
  return withPortableImages(cleaned, privacy.search)
}

function cleanTransport(
  transport: Transport,
  context: CleanContext,
): Transport {
  const { options, privacy } = context
  let cleaned: Transport = pickKnown(transport, TRANSPORT_KEY_SET)
  if (!options.includeNotes) cleaned = omitNotes(cleaned)
  if (!options.includePrices) cleaned = omitPrice(cleaned)
  // Les références du voyage (la sienne comprise) sont lues sur l'original.
  if (
    cleaned.bookingUrl !== undefined &&
    !keepsLink(cleaned.bookingUrl, context)
  ) {
    cleaned = omitBookingUrl(cleaned)
  }
  return scrubTexts(cleaned, TRANSPORT_TEXT_KEYS, privacy.search)
}

function cleanAccommodation(
  accommodation: Accommodation,
  context: CleanContext,
): Accommodation {
  const { options, privacy } = context
  let cleaned: Accommodation = pickKnown(accommodation, ACCOMMODATION_KEY_SET)
  if (!options.includePrices) cleaned = omitPrice(cleaned)
  if (privacy.hidden.has(accommodation)) {
    // « Ne publier que le nom et la ville » : la ville est celle de la journée.
    const { images: _images, ...rest } = cleaned
    cleaned = { ...rest, address: '', bookingUrl: '' }
  } else if (!keepsLink(cleaned.bookingUrl, context)) {
    // `bookingUrl` est requis par le type : on le vide au lieu de le retirer.
    cleaned = { ...cleaned, bookingUrl: '' }
  }
  cleaned = {
    ...scrubTexts(
      cleaned,
      ACCOMMODATION_TEXT_KEYS,
      privacy.search,
      ACCOMMODATION_REQUIRED_TEXTS,
    ),
    name: publishedStayName(cleaned.name, privacy.search),
  }
  return withPortableImages(cleaned, privacy.search)
}

function cleanDay(day: DayItinerary, context: CleanContext): DayItinerary {
  const { options, privacy } = context
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
  cleaned = scrubTexts(
    cleaned,
    DAY_TEXT_KEYS,
    privacy.search,
    DAY_REQUIRED_TEXTS,
  )
  return withPortableDayImages(cleaned, privacy.search)
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
 * - clés inconnues du type retirées (voir la liste blanche plus haut) ;
 * - hébergements de `privateStays` : adresse et lien vidés, photos retirées ;
 *   leur adresse (et ses morceaux qui désignent un logement) est effacée de
 *   tous les textes, et un lien, une image ou les coordonnées d'une activité
 *   qui y mènent partent avec (voir « Hébergements privés » plus haut).
 *
 * Pure, idempotente ; ids, ordre des journées et des activités inchangés. Une
 * clé retirée disparaît : jamais de valeur `undefined` dans le résultat.
 *
 * `limits` (serveur) : la recherche des adresses masquées est comptée avant
 * de toucher au moindre texte ; au-delà de `maxAddressSearchWork`,
 * `AddressSearchTooCostlyError` est levée et rien ne part. Sans `limits` (le
 * téléphone), rien n'est compté.
 */
export function cleanForTemplate(
  itinerary: readonly DayItinerary[],
  options: TemplateOptions,
  limits?: TemplateCleaningLimits,
): DayItinerary[] {
  const budget = limits ? { left: limits.maxAddressSearchWork } : null
  const privacy = stayPrivacy(itinerary, options.privateStays, budget)
  charge(budget, searchedLength(itinerary), privacy.search.needles.length)
  const context: CleanContext = {
    options,
    references: tripReferences(itinerary),
    privacy,
  }
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
    /**
     * Hébergements distincts (`stayKey` : même nom aux accents, à la casse et
     * aux espaces près = un seul hôtel), privés compris : leur nom part.
     */
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
    /**
     * Liens distincts qui ne partent pas : privés (confirmation, espace
     * client…), d'un hébergement privé, ou menant à son adresse.
     */
    privateLinks: number
    /** Images distinctes stockées sur l'appareil (`blob:`, `data:`…). */
    deviceImages: number
    /**
     * Hébergements distincts publiés sans adresse, ni lien, ni photo
     * (`TemplateOptions.privateStays`) : seuls leur nom et la ville partent.
     */
    privateStays: number
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function nameKey(value: string): string {
  return value.trim().toLocaleLowerCase('fr')
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

  // Mêmes références et mêmes hébergements privés que `cleanForTemplate` : le
  // chiffre est ce qui part.
  const tripRefs = tripReferences(itinerary)
  const privacy = stayPrivacy(itinerary, options.privateStays, null)
  const noteLink = (url: unknown, withheld = false) => {
    if (!hasText(url)) return
    if (
      withheld ||
      !isShareableBookingUrl(url, tripRefs) ||
      urlHasAddress(url, privacy.search)
    ) {
      privateLinks.add(url.trim())
    }
  }
  const noteImages = (urls: readonly unknown[] | undefined) => {
    for (const url of urls ?? []) {
      if (hasText(url) && !isPortableImageUrl(url)) deviceImages.add(url)
    }
  }
  // Un conseil qui n'était que l'adresse masquée ne part pas.
  const isPublishedTip = (tip: unknown) =>
    hasText(tip) && hasText(scrubAddresses(tip, privacy.search))

  for (const day of itinerary) {
    tips += (day.tips ?? []).filter(isPublishedTip).length
    if (hasText(day.notes)) notes += 1
    noteImages(day.images?.map((image) => image?.url))

    for (const activity of day.activities) {
      activities += 1
      if (isPublishedTip(activity.tips)) tips += 1
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
      const key = stayKey(accommodation)
      stays.set(key, [...(stays.get(key) ?? []), accommodation])
      if (hasText(accommodation.bookingReference)) {
        references.add(nameKey(accommodation.bookingReference))
      }
      noteLink(accommodation.bookingUrl, privacy.hidden.has(accommodation))
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
      privateStays: new Set(Array.from(privacy.hidden, stayKey)).size,
    },
  }
}

// ── Écran A2 : hébergements privés ────────────────────────────────────────────

/** Un hébergement du voyage, tel que A2 le propose à « Ne publier que le nom et la ville ». */
export interface TemplateStay {
  /** Sa clé (`stayKey`), à mettre dans `TemplateOptions.privateStays`. */
  key: string
  /** Nom saisi, celui de la première nuit qui en a un ; `''` sans nom. */
  name: string
  /** Villes des journées qui le portent, dans l'ordre du voyage, sans doublon. */
  cities: string[]
  /** Adresse saisie, la première non vide : ce qui ne partirait pas. `''` sans adresse. */
  address: string
  /**
   * Nuits passées : celles de `checkIn` à `checkOut` quand ces dates se
   * lisent (un hôtel porté par la seule journée d'arrivée compte toutes ses
   * nuits), sinon une par journée qui le porte. Au moins 1.
   */
  nights: number
  /** Ressemble à un logement privé (`looksLikePrivateStay`) : à cocher d'office. */
  suggestedPrivate: boolean
}

/** Au-delà, des dates d'arrivée et de départ sont une erreur de saisie. */
const MAX_STAY_NIGHTS = MAX_TEMPLATE_DAYS

/** Les nuits de `checkIn` à `checkOut` (numéros de jour), ou `null` si elles ne se lisent pas. */
function stayRange(
  accommodation: Accommodation,
): { from: number; to: number } | null {
  const checkIn =
    typeof accommodation.checkIn === 'string'
      ? splitIsoDateValue(accommodation.checkIn)
      : null
  const checkOut =
    typeof accommodation.checkOut === 'string'
      ? splitIsoDateValue(accommodation.checkOut)
      : null
  if (!checkIn || !checkOut) return null
  const from = toDayNumber(checkIn.date)
  const to = toDayNumber(checkOut.date)
  return to > from && to - from <= MAX_STAY_NIGHTS ? { from, to } : null
}

/**
 * Les hébergements du voyage, un par clé `stayKey`, dans l'ordre du voyage :
 * de quoi proposer, sur l'écran A2, « Ne publier que le nom et la ville »
 * pour chacun, coché d'office quand `suggestedPrivate`.
 */
export function templateStays(
  itinerary: readonly DayItinerary[],
): TemplateStay[] {
  const stays = new Map<
    string,
    { stay: TemplateStay; nights: Set<string>; cityKeys: Set<string> }
  >()
  itinerary.forEach((day, index) => {
    const accommodation = day.accommodation
    if (!accommodation || typeof accommodation !== 'object') return
    const key = stayKey(accommodation)
    let entry = stays.get(key)
    if (!entry) {
      entry = {
        stay: {
          key,
          name: '',
          cities: [],
          address: '',
          nights: 0,
          suggestedPrivate: false,
        },
        nights: new Set(),
        cityKeys: new Set(),
      }
      stays.set(key, entry)
    }
    const { stay } = entry
    if (!stay.name && hasText(accommodation.name)) {
      stay.name = accommodation.name.trim()
    }
    if (!stay.address && hasText(accommodation.address)) {
      stay.address = accommodation.address.trim()
    }
    if (hasText(day.city) && !entry.cityKeys.has(nameKey(day.city))) {
      entry.cityKeys.add(nameKey(day.city))
      stay.cities.push(day.city.trim())
    }
    stay.suggestedPrivate ||= looksLikePrivateStay(accommodation)
    const range = stayRange(accommodation)
    if (range) {
      for (let night = range.from; night < range.to; night += 1) {
        entry.nights.add(`n${night}`)
      }
    } else {
      entry.nights.add(
        isIsoDate(day.date) ? `n${toDayNumber(day.date)}` : `d${index}`,
      )
    }
  })
  return Array.from(stays.values(), ({ stay, nights }) => ({
    ...stay,
    nights: nights.size,
  }))
}

/** Mots entiers, sur un texte sans accents ni casse (`fold`). */
function wordsPattern(words: readonly string[]): RegExp {
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(?:${words.join('|')})(?![\\p{L}\\p{N}])`,
    'u',
  )
}

/**
 * Hôtels, auberges, ryokans, campings… : une adresse publique, jamais
 * proposée comme privée, même avec un étage dans l'adresse.
 */
const COMMERCIAL_STAY = wordsPattern([
  'hotels?',
  'hostels?',
  'hostal',
  'motel',
  'auberges?',
  'ryokan',
  'campings?',
  'glamping',
  'resorts?',
  'inn',
  'lodge',
  'b\\s*&\\s*b',
  'bnb',
  'bed\\s*(?:and|&)\\s*breakfast',
  'guest\\s*house',
  'guesthouse',
  "maisons?\\s+d['’]\\s*hotes",
  "chambres?\\s+d['’]\\s*hotes",
  'pension',
  'pousada',
  'agriturismo',
  'minshuku',
  'apart\\s*-?\\s*hotel',
  'aparthotel',
])
/** Les mêmes, en écritures sans espace entre les mots (japonais, chinois, coréen). */
const COMMERCIAL_STAY_CJK =
  /ホテル|旅館|民宿|ゲストハウス|酒店|宾馆|賓館|旅馆|旅舍|客栈|호텔|게스트하우스/u

/** Noms qui annoncent un logement privé : chez des proches, une location. */
const PRIVATE_HOME = wordsPattern([
  'chez',
  'familles?',
  'family',
  'parents',
  'amis?',
  'amies?',
  'friends?',
  'proches',
  'cousins?',
  'cousines?',
  'tantes?',
  'oncles?',
  'freres?',
  'soeurs?',
  'copains?',
  'copines?',
  'potes',
  'appartement',
  'appart',
  'appt',
  'apt',
  'apartment',
  'studio',
  'maison',
  'house\\s+of',
  'airbnb',
  'vrbo',
  'abritel',
  'logement',
  'home',
  'flat',
  'villa\\s+privee',
  'private\\s+(?:villa|home|house|flat)',
  'domicile',
  'coloc(?:ation)?',
])
/** Location chez l'habitant, au Japon (« minpaku »). */
const PRIVATE_HOME_CJK = /民泊/u

/** Airbnb écrit en morceaux (« Air BnB », « Air B&B », « Air B & B »), sur un nom plié. */
const AIRBNB = /(?:^|[^\p{L}\p{N}])air\s*b\s*(?:n|&)\s*b(?![\p{L}\p{N}])/u

/**
 * Détails qui ne figurent qu'à l'adresse d'un logement : étage, bâtiment,
 * porte, digicode, interphone, appartement, `floor`, `unit`, `#12`…
 */
const HOME_DETAIL = wordsPattern([
  'etages?',
  'batiment',
  'bat\\.?\\s*[a-z0-9](?![\\p{L}\\p{N}])',
  'porte\\s*(?:n°?\\s*)?\\d+[a-z]?',
  // « porte B », mais pas « Porte d'Italie » : l'apostrophe suit la lettre.
  "porte\\s+[a-z](?![\\p{L}\\p{N}'’])",
  'porte\\s+(?:gauche|droite|face)',
  'digicode',
  "code\\s*(?:porte|immeuble|portail|d['’]entree|entree)?\\s*:?\\s*[a-z]?\\d+[a-z]?",
  'interphone',
  'escalier\\s+[a-z0-9](?![\\p{L}\\p{N}])',
  'esc\\.\\s*[a-z0-9]',
  'apt',
  'appt',
  'app\\.\\s*\\d+[a-z]?',
  'appartement',
  'apartment',
  '\\d+\\s*(?:st|nd|rd|th|e|er|eme)?\\s*floor',
  'floor\\s*\\d+',
  'unit\\s*#?\\s*\\d+[a-z]?',
  'room\\s*#?\\s*\\d+',
  'flat\\s*#?\\s*\\d+[a-z]?',
  'chez',
  'c/o',
])
/** Sans frontière de mot : `#12`, et le numéro de chambre japonais (`302号室`). */
const HOME_DETAIL_ANYWHERE = /#\s*\d|号室/u

/**
 * Cet hébergement ressemble-t-il à un logement privé ? Vrai si son nom
 * l'annonce (« Chez Marie », « Appartement Alfama (Airbnb) », « Maison de
 * famille », « Flat in Shoreditch ») ou si son nom ou son adresse portent un
 * détail d'accès (« 3e étage », « digicode 4521 », « Apt 4B », « 2nd floor »,
 * « #12 »). Jamais pour un hôtel, une auberge, un ryokan ou un camping
 * (`COMMERCIAL_STAY`, lu dans le nom) : leur adresse est publique.
 *
 * Ce n'est qu'une suggestion pour l'écran A2 : l'auteur coche ou décoche.
 */
export function looksLikePrivateStay(
  accommodation: Pick<Accommodation, 'name' | 'address'>,
): boolean {
  const name = typeof accommodation.name === 'string' ? accommodation.name : ''
  const address =
    typeof accommodation.address === 'string' ? accommodation.address : ''
  const foldedName = fold(name)
  // « Air BnB », « Air B&B » : une location chez l'habitant, que le « bnb »
  // des chambres d'hôtes (`COMMERCIAL_STAY`) ne doit pas faire passer pour un hôtel.
  if (AIRBNB.test(foldedName)) return true
  if (COMMERCIAL_STAY.test(foldedName) || COMMERCIAL_STAY_CJK.test(name)) {
    return false
  }
  return (
    PRIVATE_HOME.test(foldedName) ||
    PRIVATE_HOME_CJK.test(name) ||
    [foldedName, fold(address)].some(
      (text) => HOME_DETAIL.test(text) || HOME_DETAIL_ANYWHERE.test(text),
    )
  )
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
