/**
 * Opérations d'édition de l'itinéraire.
 *
 * Fonctions pures : elles ne touchent ni à React ni à IndexedDB, la
 * persistance reste dans `useTripData`, l'affichage dans les composants.
 * Toutes retournent de nouvelles structures (jamais de mutation en place).
 */

import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from './itinerary-data'

/** Identifiant unique et lisible pour une entité créée depuis l'interface. */
export function createEntityId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}${random}`
}

/** Remplace un jour dans l'itinéraire (par id). L'ordre est conservé. */
export function replaceDay(
  itinerary: DayItinerary[],
  day: DayItinerary,
): DayItinerary[] {
  return itinerary.map((current) => (current.id === day.id ? day : current))
}

/** Ajoute l'activité si son id est inconnu, la remplace sinon. */
export function upsertActivity(
  day: DayItinerary,
  activity: Activity,
): DayItinerary {
  const exists = day.activities.some((current) => current.id === activity.id)

  return {
    ...day,
    activities: exists
      ? day.activities.map((current) =>
          current.id === activity.id ? activity : current,
        )
      : [...day.activities, activity],
  }
}

/** Retire une activité du jour. Sans correspondance, le jour est inchangé. */
export function removeActivity(
  day: DayItinerary,
  activityId: string,
): DayItinerary {
  return {
    ...day,
    activities: day.activities.filter((current) => current.id !== activityId),
  }
}

/**
 * Déplace une activité de `offset` positions (négatif = vers le haut).
 * Un déplacement hors des bornes laisse le jour inchangé.
 */
export function moveActivity(
  day: DayItinerary,
  activityId: string,
  offset: number,
): DayItinerary {
  const index = day.activities.findIndex((current) => current.id === activityId)
  if (index === -1) return day

  const target = index + offset
  if (target < 0 || target >= day.activities.length) return day

  const activities = [...day.activities]
  const [moved] = activities.splice(index, 1)
  activities.splice(target, 0, moved)

  return { ...day, activities }
}

/** Statuts d'une activité, dans l'ordre du cycle proposé par le programme. */
export const ACTIVITY_STATUS_CYCLE = ['planned', 'done', 'skipped'] as const

export type ActivityStatus = (typeof ACTIVITY_STATUS_CYCLE)[number]

/**
 * Statut suivant dans le cycle « prévu → fait → annulé → prévu ».
 * Un statut absent est traité comme `planned`.
 */
export function nextActivityStatus(
  status: ActivityStatus | undefined,
): ActivityStatus {
  const index = ACTIVITY_STATUS_CYCLE.indexOf(status ?? 'planned')
  return ACTIVITY_STATUS_CYCLE[(index + 1) % ACTIVITY_STATUS_CYCLE.length]
}

/**
 * Change le statut d'une activité sans toucher au reste de la journée.
 * Sans correspondance d'id, le jour est retourné inchangé.
 */
export function setActivityStatus(
  day: DayItinerary,
  activityId: string,
  status: ActivityStatus,
): DayItinerary {
  if (!day.activities.some((current) => current.id === activityId)) return day

  return {
    ...day,
    activities: day.activities.map((current) =>
      current.id === activityId ? { ...current, status } : current,
    ),
  }
}

/**
 * Listes de textes libres d'une journée : points forts, plats à goûter,
 * bagages et conseils. Elles se manipulent toutes de la même façon.
 */
export type DayTextList =
  | 'highlights'
  | 'foodRecommendations'
  | 'packingTips'
  | 'tips'

/**
 * Retire une entrée d'une de ces listes. Un index hors bornes, ou une liste
 * absente, laisse le jour inchangé.
 */
export function removeDayTextListItem(
  day: DayItinerary,
  list: DayTextList,
  index: number,
): DayItinerary {
  const current = day[list]
  if (!current || index < 0 || index >= current.length) return day

  return { ...day, [list]: current.filter((_, position) => position !== index) }
}

/** Définit (ou retire, avec `undefined`) le transport du jour. */
export function setTransport(
  day: DayItinerary,
  transport: Transport | undefined,
): DayItinerary {
  if (!transport) {
    const { transport: _removed, ...rest } = day
    return rest
  }

  return { ...day, transport }
}

/** Définit (ou retire, avec `undefined`) l'hébergement du jour. */
export function setAccommodation(
  day: DayItinerary,
  accommodation: Accommodation | undefined,
): DayItinerary {
  if (!accommodation) {
    const { accommodation: _removed, ...rest } = day
    return rest
  }

  return { ...day, accommodation }
}

/** Activité vierge, prête à être complétée dans le formulaire d'édition. */
export function createEmptyActivity(): Activity {
  return {
    id: createEntityId('act'),
    name: '',
    type: 'visit',
    status: 'planned',
    source: 'user',
  }
}

/** Transport vierge, prêt à être complété dans le formulaire d'édition. */
export function createEmptyTransport(): Transport {
  return {
    id: createEntityId('tr'),
    type: 'train',
    status: 'planned',
    source: 'user',
  }
}

/**
 * Hébergement vierge. Les dates de séjour sont pré-remplies avec la date du
 * jour courant (et le lendemain) pour éviter une saisie inutile.
 */
export function createEmptyAccommodation(day: DayItinerary): Accommodation {
  return {
    id: createEntityId('acc'),
    name: '',
    address: '',
    bookingUrl: '',
    checkIn: day.date,
    checkOut: addDays(day.date, 1),
    status: 'planned',
    source: 'user',
  }
}

/** Décale une date ISO (`YYYY-MM-DD`) de `amount` jours. */
function addDays(date: string, amount: number): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date

  parsed.setDate(parsed.getDate() + amount)
  return parsed.toISOString().slice(0, 10)
}
