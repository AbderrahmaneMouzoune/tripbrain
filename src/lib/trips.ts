/**
 * Les voyages enregistrés sur l'appareil.
 *
 * L'application a longtemps tenu un seul voyage : en importer un autre
 * écrasait le premier. Elle en garde désormais plusieurs, dont un seul est
 * « actif » — celui qu'on consulte. Ce module ne contient que la logique pure
 * (titres, dates, statut) ; la persistance vit dans `trips-db.ts` et l'état
 * React dans `useTripData`.
 */

import type { DayItinerary } from '@/lib/itinerary-data'

/** D'où vient un voyage : sert l'affichage (« Généré il y a 2 jours ») et la mesure. */
export type TripSource =
  | 'demo'
  | 'json'
  | 'xlsx'
  | 'csv'
  | 'share'
  | 'generator'
  | 'legacy'

export interface StoredTrip {
  id: string
  title: string
  itinerary: DayItinerary[]
  source: TripSource
  createdAt: number
  updatedAt: number
  /** Voyage d'exemple : ses documents de démo partent avec lui. */
  isDemo?: boolean
}

/** Ce qu'il faut pour lister les voyages, sans traîner tout l'itinéraire. */
export interface TripSummary {
  id: string
  title: string
  source: TripSource
  createdAt: number
  updatedAt: number
  isDemo: boolean
  startDate: string | null
  endDate: string | null
  dayCount: number
  cityCount: number
  cities: string[]
  status: TripStatus
}

export type TripStatus = 'upcoming' | 'ongoing' | 'past'

export function createTripId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `trip-${crypto.randomUUID()}`
  }
  return `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Les villes dans l'ordre du voyage, sans répéter une étape consécutive. */
export function tripCities(itinerary: DayItinerary[]): string[] {
  const seen = new Set<string>()
  const cities: string[] = []
  for (const day of itinerary) {
    const city = day.city?.trim()
    if (!city || seen.has(city)) continue
    seen.add(city)
    cities.push(city)
  }
  return cities
}

/**
 * Titre par défaut quand l'import n'en fournit pas : les étapes elles-mêmes.
 * « Lisbonne », « Tokyo et Kyoto », « Shanghai, Qingdao et 5 autres villes ».
 */
export function deriveTripTitle(itinerary: DayItinerary[]): string {
  const cities = tripCities(itinerary)
  if (cities.length === 0) return 'Mon voyage'
  if (cities.length === 1) return cities[0]
  if (cities.length === 2) return `${cities[0]} et ${cities[1]}`
  if (cities.length === 3) return `${cities[0]}, ${cities[1]} et ${cities[2]}`
  const others = cities.length - 2
  return `${cities[0]}, ${cities[1]} et ${others} autres villes`
}

function startOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/** Date locale d'une journée au format ISO, lue sans décalage de fuseau. */
export function parseDayDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return new Date(iso)
  return new Date(year, month - 1, day)
}

export function tripStatus(
  itinerary: DayItinerary[],
  today: Date = new Date(),
): TripStatus {
  if (itinerary.length === 0) return 'upcoming'
  const now = startOfDay(today)
  const start = startOfDay(parseDayDate(itinerary[0].date))
  const end = startOfDay(parseDayDate(itinerary[itinerary.length - 1].date))
  if (now < start) return 'upcoming'
  if (now > end) return 'past'
  return 'ongoing'
}

export function summarizeTrip(
  trip: StoredTrip,
  today: Date = new Date(),
): TripSummary {
  const cities = tripCities(trip.itinerary)
  return {
    id: trip.id,
    title: trip.title,
    source: trip.source,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    isDemo: Boolean(trip.isDemo),
    startDate: trip.itinerary[0]?.date ?? null,
    endDate: trip.itinerary[trip.itinerary.length - 1]?.date ?? null,
    dayCount: trip.itinerary.length,
    cityCount: cities.length,
    cities,
    status: tripStatus(trip.itinerary, today),
  }
}

/**
 * Ordre d'affichage de « Mes voyages » : en cours d'abord, puis à venir du plus
 * proche au plus lointain, puis passés du plus récent au plus ancien.
 */
export function sortTripSummaries(trips: TripSummary[]): TripSummary[] {
  const rank: Record<TripStatus, number> = { ongoing: 0, upcoming: 1, past: 2 }
  return [...trips].sort((a, b) => {
    if (rank[a.status] !== rank[b.status])
      return rank[a.status] - rank[b.status]
    const aStart = a.startDate ?? ''
    const bStart = b.startDate ?? ''
    if (a.status === 'past') return bStart.localeCompare(aStart)
    return aStart.localeCompare(bStart)
  })
}

/**
 * Le voyage à ouvrir quand rien n'est choisi : celui en cours, sinon le
 * prochain, sinon le dernier passé.
 */
export function pickDefaultTrip(trips: TripSummary[]): string | null {
  return sortTripSummaries(trips)[0]?.id ?? null
}

/**
 * Index de la journée à afficher à l'ouverture : aujourd'hui pendant le
 * voyage, la première avant, la dernière après.
 */
export function currentDayIndex(
  itinerary: DayItinerary[],
  today: Date = new Date(),
): number {
  if (itinerary.length === 0) return 0
  const now = startOfDay(today)
  const index = itinerary.findIndex(
    (day) => startOfDay(parseDayDate(day.date)) === now,
  )
  if (index >= 0) return index
  const end = startOfDay(parseDayDate(itinerary[itinerary.length - 1].date))
  return now > end ? itinerary.length - 1 : 0
}

/** Jours entiers entre aujourd'hui et une date (négatif si elle est passée). */
export function daysUntil(iso: string, today: Date = new Date()): number {
  return Math.round(
    (startOfDay(parseDayDate(iso)) - startOfDay(today)) / 86_400_000,
  )
}
