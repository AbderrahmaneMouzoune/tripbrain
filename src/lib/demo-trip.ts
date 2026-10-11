import type { DayItinerary } from '@/lib/itinerary-data'

/**
 * Le voyage d'exemple, recalé sur la date du jour.
 *
 * Ses dates sont écrites en dur (mai 2026). Passé ce mois-là, la démo
 * s'ouvrait sur « Voyage terminé » : rien de la vue Aujourd'hui, ni la
 * prochaine étape, ni la frise des jours — c'est pourtant ce qu'elle doit
 * montrer, dans l'app comme dans la maquette du site (`?demo=true`).
 * Toutes les dates sont décalées du même nombre de jours, pour que le jour
 * `DEMO_TODAY_DAY` tombe aujourd'hui.
 */

/** Jour du voyage montré comme « aujourd'hui » : il y a un avant et un après. */
export const DEMO_TODAY_DAY = 3

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

/** Date ISO → jours depuis l'époque, sans fuseau horaire. */
function toDayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

function fromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Décale toute chaîne `AAAA-MM-JJ`, où qu'elle soit (journée, hôtel…). */
function shiftDates<T>(value: T, offset: number): T {
  if (typeof value === 'string') {
    return (
      ISO_DATE.test(value) ? fromDayNumber(toDayNumber(value) + offset) : value
    ) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => shiftDates(item, offset)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shiftDates(item, offset),
      ]),
    ) as T
  }
  return value
}

export function demoItineraryFor(
  itinerary: readonly DayItinerary[],
  today: Date = new Date(),
): DayItinerary[] {
  const first = itinerary[0]?.date
  if (!first) return [...itinerary]
  const offset =
    toDayNumber(localIso(today)) - (DEMO_TODAY_DAY - 1) - toDayNumber(first)
  return shiftDates([...itinerary], offset)
}
