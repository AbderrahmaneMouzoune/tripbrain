/**
 * Logique pure du menu « Voyage » et de « Mes voyages » : regroupement des
 * voyages, libellés de dates et de provenance, mini-tracé des étapes.
 *
 * Rien ici ne touche au DOM ni à React : tout se teste à part, et les écrans
 * ne font qu'afficher ce que ces fonctions décident.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import {
  daysUntil,
  parseDayDate,
  type TripSource,
  type TripStatus,
  type TripSummary,
} from '@/lib/trips'

// ── Regroupement ──────────────────────────────────────────────────────────────

export interface TripSection {
  status: TripStatus
  label: string
  trips: TripSummary[]
}

const SECTION_LABELS: Record<TripStatus, string> = {
  ongoing: 'En cours',
  upcoming: 'À venir',
  past: 'Passés',
}

/**
 * Les voyages rangés en sections « En cours », « À venir », « Passés », dans
 * cet ordre, sans section vide. L'ordre interne reste celui reçu : la liste
 * de `useTrip().trips` est déjà triée.
 */
export function groupTripsByStatus(trips: TripSummary[]): TripSection[] {
  const order: TripStatus[] = ['ongoing', 'upcoming', 'past']
  return order
    .map((status) => ({
      status,
      label: SECTION_LABELS[status],
      trips: trips.filter((trip) => trip.status === status),
    }))
    .filter((section) => section.trips.length > 0)
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const dayMonth = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
})
const monthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
})
const weekdayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })

/** « 10 → 29 mai », « 28 mai → 3 juin », « 28 déc. 2026 → 3 janv. 2027 ». */
export function formatTripRange(
  startDate: string | null,
  endDate: string | null,
  { withYear = false }: { withYear?: boolean } = {},
): string | null {
  if (!startDate) return null
  const start = parseDayDate(startDate)
  const end = parseDayDate(endDate ?? startDate)
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const year = withYear || !sameYear ? ` ${end.getFullYear()}` : ''

  if (start.getTime() === end.getTime()) {
    return `${dayMonth.format(start)}${year}`
  }
  if (sameMonth) {
    return `${start.getDate()} → ${dayMonth.format(end)}${year}`
  }
  const startYear = sameYear ? '' : ` ${start.getFullYear()}`
  return `${dayMonth.format(start)}${startYear} → ${dayMonth.format(end)}${year}`
}

/** « oct. 2025 » : assez pour situer un voyage passé. */
export function formatMonthYear(date: string | null): string | null {
  return date ? monthYear.format(parseDayDate(date)) : null
}

/** « JEU » : jour de la semaine abrégé, sans point. */
export function formatWeekdayShort(date: string): string {
  return weekdayShort.format(parseDayDate(date)).replace('.', '').toUpperCase()
}

/** « il y a 3 jours », « hier », « il y a 2 mois ». */
export function formatRelativeDays(
  timestamp: number,
  now: Date = new Date(),
): string {
  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.max(
    0,
    Math.round((startOf(now) - startOf(new Date(timestamp))) / 86_400_000),
  )
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} jours`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  const years = Math.floor(days / 365)
  return `il y a ${years} an${years > 1 ? 's' : ''}`
}

/** Le verbe dit d'où vient le voyage ; sans provenance connue, rien. */
const ORIGIN_VERBS: Partial<Record<TripSource, string>> = {
  generator: 'Généré',
  share: 'Reçu',
  json: 'Importé',
  xlsx: 'Importé',
  csv: 'Importé',
}

/**
 * « Généré il y a 2 jours », « Reçu hier », « Voyage d’exemple ». `null` pour
 * un voyage d'avant les voyages multiples : sa date de création n'est que
 * celle de la migration, elle ne dirait rien de vrai.
 */
export function formatTripOrigin(
  source: TripSource,
  createdAt: number,
  now: Date = new Date(),
): string | null {
  if (source === 'demo') return 'Voyage d’exemple'
  const verb = ORIGIN_VERBS[source]
  if (!verb || !createdAt) return null
  return `${verb} ${formatRelativeDays(createdAt, now)}`
}

/** « 1 jour », « 5 jours » : les pluriels du menu. */
export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count > 1 ? (pluralForm ?? `${singular}s`) : singular}`
}

// ── Avancement ────────────────────────────────────────────────────────────────

export interface TripMoment {
  /** Sourcil de la carte du voyage : « En cours · jour 5 sur 20 ». */
  headline: string
  /** Part du voyage écoulée (0 à 1), seulement pendant le voyage. */
  progress: number | null
  /** Numéro du jour en cours (1…n), pendant le voyage. */
  dayNumber: number | null
}

/** Où en est-on du voyage : sert le menu et la carte du voyage en cours. */
export function describeTripMoment(
  trip: Pick<TripSummary, 'status' | 'startDate' | 'endDate' | 'dayCount'>,
  today: Date = new Date(),
): TripMoment {
  if (trip.status === 'ongoing' && trip.startDate && trip.dayCount > 0) {
    const dayNumber = Math.min(
      trip.dayCount,
      Math.max(1, 1 - daysUntil(trip.startDate, today)),
    )
    return {
      headline: `En cours · jour ${dayNumber} sur ${trip.dayCount}`,
      progress: dayNumber / trip.dayCount,
      dayNumber,
    }
  }
  if (trip.status === 'upcoming' && trip.startDate) {
    const days = daysUntil(trip.startDate, today)
    return {
      headline:
        days <= 1
          ? days === 1
            ? 'À venir · demain'
            : 'À venir'
          : `À venir · dans ${days} jours`,
      progress: null,
      dayNumber: null,
    }
  }
  return {
    headline: trip.status === 'past' ? 'Terminé' : 'À venir',
    progress: null,
    dayNumber: null,
  }
}

/** Nombre de journées avec un trajet. */
export function countTransports(itinerary: DayItinerary[]): number {
  return itinerary.filter((day) => day.transport).length
}

/** Nombre d'hébergements distincts (un même hôtel sur trois nuits compte une fois). */
export function countAccommodations(itinerary: DayItinerary[]): number {
  const keys = new Set<string>()
  for (const day of itinerary) {
    const stay = day.accommodation
    if (!stay) continue
    keys.add(stay.name?.trim().toLowerCase() || stay.id)
  }
  return keys.size
}

// ── Mini-tracé ────────────────────────────────────────────────────────────────

export interface SketchPoint {
  x: number
  y: number
}

export interface RouteSketch {
  points: SketchPoint[]
  /** Chemin SVG reliant les étapes dans l'ordre (`M … L …`). */
  path: string
  /**
   * Pour chaque coordonnée reçue, l'index du point qui la représente (`-1`
   * si elle était inutilisable) : sert à retrouver l'étape du jour.
   */
  pointIndexByInput: number[]
}

function isUsableCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    // (0, 0) est la valeur par défaut d'un import incomplet, pas une étape.
    !(value[0] === 0 && value[1] === 0) &&
    Math.abs(value[0]) <= 90 &&
    Math.abs(value[1]) <= 180
  )
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * Projette les étapes du voyage dans une boîte `width × height` : une
 * équirectangulaire corrigée par la latitude moyenne suffit à garder l'allure
 * du parcours à cette échelle. Les proportions sont conservées et le tracé
 * centré ; deux jours de suite au même endroit ne font qu'un point.
 */
export function buildRouteSketch(
  coordinates: Array<[number, number] | undefined>,
  {
    width,
    height,
    padding = 8,
  }: { width: number; height: number; padding?: number },
): RouteSketch | null {
  const stops: [number, number][] = []
  const pointIndexByInput: number[] = []
  for (const coordinate of coordinates) {
    if (!isUsableCoordinate(coordinate)) {
      pointIndexByInput.push(stops.length > 0 ? stops.length - 1 : -1)
      continue
    }
    const last = stops[stops.length - 1]
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) {
      stops.push(coordinate)
    }
    pointIndexByInput.push(stops.length - 1)
  }
  if (stops.length === 0) return null

  const meanLat = stops.reduce((sum, [lat]) => sum + lat, 0) / stops.length
  const lngScale = Math.cos((meanLat * Math.PI) / 180)
  const projected = stops.map(([lat, lng]) => ({ x: lng * lngScale, y: -lat }))

  const xs = projected.map((p) => p.x)
  const ys = projected.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX
  const spanY = Math.max(...ys) - minY
  const innerW = Math.max(0, width - padding * 2)
  const innerH = Math.max(0, height - padding * 2)
  const span = Math.max(spanX / (innerW || 1), spanY / (innerH || 1))
  const scale = span > 0 ? 1 / span : 0
  const offsetX = padding + (innerW - spanX * scale) / 2
  const offsetY = padding + (innerH - spanY * scale) / 2

  const points = projected.map((p) => ({
    x: round(offsetX + (p.x - minX) * scale),
    y: round(offsetY + (p.y - minY) * scale),
  }))
  const path = points
    .map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
    .join(' ')
  return { points, path, pointIndexByInput }
}

/** Ville du jour pour un voyage en cours, d'après son itinéraire complet. */
export function cityOfDay(
  itinerary: DayItinerary[],
  dayNumber: number | null,
): string | null {
  if (!dayNumber) return null
  return itinerary[dayNumber - 1]?.city?.trim() || null
}
