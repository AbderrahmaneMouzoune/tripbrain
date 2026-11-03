/**
 * Itinéraires modèles : reprendre le voyage d'un autre, à ses propres dates.
 *
 * Le repreneur choisit une date de départ (écran B3), puis les journées qu'il
 * garde, regroupées par ville (B4). `retimeTemplate` en tire son voyage :
 * journées filtrées, dates resserrées sans trou, hébergements et trajets remis
 * d'aplomb. La bannière de B5 liste ensuite ce qui reste à réserver
 * (`templateTodo`).
 *
 * Le recalage est pur et déterministe — même modèle, même date, mêmes
 * journées : même résultat, sans horloge ni hasard — parce que la V1.1 le
 * rejoue sur la nouvelle version du modèle pour la fusionner avec le voyage du
 * repreneur (`trip-merge.ts`). Pour la même raison, tous les ids (journées,
 * activités, trajets, hébergements) sortent tels qu'ils sont entrés : la
 * fusion apparie par id.
 *
 * Règles : `docs/itineraire-modele-technique.md` §3.2 et
 * `docs/itineraire-modele.md` §6.
 */

import type {
  Accommodation,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'
import {
  MAX_DAY_NUMBER,
  addDays,
  fromDayNumber,
  isIsoDate,
  shiftDatesDeep,
  splitIsoDateValue,
  toDayNumber,
} from '@/lib/iso-date'
import type { PublicTemplate, TemplateOrigin } from '@/lib/template-model'

// ── Comparer des noms ─────────────────────────────────────────────────────────

/** Sans accents ni casse : « Journée LIBRE » → « journee libre ». */
function plainText(text: string | undefined): string {
  return (text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Forme comparable d'un lieu : sans accents ni casse, la ponctuation ramenée à
 * des espaces. « Xi’an » et « Xi'an » se rejoignent, et
 * « XIY Xi’an Xianyang Intl. » contient bien le mot « xi an ».
 */
function placeKey(text: string | undefined): string {
  return plainText(text)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Deux hébergements sont le même s'ils portent le même nom, à la casse et aux
 * espaces près. Sans nom, on ne peut se fier qu'à l'id.
 */
function accommodationKey(accommodation: Accommodation): string {
  const name = (accommodation.name ?? '').toLowerCase().replace(/\s+/g, '')
  return name ? `nom:${name}` : `id:${accommodation.id}`
}

/** Villes du modèle (clés `placeKey`), dans l'ordre du voyage, sans doublon. */
function cityKeys(itinerary: readonly DayItinerary[]): string[] {
  const keys = itinerary.map((day) => placeKey(day.city)).filter(Boolean)
  return keys.filter((key, index) => keys.indexOf(key) === index)
}

/**
 * Ville du modèle que désigne un lieu de trajet. Un trajet nomme souvent une
 * gare ou un aéroport (« PKX Beijing Daxing Intl. ») plutôt que la ville : on
 * cherche donc la ville comme suite de mots entiers dans le lieu (« Nara » ne
 * se trouve pas dans « Narita »), et la plus longue l'emporte (« Shin Osaka »
 * devant « Osaka », si les deux sont des étapes).
 */
function matchCity(
  place: string | undefined,
  cities: readonly string[],
): string | null {
  const key = placeKey(place)
  if (!key) return null
  const padded = ` ${key} `
  let best: string | null = null
  for (const city of cities) {
    if (city === key) return city
    if (
      padded.includes(` ${city} `) &&
      (best === null || city.length > best.length)
    ) {
      best = city
    }
  }
  return best
}

/** Suite d'éléments consécutifs qui partagent la même clé (bornes incluses). */
interface Run {
  key: string
  first: number
  last: number
}

/** Découpe en suites consécutives de même clé ; une clé `null` n'entre dans aucune. */
function runsOf<T>(
  items: readonly T[],
  keyOf: (item: T) => string | null,
): Run[] {
  const runs: Run[] = []
  items.forEach((item, index) => {
    const key = keyOf(item)
    if (key === null) return
    const current = runs[runs.length - 1]
    if (current && current.key === key && current.last === index - 1) {
      current.last = index
    } else {
      runs.push({ key, first: index, last: index })
    }
  })
  return runs
}

// ── Lecture du modèle ─────────────────────────────────────────────────────────

/** Séjour dont une journée est une nuit. */
interface Stay {
  key: string
  /** L'hébergement tel que le modèle le porte (journée d'arrivée, ou celle-ci). */
  accommodation: Accommodation
}

/** Ce que le recalage sait d'une journée du modèle, avant tout filtrage. */
interface TemplateDay {
  day: DayItinerary
  /**
   * Jour (compté depuis l'époque) où tombait la journée chez l'auteur. Une
   * journée sans date lisible se situe d'après la première journée datée ;
   * `null` quand le modèle n'a aucune date.
   */
  oldDay: number | null
  /** Le séjour dont c'est la nuit ; `null` si on ne sait pas où l'on dort. */
  stay: Stay | null
}

/**
 * Le séjour qui couvre la nuit d'une journée. Deux façons d'écrire un même
 * séjour coexistent : l'hébergement répété sur chaque journée (imports ligne à
 * ligne), ou porté par la seule journée d'arrivée, les soirs suivants
 * remontant jusqu'à lui tant que son `checkOut` n'est pas passé — c'est la
 * convention de l'app (`findStay`, `day-logic.ts`) et de la démo. Les deux
 * donnent ici la même clé à toutes les nuits du séjour.
 */
function stayOf(
  day: DayItinerary,
  oldDay: number | null,
  previous: Stay | null,
): Stay | null {
  if (day.accommodation) {
    return {
      key: accommodationKey(day.accommodation),
      accommodation: day.accommodation,
    }
  }
  if (!previous || oldDay === null) return null
  const checkOut = splitIsoDateValue(previous.accommodation.checkOut)
  return checkOut && oldDay < toDayNumber(checkOut.date) ? previous : null
}

function readTemplate(itinerary: readonly DayItinerary[]): TemplateDay[] {
  const firstDated = itinerary.findIndex((day) => isIsoDate(day.date))
  const origin =
    firstDated === -1
      ? null
      : toDayNumber(itinerary[firstDated].date) - firstDated
  const days: TemplateDay[] = []
  itinerary.forEach((day, index) => {
    const oldDay = isIsoDate(day.date)
      ? toDayNumber(day.date)
      : origin === null
        ? null
        : origin + index
    const previous = index > 0 ? days[index - 1].stay : null
    days.push({ day, oldDay, stay: stayOf(day, oldDay, previous) })
  })
  return days
}

// ── Recalage ──────────────────────────────────────────────────────────────────

export interface RetimeOptions {
  /** Date de départ choisie par le repreneur, `AAAA-MM-JJ`. */
  startDate: string
  /**
   * Journées gardées, par id du modèle. L'ordre ne compte pas (celui du
   * modèle prime) et un id inconnu est ignoré.
   */
  keptDayIds: readonly string[]
}

function sameId<T extends { id: string }>(moved: T, original: T): T {
  return { ...moved, id: original.id }
}

/**
 * La journée prend sa nouvelle place, et tout ce qu'elle contient glisse du
 * même écart (horaires de transport compris, l'heure restant la même). Les
 * ids sont recopiés tels quels après coup : un import peut avoir pris une date
 * comme id, et `shiftDatesDeep` l'aurait décalé comme une date.
 */
function moveDay(
  day: DayItinerary,
  offset: number,
  date: string,
  dayNumber: number,
): DayItinerary {
  const moved = shiftDatesDeep(day, offset)
  const result: DayItinerary = {
    ...moved,
    id: day.id,
    // La date d'origine a pu être vide ou illisible : on la pose, on ne la
    // décale pas une seconde fois.
    date,
    dayNumber,
    activities: moved.activities.map((activity, index) =>
      sameId(activity, day.activities[index]),
    ),
  }
  if (moved.accommodation && day.accommodation) {
    result.accommodation = sameId(moved.accommodation, day.accommodation)
  }
  if (moved.transport && day.transport) {
    result.transport = sameId(moved.transport, day.transport)
  }
  return result
}

/** Pose une nouvelle date en gardant l'heure (`T15:00:00`) ; vide ou illisible reste tel quel. */
function redate(value: string, date: string): string {
  const parts = splitIsoDateValue(value)
  return parts ? date + parts.time : value
}

function redateStay(
  accommodation: Accommodation,
  checkIn: string,
  checkOut: string,
): Accommodation {
  return {
    ...accommodation,
    checkIn: redate(accommodation.checkIn, checkIn),
    checkOut: redate(accommodation.checkOut, checkOut),
  }
}

function withoutTransport(day: DayItinerary): DayItinerary {
  const { transport: _transport, ...rest } = day
  return rest
}

/**
 * Ce qui décrivait l'ancien trajet, et ne dit plus rien de vrai une fois
 * qu'une de ses extrémités change : horaires, durée, compagnie, adresse de
 * départ, détails, lien et prix de réservation, notes. La référence, le
 * siège, la porte, le terminal et le statut partent aussi — le nettoyage les
 * retire déjà à la publication, mais le recalage ne compte pas dessus.
 */
const ROUTE_FIELDS = [
  'departureTime',
  'arrivalTime',
  'duration',
  'provider',
  'departureAddress',
  'details',
  'bookingUrl',
  'price',
  'currency',
  'notes',
  'bookingReference',
  'seat',
  'gate',
  'terminal',
  'status',
] as const satisfies readonly (keyof Transport)[]

/**
 * Le trajet relie désormais d'autres étapes : il ne garde que son id, son
 * type et ses extrémités. Un départ vide (pas d'étape précédente) retire
 * `from` : le trajet part de nulle part de connu.
 */
function reroute(
  transport: Transport,
  ends: { from?: string; to?: string },
): Transport {
  const rerouted: Transport = { ...transport }
  for (const field of ROUTE_FIELDS) delete rerouted[field]
  if (ends.to !== undefined) rerouted.to = ends.to
  if (ends.from !== undefined) {
    if (ends.from) rerouted.from = ends.from
    else delete rerouted.from
  }
  return rerouted
}

/**
 * Le voyage du repreneur, tiré du modèle (§3.2 de la conception) :
 *
 * 1. seules les journées de `keptDayIds` restent, dans l'ordre du modèle ;
 * 2. la journée de rang `i` prend la date `startDate + i` et le numéro
 *    `i + 1`, sans trou ;
 * 3. toute date ou date-heure de la journée glisse du même écart qu'elle
 *    (nouvelle date − ancienne) ; les heures ne bougent pas. Une journée sans
 *    date lisible se situe d'après la première journée datée ; un modèle sans
 *    aucune date ne décale rien, seule la date de chaque journée est posée ;
 * 4. chaque séjour (nuits consécutives gardées au même hébergement) va du
 *    soir de sa première journée au lendemain de sa dernière, à l'heure
 *    d'origine. Si le repreneur a retiré la journée d'arrivée qui portait
 *    l'hébergement, celui-ci passe sur la première journée gardée du séjour ;
 * 5. les trajets qui touchent une ville entièrement retirée (reconnue aussi
 *    dans un nom de gare ou d'aéroport) sont recousus : ils ne gardent de
 *    l'ancien trajet que leur id, leur type et leurs extrémités, tout le
 *    reste (`ROUTE_FIELDS`) part avec lui :
 *    - celui qui y va mène désormais à la ville de la journée gardée
 *      suivante (Tokyo → Hakone, sans Hakone, devient Tokyo → Kyoto). Il
 *      disparaît s'il n'y a plus de journée suivante, s'il n'y a plus à
 *      bouger (la suivante est dans sa ville de départ ou dans celle de sa
 *      journée), s'il partait lui aussi d'une ville retirée, ou si la
 *      suivante porte déjà le trajet qui arrive de la ville retirée ;
 *    - celui qui en vient repart de la ville de la journée gardée
 *      précédente — et disparaît s'il repartirait de là où il arrive
 *      (Tokyo → Nikko → Tokyo, sans Nikko).
 *
 * Lève une erreur si `startDate` n'est pas une date, si aucune journée ne
 * reste, ou si le voyage sortirait du calendrier (`tripFitsCalendar`, ou une
 * date de la journée décalée au-delà de 9999 ou avant 0000). Ne modifie
 * jamais `itinerary` : le résultat est une copie profonde.
 */
export function retimeTemplate(
  itinerary: readonly DayItinerary[],
  options: RetimeOptions,
): DayItinerary[] {
  const { startDate, keptDayIds } = options
  if (!isIsoDate(startDate)) {
    throw new Error(
      `Date de départ invalide (« ${startDate} ») : il faut une date AAAA-MM-JJ qui existe.`,
    )
  }
  const keptIds = new Set(keptDayIds)
  const kept = readTemplate(itinerary).filter(({ day }) => keptIds.has(day.id))
  if (kept.length === 0) {
    throw new Error('Il faut garder au moins une journée du modèle.')
  }
  const outOfCalendar = () =>
    new Error(
      `Date de départ hors calendrier (« ${startDate} ») : le voyage doit tenir entre le 0000-01-01 et le 9999-12-31.`,
    )
  if (!tripFitsCalendar(startDate, kept.length)) throw outOfCalendar()
  try {
    return placeDays(itinerary, kept, toDayNumber(startDate))
  } catch (error) {
    // Une date de la journée (un vol de nuit, un départ la veille) que
    // l'écart ferait sortir du calendrier.
    if (error instanceof RangeError) throw outOfCalendar()
    throw error
  }
}

/**
 * Le voyage tient-il au calendrier ? De `startDate` au lendemain de la
 * dernière nuit (le `checkOut` d'un séjour), soit `nights` jours plus loin,
 * tout doit tenir au plus tard le 9999-12-31. C'est la règle de `retimeTemplate`,
 * et celle de l'écran B4 (`groupDaysByCity`), qui ne date alors rien.
 */
function tripFitsCalendar(startDate: string, nights: number): boolean {
  return toDayNumber(startDate) + nights <= MAX_DAY_NUMBER
}

/** Les étapes 1 à 5 de `retimeTemplate`, une fois les entrées vérifiées. */
function placeDays(
  itinerary: readonly DayItinerary[],
  kept: readonly TemplateDay[],
  start: number,
): DayItinerary[] {
  // 1 à 3 — chaque journée à sa place, son contenu avec elle.
  const offsets = kept.map(({ oldDay }, rank) =>
    oldDay === null ? 0 : start + rank - oldDay,
  )
  const days = kept.map(({ day }, rank) =>
    moveDay(day, offsets[rank], fromDayNumber(start + rank), rank + 1),
  )

  // 4 — hébergements, séjour par séjour.
  for (const run of runsOf(kept, ({ stay }) => stay?.key ?? null)) {
    const checkIn = fromDayNumber(start + run.first)
    const checkOut = fromDayNumber(start + run.last + 1)
    for (let rank = run.first; rank <= run.last; rank++) {
      const accommodation = days[rank].accommodation
      if (!accommodation) continue
      days[rank] = {
        ...days[rank],
        accommodation: redateStay(accommodation, checkIn, checkOut),
      }
    }
    const stay = kept[run.first].stay
    if (days[run.first].accommodation || !stay) continue
    // La première nuit gardée du séjour n'a pas d'hébergement : sa journée
    // d'arrivée, qui le portait, est retirée (§3.2.4). Même si l'hôtel est
    // répété plus loin dans le séjour, `findStay` ne regarde qu'en arrière :
    // sans ce report, cette nuit n'aurait plus de toit.
    const moved = sameId(
      shiftDatesDeep(stay.accommodation, offsets[run.first]),
      stay.accommodation,
    )
    days[run.first] = {
      ...days[run.first],
      accommodation: redateStay(moved, checkIn, checkOut),
    }
  }

  // 5 — trajets vers ou depuis une ville entièrement retirée.
  const cities = cityKeys(itinerary)
  const keptCities = new Set(days.map((day) => placeKey(day.city)))
  const isRemovedCity = (place: string | undefined) => {
    const city = matchCity(place, cities)
    return city !== null && !keptCities.has(city)
  }
  /** Le lieu désigne-t-il cette ville, ou une gare, un aéroport qui la nomme ? */
  const isIn = (place: string | undefined, city: string) => {
    const key = placeKey(city)
    return key !== '' && matchCity(place, cities) === key
  }
  /** Ville de la journée gardée de ce rang ; `''` hors du voyage ou sans ville. */
  const cityAt = (rank: number) => days[rank]?.city?.trim() ?? ''
  /**
   * Le trajet de cette journée vient d'une ville retirée et sera recousu
   * depuis l'étape précédente : il dit déjà comment on arrive ici.
   */
  const arrivesFromRemovedCity = (rank: number) => {
    const transport = days[rank]?.transport
    return (
      transport !== undefined &&
      !isRemovedCity(transport.to) &&
      isRemovedCity(transport.from) &&
      !isIn(transport.to, cityAt(rank - 1))
    )
  }

  return days.map((day, rank) => {
    const transport = day.transport
    if (!transport) return day

    // Vers une ville retirée (trajet rangé au jour du départ) : il mène
    // désormais à l'étape suivante, sauf s'il n'y a plus d'étape suivante,
    // plus rien à parcourir, ou si l'étape suivante porte déjà le trajet qui
    // y arrive (conventions mêlées : on n'en garde qu'un).
    if (isRemovedCity(transport.to)) {
      const next = cityAt(rank + 1)
      if (
        !next ||
        isRemovedCity(transport.from) ||
        isIn(transport.from, next) ||
        isIn(day.city, next) ||
        arrivesFromRemovedCity(rank + 1)
      ) {
        return withoutTransport(day)
      }
      return { ...day, transport: reroute(transport, { to: next }) }
    }

    // Depuis une ville retirée (trajet rangé au jour d'arrivée) : il repart
    // de l'étape précédente, sauf s'il y reviendrait.
    if (!isRemovedCity(transport.from)) return day
    const previous = cityAt(rank - 1)
    if (isIn(transport.to, previous)) return withoutTransport(day)
    return { ...day, transport: reroute(transport, { from: previous }) }
  })
}

// ── Ce qui reste à réserver (B5) ──────────────────────────────────────────────

export interface TemplateTodo {
  /**
   * Hébergements distincts (même nom à la casse et aux espaces près), dans
   * l'ordre du voyage, dont une nuit au moins n'a pas de référence de
   * réservation. Un hébergement sans nom n'est pas listé.
   */
  accommodations: string[]
  /** Trajets en train, avion ou bus sans référence (la voiture ne se réserve pas forcément). */
  transports: number
  /** Activités marquées « réservation nécessaire ». */
  bookableActivities: number
}

const BOOKABLE_TRANSPORTS: ReadonlySet<string> = new Set([
  'train',
  'plane',
  'bus',
])

function hasReference(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

/** Ce que le repreneur doit encore réserver : un modèle arrive sans aucune référence. */
export function templateTodo(itinerary: readonly DayItinerary[]): TemplateTodo {
  const accommodations = new Map<string, string>()
  let transports = 0
  let bookableActivities = 0
  for (const day of itinerary) {
    const accommodation = day.accommodation
    if (accommodation && !hasReference(accommodation.bookingReference)) {
      const name = (accommodation.name ?? '').trim()
      const key = accommodationKey(accommodation)
      if (name && !accommodations.has(key)) accommodations.set(key, name)
    }
    const transport = day.transport
    if (
      transport &&
      BOOKABLE_TRANSPORTS.has(transport.type) &&
      !hasReference(transport.bookingReference)
    ) {
      transports++
    }
    for (const activity of day.activities) {
      if (activity.reservationRequired === true) bookableActivities++
    }
  }
  return {
    accommodations: Array.from(accommodations.values()),
    transports,
    bookableActivities,
  }
}

// ── Choix des journées (B3 → B4) ──────────────────────────────────────────────

/** Une journée du modèle sur l'écran B4. */
export interface CityGroupDay {
  /** Id de la journée dans le modèle. */
  id: string
  /** Rang de la journée dans le modèle (1 pour la première), pas dans le voyage repris. */
  dayNumber: number
  title: string
  kept: boolean
  /**
   * Date que la journée prendra dans le voyage repris (`AAAA-MM-JJ`), la même
   * que celle que `retimeTemplate` lui donnera. `null` si elle est retirée, ou
   * si `startDate` n'est pas (encore) une date valide.
   */
  date: string | null
}

/** Une étape de l'écran B4 : des journées consécutives dans la même ville. */
export interface CityGroup {
  /** La ville telle qu'écrite sur la première journée de l'étape (peut être vide). */
  city: string
  days: CityGroupDay[]
  /** Nuits sur place : le nombre de journées gardées de l'étape. */
  nights: number
  /**
   * Dates de la première et de la dernière journée gardée ; `null` si aucune
   * ne l'est (ou sans date de départ valide).
   */
  range: { start: string; end: string } | null
}

/**
 * Les journées du modèle regroupées par étape, telles que B4 les montre : une
 * étape par suite de journées consécutives dans la même ville (Tokyo, Kyoto,
 * Tokyo font trois étapes). Les dates suivent en direct ce qui est coché,
 * resserrées comme le fera `retimeTemplate`. Ne lève jamais d'erreur : l'écran
 * se redessine à chaque case cochée, même sans date de départ valide.
 */
export function groupDaysByCity(
  itinerary: readonly DayItinerary[],
  keptDayIds: readonly string[],
  startDate: string,
): CityGroup[] {
  const keptIds = new Set(keptDayIds)
  const keptCount = itinerary.filter((day) => keptIds.has(day.id)).length
  // Une date que `retimeTemplate` refuserait (le voyage sortirait du
  // calendrier) ne date rien, comme une date pas encore valide.
  const hasStart =
    isIsoDate(startDate) && tripFitsCalendar(startDate, keptCount)
  let rank = 0
  const entries = itinerary.map((day, index): CityGroupDay => {
    const kept = keptIds.has(day.id)
    const date = kept && hasStart ? addDays(startDate, rank) : null
    if (kept) rank++
    return { id: day.id, dayNumber: index + 1, title: day.title, kept, date }
  })
  return runsOf(itinerary, (day) => placeKey(day.city)).map(
    ({ first, last }) => {
      const days = entries.slice(first, last + 1)
      const dates = days.flatMap((day) => (day.date === null ? [] : [day.date]))
      return {
        city: (itinerary[first].city ?? '').trim(),
        days,
        nights: days.filter((day) => day.kept).length,
        range:
          dates.length > 0
            ? { start: dates[0], end: dates[dates.length - 1] }
            : null,
      }
    },
  )
}

const REST_DAY_TYPES: ReadonlySet<string> = new Set([
  'free',
  'rest',
  'relax',
  'libre',
  'repos',
])
const REST_WORDS = /\b(?:libres?|repos)\b/

/**
 * Journée libre ou de repos, d'après son type (`free`, `rest`, `libre`…) ou
 * son titre (« Journée libre à Kyoto », « Repos »), sans égard aux accents ni
 * à la casse. C'est celle qu'on sacrifie d'abord quand le voyage raccourcit.
 */
export function looksLikeRestDay(
  day: Pick<DayItinerary, 'dayType' | 'title'>,
): boolean {
  const type = plainText(day.dayType)
  return (
    REST_DAY_TYPES.has(type) ||
    REST_WORDS.test(type) ||
    REST_WORDS.test(plainText(day.title))
  )
}

/**
 * Sélection proposée par défaut quand la reprise dure `count` jours, moins que
 * le modèle : on retire d'abord les journées libres ou de repos (en partant de
 * la fin), puis les dernières journées. Le jour 1 reste toujours : c'est
 * l'arrivée, celle qui donne son sens au reste. Les ids sortent dans l'ordre
 * du modèle ; tous si `count` couvre le modèle. Lève une erreur si `count`
 * n'est pas un entier ≥ 1.
 */
export function suggestKeptDayIds(
  itinerary: readonly DayItinerary[],
  count: number,
): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `Il faut garder au moins une journée (durée demandée : ${count}).`,
    )
  }
  if (count >= itinerary.length) return itinerary.map((day) => day.id)

  let toDrop = itinerary.length - count
  const dropped = new Set<number>()
  for (let index = itinerary.length - 1; index > 0 && toDrop > 0; index--) {
    if (looksLikeRestDay(itinerary[index])) {
      dropped.add(index)
      toDrop--
    }
  }
  for (let index = itinerary.length - 1; index > 0 && toDrop > 0; index--) {
    if (!dropped.has(index)) {
      dropped.add(index)
      toDrop--
    }
  }
  return itinerary
    .filter((_, index) => !dropped.has(index))
    .map((day) => day.id)
}

// ── Mesure ────────────────────────────────────────────────────────────────────

export type DurationChoice = 'same' | 'shorter'

/**
 * Durée de la reprise par rapport au modèle, pour `template_taken { duration }`.
 * Les journées gardées sont prises parmi celles du modèle : la reprise n'est
 * jamais plus longue. Un compte de journées gardées égal ou supérieur à celui
 * du modèle (ce qui ne peut venir que d'un appel erroné) vaut donc `same`.
 */
export function durationChoice(
  templateDays: number,
  keptDays: number,
): DurationChoice {
  return keptDays < templateDays ? 'shorter' : 'same'
}

// ── Lien au modèle (B5, puis V1.1) ────────────────────────────────────────────

/**
 * Le `origin` du voyage repris (`StoredTrip.origin`) : d'où il vient, et le
 * modèle tel qu'il a été recalé et filtré — la base de la fusion V1.1.
 *
 * - `base` est une copie profonde de `retimed` : le voyage, que le repreneur
 *   va retoucher, et sa base ne partagent aucun objet. Copie en JSON : le
 *   modèle arrive d'une réponse JSON, et la fusion (`trip-merge.ts`) tient une
 *   clé à `undefined` pour absente ;
 * - `keptDayIds` reprend les ids gardés dans l'ordre du modèle (celui de
 *   `retimed`), sans doublon, sans id inconnu — ce que `retimeTemplate`
 *   aura effectivement gardé, pour le rejouer à l'identique en V1.1 ;
 * - `tripYear` situe les prix repris (« prix relevés en 2025 »).
 *
 * Lève une erreur si `startDate` n'est pas une date ou si `retimed` est vide,
 * comme `retimeTemplate`. `takenAt` est un horodatage en ms : la fonction
 * reste pure, l'appelant passe `Date.now()`.
 */
export function buildTemplateOrigin(
  template: Pick<
    PublicTemplate,
    'id' | 'version' | 'title' | 'authorName' | 'tripYear'
  >,
  retimed: readonly DayItinerary[],
  input: { startDate: string; keptDayIds: readonly string[] },
  takenAt: number,
): TemplateOrigin {
  if (!isIsoDate(input.startDate)) {
    throw new Error(
      `Date de départ invalide (« ${input.startDate} ») : il faut une date AAAA-MM-JJ qui existe.`,
    )
  }
  if (retimed.length === 0) {
    throw new Error('Il faut garder au moins une journée du modèle.')
  }
  const wanted = new Set(input.keptDayIds)
  const keptDayIds = retimed
    .map((day) => day.id)
    .filter((id, index, ids) => wanted.has(id) && ids.indexOf(id) === index)
  return {
    templateId: template.id,
    version: template.version,
    title: template.title,
    authorName: template.authorName,
    tripYear: template.tripYear,
    startDate: input.startDate,
    keptDayIds,
    base: JSON.parse(JSON.stringify(retimed)) as DayItinerary[],
    takenAt,
  }
}
