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
  addDays,
  fromDayNumber,
  isIsoDate,
  shiftDatesDeep,
  splitIsoDateValue,
  toDayNumber,
} from '@/lib/iso-date'

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
 * Le trajet part désormais de la ville précédente (ou de nulle part de
 * connu) : son horaire, sa durée, sa compagnie, son quai et ses détails
 * décrivaient l'ancien trajet, ils ne disent plus rien de vrai.
 */
function rerouteFrom(transport: Transport, from: string): Transport {
  const {
    from: _from,
    departureTime: _departureTime,
    arrivalTime: _arrivalTime,
    duration: _duration,
    provider: _provider,
    departureAddress: _departureAddress,
    details: _details,
    ...rest
  } = transport
  return from ? { ...rest, from } : rest
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
 * 5. le trajet qui va vers une ville entièrement retirée disparaît. Celui qui
 *    en vient repart de la ville de la journée gardée précédente, sans les
 *    détails de l'ancien trajet — et disparaît s'il repartirait de là où il
 *    arrive (Tokyo → Nikko → Tokyo, sans Nikko).
 *
 * Lève une erreur si `startDate` n'est pas une date, ou si aucune journée ne
 * reste. Ne modifie jamais `itinerary` : le résultat est une copie profonde.
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

  // 1 à 3 — chaque journée à sa place, son contenu avec elle.
  const start = toDayNumber(startDate)
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
    let carried = false
    for (let rank = run.first; rank <= run.last; rank++) {
      const accommodation = days[rank].accommodation
      if (!accommodation) continue
      carried = true
      days[rank] = {
        ...days[rank],
        accommodation: redateStay(accommodation, checkIn, checkOut),
      }
    }
    const stay = kept[run.first].stay
    if (carried || !stay) continue
    // Seule la journée d'arrivée portait l'hébergement, et elle est retirée :
    // sans ce report, les nuits gardées du séjour n'auraient plus de toit.
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

  return days.map((day, rank) => {
    const transport = day.transport
    if (!transport) return day
    if (isRemovedCity(transport.to)) return withoutTransport(day)
    if (!isRemovedCity(transport.from)) return day
    const previousCity = rank > 0 ? days[rank - 1].city.trim() : ''
    if (
      previousCity &&
      matchCity(transport.to, cities) === placeKey(previousCity)
    ) {
      return withoutTransport(day)
    }
    return { ...day, transport: rerouteFrom(transport, previousCity) }
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
  const hasStart = isIsoDate(startDate)
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

export type DurationChoice = 'same' | 'shorter' | 'longer'

/** Durée de la reprise par rapport au modèle, pour `template_taken { duration }`. */
export function durationChoice(
  templateDays: number,
  keptDays: number,
): DurationChoice {
  if (keptDays === templateDays) return 'same'
  return keptDays < templateDays ? 'shorter' : 'longer'
}
