/**
 * Logique pure de la vie quotidienne pendant le voyage : prochaine étape, nuit
 * en cours, compte à rebours, préparation du départ, programme groupé par
 * ville, réordonnancement. Aucune dépendance à React ni au navigateur : tout
 * se vérifie en test (`src/lib/__tests__/day-logic.test.ts`).
 */

import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'
import { parseDayDate } from '@/lib/trips'
import { mapsDirectionsUrl } from '@/lib/quick-actions'

const DAY_MS = 86_400_000

function startOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/** Jours entiers entre deux dates ISO (négatif si `to` précède `from`). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (startOfDay(parseDayDate(toIso)) - startOfDay(parseDayDate(fromIso))) /
      DAY_MS,
  )
}

/** Une date ISO lisible (`2026-05-14`) : sinon, impossible de compter des nuits. */
function isIsoDate(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
}

// ── Libellés ──────────────────────────────────────────────────────────────────

export const ACTIVITY_TYPE_LABELS: Record<Activity['type'], string> = {
  visit: 'Visite',
  transport: 'Trajet',
  food: 'Repas',
  experience: 'Expérience',
  shopping: 'Shopping',
}

export const TRANSPORT_TYPE_LABELS: Record<Transport['type'], string> = {
  train: 'Train',
  car: 'Voiture',
  plane: 'Vol',
  bus: 'Bus',
}

/** Statut d'un trajet ou d'un hébergement, dans l'ordre où il avance. */
export const BOOKING_STATUS_STEPS = [
  'planned',
  'booked',
  'checked-in',
  'completed',
] as const

export type BookingStatus = (typeof BOOKING_STATUS_STEPS)[number]

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  planned: 'Prévu',
  booked: 'Réservé',
  'checked-in': 'Enregistré',
  completed: 'Terminé',
}

/** Types de journée connus : les autres sont repris tels quels, capitalisés. */
const DAY_TYPE_LABELS: Record<string, string> = {
  arrival: 'Arrivée',
  departure: 'Départ',
  exploration: 'Exploration',
  culture: 'Culture',
  historic: 'Histoire',
  nature: 'Nature',
  coastal: 'Bord de mer',
  rest: 'Repos',
  relax: 'Détente',
  transit: 'Trajet',
  travel: 'Trajet',
  food: 'Gastronomie',
  shopping: 'Shopping',
}

export function dayTypeLabel(dayType: string | undefined): string | undefined {
  const raw = dayType?.trim()
  if (!raw) return undefined
  return (
    DAY_TYPE_LABELS[raw.toLowerCase()] ??
    raw.charAt(0).toUpperCase() + raw.slice(1)
  )
}

/**
 * Durées saisies de mille façons (« 1h30 », « 2h 10m », « 45m ») ramenées à la
 * typographie de l'app : « 1 h 30 », « 2 h 10 », « 45 min ».
 */
export function formatDuration(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  const hours = value.match(/^(\d+)\s*h(?:\s*(\d{1,2}))?(?:\s*(?:min|m)\b)?(.*)$/i)
  if (hours) {
    const [, h, minutes, rest] = hours
    return `${h} h${minutes ? ` ${minutes.padStart(2, '0')}` : ''}${rest}`.trim()
  }
  const minutes = value.match(/^(\d+)\s*(?:min|m)\b(.*)$/i)
  if (minutes) return `${minutes[1]} min${minutes[2]}`.trim()
  return value
}

export function formatPrice(
  value: number | undefined,
  currency?: string,
): string | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined
  return [value.toLocaleString('fr-FR'), currency].filter(Boolean).join(' ')
}

/** « Visite · 45 min » : ce qu'on lit d'un coup d'œil dans une liste. */
export function activitySummary(
  activity: Activity,
  { withType = true }: { withType?: boolean } = {},
): string {
  return [
    withType ? ACTIVITY_TYPE_LABELS[activity.type] : undefined,
    formatDuration(activity.duration),
    withType ? undefined : activity.openAt,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Nom de domaine d'un lien de réservation, pour dire « où » sans afficher l'URL. */
export function bookingHost(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^(www|secure|m)\./, '')
  } catch {
    return undefined
  }
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** « jeudi 14 mai » */
export function longDate(iso: string): string {
  return parseDayDate(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** « mer. 13 mai » */
export function shortDate(iso: string): string {
  return parseDayDate(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** « JEU » : l'abréviation du jour, sans point. */
export function weekdayShort(iso: string): string {
  return parseDayDate(iso)
    .toLocaleDateString('fr-FR', { weekday: 'short' })
    .replace('.', '')
    .toUpperCase()
}

export function dayOfMonth(iso: string): number {
  return parseDayDate(iso).getDate()
}

/** « JEUDI 14 MAI · JOUR 5 SUR 20 » */
export function dayEyebrow(day: DayItinerary, index: number, total: number) {
  return `${longDate(day.date)} · Jour ${index + 1} sur ${total}`.toUpperCase()
}

/**
 * Plage de dates compacte : « 12 mai », « 10 – 11 mai », « 30 avr. – 2 mai ».
 * `separator` sert aussi la flèche des en-têtes (« 10 → 29 mai »).
 */
export function formatDateRange(
  startIso: string,
  endIso: string,
  separator = '–',
): string {
  const start = parseDayDate(startIso)
  const end = parseDayDate(endIso)
  const sameDay = startOfDay(start) === startOfDay(end)
  const fullEnd = end.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  })
  if (sameDay) return fullEnd
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear()
  const head = sameMonth
    ? String(start.getDate())
    : start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `${head} ${separator} ${fullEnd}`
}

/** Où se situe une journée par rapport à aujourd'hui. */
export function dayTiming(
  iso: string,
  today: Date = new Date(),
): 'past' | 'today' | 'future' {
  const diff = daysBetween(isoOf(today), iso)
  if (diff < 0) return 'past'
  if (diff === 0) return 'today'
  return 'future'
}

function isoOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Prochaine étape ───────────────────────────────────────────────────────────

/** Dernière heure citée dans des horaires (« 08:30–17:00 » → 17 h). */
export function closingMinutes(openAt: string | undefined): number | null {
  if (!openAt) return null
  const times = [...openAt.matchAll(/(\d{1,2})[:h](\d{2})/g)]
  const last = times.at(-1)
  if (!last) return null
  return Number(last[1]) * 60 + Number(last[2])
}

/**
 * Prochaine étape d'une journée : la première activité ni faite ni annulée, et
 * pas déjà fermée si la journée est celle d'aujourd'hui. Une journée passée
 * n'a plus de prochaine étape.
 */
export function findNextActivity(
  day: DayItinerary,
  now: Date = new Date(),
): { activity: Activity; index: number } | null {
  const timing = dayTiming(day.date, now)
  if (timing === 'past') return null
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  for (let index = 0; index < day.activities.length; index++) {
    const activity = day.activities[index]
    const status = activity.status ?? 'planned'
    if (status !== 'planned') continue
    if (timing === 'today') {
      const closing = closingMinutes(activity.openAt)
      if (closing !== null && closing < minutesNow) continue
    }
    return { activity, index }
  }
  return null
}

// ── Hébergement du soir ───────────────────────────────────────────────────────

export interface Stay {
  accommodation: Accommodation
  /** Journée qui porte l'hébergement dans l'itinéraire (celle de l'arrivée). */
  ownerIndex: number
  /** Nuit en cours (1 pour la première), si les dates permettent de le dire. */
  night: number | null
  /** Nombre de nuits du séjour, si les dates permettent de le dire. */
  nights: number | null
}

function nightCount(accommodation: Accommodation): number | null {
  if (!isIsoDate(accommodation.checkIn) || !isIsoDate(accommodation.checkOut))
    return null
  const nights = daysBetween(accommodation.checkIn, accommodation.checkOut)
  return nights > 0 ? nights : null
}

/**
 * Où dort-on le soir d'une journée ? L'hébergement n'est rattaché qu'au jour
 * d'arrivée : les soirs suivants, on remonte jusqu'à lui tant que ses dates
 * couvrent la nuit. « Nuit 2 sur 3 » se calcule sur ces mêmes dates.
 */
export function findStay(
  itinerary: DayItinerary[],
  dayIndex: number,
): Stay | null {
  const day = itinerary[dayIndex]
  if (!day) return null

  const describe = (accommodation: Accommodation, ownerIndex: number) => {
    const nights = nightCount(accommodation)
    let night: number | null = null
    if (nights !== null && isIsoDate(accommodation.checkIn)) {
      const n = daysBetween(accommodation.checkIn, day.date) + 1
      night = n >= 1 && n <= nights ? n : null
    }
    return { accommodation, ownerIndex, night, nights }
  }

  if (day.accommodation) return describe(day.accommodation, dayIndex)

  for (let index = dayIndex - 1; index >= 0; index--) {
    const accommodation = itinerary[index].accommodation
    if (!accommodation) continue
    const stay = describe(accommodation, index)
    // Le dernier hébergement rencontré ne couvre plus cette nuit : on ne
    // remonte pas plus loin, le voyageur dort ailleurs (ou nulle part de connu).
    return stay.night !== null ? stay : null
  }
  return null
}

// ── Avant le départ ───────────────────────────────────────────────────────────

export type DepartureChecklistId =
  | 'saved'
  | 'offline'
  | 'notifications'
  | 'tickets'
  | 'share'
  | 'calendar'

export interface DepartureChecklistItem {
  id: DepartureChecklistId
  label: string
  detail?: string
  /** Vérifié sur l'appareil. Une étape invérifiable n'est jamais cochée. */
  done: boolean
}

export interface DepartureChecklistInput {
  dayCount: number
  /** Photos du voyage gardées pour le hors-ligne. */
  offline: { total: number; cached: number }
  notifications: 'granted' | 'denied' | 'default' | 'unsupported'
  /** Au moins un rappel est demandé dans les réglages. */
  remindersEnabled: boolean
  transports: Transport['type'][]
  /** Trajets qui ont un billet rangé dans Documents. */
  ticketsLinked: number
}

const TRANSPORT_MODE_WORDS: Record<Transport['type'], string> = {
  train: 'en train',
  plane: 'en avion',
  bus: 'en bus',
  car: 'en voiture',
}

/** « a », « a et b », « a, b et c » */
export function joinFrench(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`
}

function plural(count: number, word: string, pluralWord = `${word}s`) {
  return `${count} ${count > 1 ? pluralWord : word}`
}

/**
 * Préparer le départ : ce que l'app peut vérifier est coché pour de vrai
 * (voyage enregistré, photos gardées, rappels autorisés, billets rangés) ; le
 * reste (partager, calendrier) reste une action à faire, jamais une coche.
 * Les étapes accomplies passent en tête.
 */
export function buildDepartureChecklist(
  input: DepartureChecklistInput,
): DepartureChecklistItem[] {
  const items: DepartureChecklistItem[] = [
    {
      id: 'saved',
      label: 'Voyage enregistré',
      detail: 'Sur cet appareil',
      done: true,
    },
  ]

  const { total, cached } = input.offline
  items.push(
    total === 0 || cached >= total
      ? { id: 'offline', label: 'Disponible hors ligne', done: true }
      : {
          id: 'offline',
          label: 'Garder les photos hors ligne',
          detail: `${cached} sur ${plural(total, 'photo')} enregistrées`,
          done: false,
        },
  )

  if (input.notifications !== 'unsupported') {
    const done = input.notifications === 'granted' && input.remindersEnabled
    items.push(
      done
        ? { id: 'notifications', label: 'Rappels activés', done: true }
        : {
            id: 'notifications',
            label: 'Activer les rappels',
            detail:
              input.notifications === 'denied'
                ? 'Notifications refusées dans le navigateur'
                : 'La veille des trajets et chaque matin',
            done: false,
          },
    )
  }

  const transportCount = input.transports.length
  if (transportCount > 0) {
    const done = input.ticketsLinked >= transportCount
    const modes = joinFrench(
      [...new Set(input.transports)].map((type) => TRANSPORT_MODE_WORDS[type]),
    )
    items.push(
      done
        ? { id: 'tickets', label: 'Billets rangés', done: true }
        : {
            id: 'tickets',
            label: 'Ajouter les billets',
            detail: [
              `${plural(transportCount, 'trajet')} ${modes}`,
              input.ticketsLinked > 0
                ? `${input.ticketsLinked} déjà rangé${input.ticketsLinked > 1 ? 's' : ''}`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
            done: false,
          },
    )
  }

  items.push(
    {
      id: 'share',
      label: 'Partager avec votre compagnon de voyage',
      detail: 'Code, QR code ou lien',
      done: false,
    },
    {
      id: 'calendar',
      label: 'Ajouter au calendrier',
      detail: `Les ${plural(input.dayCount, 'jour')} et les horaires des trajets`,
      done: false,
    },
  )

  return [...items.filter((i) => i.done), ...items.filter((i) => !i.done)]
}

/**
 * Billets rangés : un document de ce voyage, rattaché au trajet d'une journée
 * qui en a un. Chaque trajet compte une fois, même avec plusieurs documents.
 */
export function countLinkedTickets(
  itinerary: DayItinerary[],
  documents: { tripId?: string; dayId?: string; linkedTo?: string }[],
  tripId: string | undefined,
): number {
  const transportDays = new Set(
    itinerary.filter((day) => day.transport).map((day) => day.id),
  )
  const covered = new Set<string>()
  for (const doc of documents) {
    if (doc.tripId && tripId && doc.tripId !== tripId) continue
    if (doc.linkedTo !== 'transport' || !doc.dayId) continue
    if (transportDays.has(doc.dayId)) covered.add(doc.dayId)
  }
  return covered.size
}

export interface PackingItem {
  text: string
  /** « Jour 5 · Pékin », « Jours 11 à 13 · Zhangjiajie » */
  context: string
}

function dayListLabel(days: DayItinerary[]): string {
  const numbers = days.map((day) => day.dayNumber)
  const cities = [...new Set(days.map((day) => day.city))]
  const city = cities.length === 1 ? ` · ${cities[0]}` : ''
  if (numbers.length === 1) return `Jour ${numbers[0]}${city}`
  const consecutive = numbers.every(
    (n, i) => i === 0 || n === numbers[i - 1] + 1,
  )
  if (consecutive)
    return `Jours ${numbers[0]} à ${numbers.at(-1)}${city}`
  return `Jours ${joinFrench(numbers.map(String))}${city}`
}

/**
 * À mettre dans les bagages : les conseils « bagages » de tout le programme,
 * sans doublon, avec les journées qui les justifient. Sans aucun conseil de
 * bagages, on se rabat sur les conseils du premier jour — rien n'est inventé.
 */
export function collectPackingTips(itinerary: DayItinerary[]): {
  items: PackingItem[]
  source: 'packing' | 'first-day-tips' | 'none'
} {
  const byText = new Map<string, { text: string; days: DayItinerary[] }>()
  for (const day of itinerary) {
    for (const tip of day.packingTips ?? []) {
      const text = tip.trim()
      if (!text) continue
      const key = text.toLocaleLowerCase('fr-FR')
      const entry = byText.get(key)
      if (entry) {
        if (!entry.days.includes(day)) entry.days.push(day)
      } else byText.set(key, { text, days: [day] })
    }
  }
  if (byText.size > 0) {
    return {
      source: 'packing',
      items: [...byText.values()].map(({ text, days }) => ({
        text,
        context: dayListLabel(days),
      })),
    }
  }
  const first = itinerary[0]
  const tips = (first?.tips ?? []).map((tip) => tip.trim()).filter(Boolean)
  if (first && tips.length > 0) {
    return {
      source: 'first-day-tips',
      items: tips.map((text) => ({ text, context: dayListLabel([first]) })),
    }
  }
  return { source: 'none', items: [] }
}

// ── Après le voyage ───────────────────────────────────────────────────────────

/** « 14 km » → 14 ; « 6,5 km » → 6.5 ; tout le reste est ignoré. */
export function parseKilometers(raw: string | undefined): number | null {
  const match = raw?.match(/(\d+(?:[.,]\d+)?)\s*km/i)
  return match ? Number(match[1].replace(',', '.')) : null
}

export function tripRecap(itinerary: DayItinerary[]) {
  const activities = itinerary.flatMap((day) => day.activities)
  const kilometers = itinerary
    .map((day) => parseKilometers(day.walkingDistance))
    .filter((km): km is number => km !== null)
  return {
    days: itinerary.length,
    cities: [...new Set(itinerary.map((day) => day.city).filter(Boolean))],
    activitiesDone: activities.filter((a) => a.status === 'done').length,
    activities: activities.length,
    walkedKm:
      kilometers.length > 0
        ? Math.round(kilometers.reduce((sum, km) => sum + km, 0))
        : null,
  }
}

// ── Programme ─────────────────────────────────────────────────────────────────

export type ProgramRow =
  | { kind: 'city'; key: string; city: string; range: string }
  | { kind: 'day'; key: string; index: number; day: DayItinerary }
  | { kind: 'move'; key: string; label: string; dayIndex: number }

function normalizePlace(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase()
    .trim()
}

function samePlace(a: string | undefined, b: string | undefined): boolean {
  const x = normalizePlace(a)
  const y = normalizePlace(b)
  return Boolean(x && y && (x.includes(y) || y.includes(x)))
}

/** « PKX Beijing Daxing Intl. » → code PKX et nom lisible. */
export function splitPlace(raw: string | undefined): {
  code?: string
  name: string
} {
  const value = raw?.trim() ?? ''
  const match = value.match(/^([A-Z]{3})\s+(.+)$/)
  if (match) return { code: match[1], name: match[2] }
  return { name: value }
}

/** « Vol · Beijing Daxing Intl. → Xi’an Xianyang Intl. » */
export function transportLabel(transport: Transport): string {
  const from = splitPlace(transport.from).name
  const to = splitPlace(transport.to).name
  const route = from && to ? `${from} → ${to}` : from || to
  return [TRANSPORT_TYPE_LABELS[transport.type], route]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Programme groupé par ville, trajets intercalés. Un trajet est rangé sur sa
 * journée de départ : il s'affiche après elle. S'il est porté par la première
 * journée d'une étape et part d'ailleurs (jour d'arrivée), il passe avant
 * l'en-tête de la ville.
 */
export function buildProgramRows(itinerary: DayItinerary[]): ProgramRow[] {
  const rows: ProgramRow[] = []
  let start = 0
  while (start < itinerary.length) {
    let end = start
    while (
      end + 1 < itinerary.length &&
      itinerary[end + 1].city === itinerary[start].city
    )
      end++

    const first = itinerary[start]
    const arrivalMove =
      first.transport && !samePlace(first.transport.from, first.city)
    if (arrivalMove && first.transport) {
      rows.push({
        kind: 'move',
        key: `move-${first.id}`,
        label: transportLabel(first.transport),
        dayIndex: start,
      })
    }
    rows.push({
      kind: 'city',
      key: `city-${start}`,
      city: first.city,
      range: formatDateRange(first.date, itinerary[end].date),
    })
    for (let index = start; index <= end; index++) {
      const day = itinerary[index]
      rows.push({ kind: 'day', key: day.id, index, day })
      if (day.transport && !(index === start && arrivalMove)) {
        rows.push({
          kind: 'move',
          key: `move-${day.id}`,
          label: transportLabel(day.transport),
          dayIndex: index,
        })
      }
    }
    start = end + 1
  }
  return rows
}

/** Étapes du voyage : une par suite de journées dans la même ville. */
export function cityStops(itinerary: DayItinerary[]) {
  const stops: {
    city: string
    startIndex: number
    endIndex: number
    coordinates: [number, number]
  }[] = []
  itinerary.forEach((day, index) => {
    const last = stops.at(-1)
    if (last && last.city === day.city) last.endIndex = index
    else
      stops.push({
        city: day.city,
        startIndex: index,
        endIndex: index,
        coordinates: day.coordinates,
      })
  })
  return stops
}

// ── Réordonnancement ──────────────────────────────────────────────────────────

/** Déplace un élément d'une position à une autre, sans muter la liste. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list]
  const target = Math.max(0, Math.min(list.length - 1, to))
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/**
 * Position d'arrivée d'un élément glissé : le nombre d'autres éléments dont le
 * milieu est au-dessus du milieu de l'élément glissé.
 */
export function reorderTarget(
  midpoints: readonly number[],
  from: number,
  draggedCenter: number,
): number {
  let target = 0
  midpoints.forEach((mid, index) => {
    if (index !== from && mid < draggedCenter) target++
  })
  return target
}

/** Place une activité à une position donnée de la journée. */
export function moveActivityTo(
  day: DayItinerary,
  activityId: string,
  target: number,
): DayItinerary {
  const from = day.activities.findIndex((a) => a.id === activityId)
  if (from === -1 || from === target) return day
  return { ...day, activities: moveItem(day.activities, from, target) }
}

// ── Itinéraires ───────────────────────────────────────────────────────────────

export interface Destination {
  coordinates?: readonly [number, number]
  address?: string
  name?: string
}

/** iPhone, iPad (même déguisé en Mac) : Plans d'Apple plutôt que Google Maps. */
export function isApplePlatform(userAgent: string, maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

/**
 * Lien d'itinéraire vers un lieu : les coordonnées si on les a (le plus
 * précis), sinon l'adresse, sinon le nom. `null` quand rien ne localise.
 */
export function directionsUrl(
  target: Destination,
  apple = false,
): string | null {
  const destination = target.coordinates
    ? `${target.coordinates[0]},${target.coordinates[1]}`
    : target.address?.trim() || target.name?.trim()
  if (!destination) return null
  return apple
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
    : mapsDirectionsUrl(destination)
}

// ── Transport ─────────────────────────────────────────────────────────────────

/** Numéro de vol ou de train repéré dans le descriptif (« CZ8823 », « G195 »). */
export function transportNumber(transport: Transport): string | undefined {
  const details = transport.details ?? ''
  for (const match of details.matchAll(/\b([A-Z0-9]{1,2}\d{2,4})\b/g)) {
    if (/[A-Z]/.test(match[1])) return match[1]
  }
  return undefined
}

/** Ce que le descriptif dit en plus du numéro (« Meal · Boeing 737-900ER »). */
export function transportExtras(transport: Transport): string[] {
  const details = transport.details ?? ''
  if (!details.includes('|')) return []
  return details
    .split('|')
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean)
}

// ── À goûter ──────────────────────────────────────────────────────────────────

const CJK = /[぀-ヿ㐀-鿿가-힯]/

/**
 * « Canard laqué de Pékin (北京烤鸭) — chez Quanjude » → le nom, l'écriture
 * locale à montrer au serveur, et la précision.
 */
export function parseFood(item: string): {
  name: string
  native?: string
  detail?: string
} {
  const [head, ...rest] = item.split(/\s[—–-]\s/)
  const detail = rest.join(' — ').trim() || undefined
  const native = head.match(/\(([^)]*)\)/)
  if (native && CJK.test(native[1])) {
    return {
      name: head.replace(native[0], '').replace(/\s+/g, ' ').trim(),
      native: native[1].trim(),
      detail,
    }
  }
  return { name: head.trim(), detail }
}
