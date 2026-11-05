import type { DayItinerary } from '@/lib/itinerary-data'
import { fromDayNumber, localIsoDate, toDayNumber } from '@/lib/iso-date'

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

/**
 * Décale toute chaîne `AAAA-MM-JJ`, où qu'elle soit (journée, hôtel…).
 *
 * Volontairement plus simple que `shiftDatesDeep` (`iso-date.ts`) : la démo n'a
 * que des dates nues, et ce parcours reste celui que ses tests ont figé (pas de
 * date-heure, pas de contrôle du calendrier).
 */
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
    toDayNumber(localIsoDate(today)) - (DEMO_TODAY_DAY - 1) - toDayNumber(first)
  return shiftDates([...itinerary], offset)
}
