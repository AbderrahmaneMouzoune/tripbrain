/**
 * Rappels locaux : la veille d'un trajet, le programme du matin, le check-in.
 *
 * Limite assumée : TripBrain n'a ni application native ni serveur de
 * notifications push. Les rappels sont donc programmés par la page elle-même
 * (`setTimeout`) et ne partent que si l'application est ouverte, ou en
 * arrière-plan depuis peu (le système finit par suspendre l'onglet). À
 * l'ouverture, rien n'est rattrapé, sauf le rappel « Demain : … » de la veille
 * au soir s'il date de moins de trois heures : c'est le seul qui sert encore.
 *
 * Les heures sont celles de l'itinéraire, lues comme heures locales de
 * l'appareil : pendant le voyage, le téléphone est à l'heure de la destination.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import type { Preferences } from '@/lib/preferences'
import { parseDayDate } from '@/lib/trips'
import { transportLabel } from '@/lib/document-organize'

export type ReminderKind = 'transport-eve' | 'morning' | 'check-in'

export interface Reminder {
  /**
   * Stable d'un calcul à l'autre : sert à ne jamais envoyer deux fois. Préfixé
   * par le voyage, car les identifiants de journée (`day-1`…) ne sont uniques
   * qu'à l'intérieur d'un voyage.
   */
  id: string
  tripId: string
  kind: ReminderKind
  /** Horodatage (ms) de l'envoi prévu, dans le fuseau du calcul. */
  at: number
  /**
   * Même échéance en heure murale, sans fuseau (`AAAA-MM-JJTHH:mm:00`) : c'est
   * elle que l'app native planifie, dans le fuseau où se trouve le téléphone.
   */
  localAt: string
  dayIndex: number
  title: string
  body: string
}

/** Heure d'envoi de chaque rappel (heure locale). */
export const REMINDER_TIMES = {
  transportEve: { hour: 20, minute: 0 },
  morning: { hour: 8, minute: 0 },
  /** Heure habituelle d'ouverture des chambres. */
  checkIn: { hour: 14, minute: 0 },
} as const

/** Un rappel de veille manqué reste utile pendant ce délai après son heure. */
export const MISSED_EVE_GRACE_MS = 3 * 60 * 60 * 1000

function at(iso: string, hour: number, minute: number, dayOffset = 0): number {
  const date = parseDayDate(iso)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date.getTime()
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `AAAA-MM-JJTHH:mm:00` du jour `iso` décalé de `dayOffset`, sans passer par
 * le fuseau de l'appareil : une heure murale. Le calcul du jour passe par
 * l'UTC, où un jour dure toujours 24 h (pas de changement d'heure).
 */
export function localDateTime(
  iso: string,
  hour: number,
  minute: number,
  dayOffset = 0,
): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const match = iso.match(ISO_DAY)
  const day = match
    ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3] + dayOffset))
    : null
  if (!day || Number.isNaN(day.getTime())) {
    // Date libre : on retombe sur la lecture locale de `parseDayDate`.
    const local = new Date(at(iso, hour, minute, dayOffset))
    return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(hour)}:${pad(minute)}:00`
  }
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${pad(hour)}:${pad(minute)}:00`
}

/**
 * Chemin ouvert au toucher du rappel : le bon voyage, la bonne journée et
 * l'écran qui va avec (lu par `NativeNavigationHost`).
 */
export function reminderPath(
  reminder: Pick<Reminder, 'tripId' | 'dayIndex' | 'kind'>,
): string {
  const params = new URLSearchParams({
    trip: reminder.tripId,
    day: String(reminder.dayIndex),
    open: reminder.kind,
  })
  return `/?${params.toString()}`
}

/** Rappel tel que l'app native le planifie (voir `syncNativeReminders`). */
export interface NativeReminderPayload {
  id: string
  title: string
  body: string
  at: string
  path: string
}

/**
 * Rappels à confier au téléphone : seulement ceux à venir, en heure murale.
 * « À venir » se juge sur l'heure murale relue dans le fuseau actuel : après
 * un changement de pays, c'est elle qui compte, pas l'instant du calcul.
 */
export function toNativeReminders(
  reminders: readonly Reminder[],
  now: number,
): NativeReminderPayload[] {
  return reminders
    .filter((reminder) => new Date(reminder.localAt).getTime() > now)
    .map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      at: reminder.localAt,
      path: reminderPath(reminder),
    }))
}

/** « 07:53 » si l'heure est lisible, sinon rien. */
function readTime(value: string | undefined): string | null {
  const match = value?.match(/(\d{1,2})[:h](\d{2})/)
  if (!match) return null
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

/** « Vol Pékin → Xi’an » → « vol Pékin → Xi’an » : seule l'initiale change. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

type ReminderPreferences = Pick<
  Preferences,
  'notifyTransportEve' | 'notifyMorning' | 'notifyCheckIn'
>

/**
 * Tous les rappels du voyage selon les préférences, triés par heure d'envoi
 * (passés compris : le tri entre passé et futur revient à `planReminders`).
 */
export function computeReminders(
  tripId: string,
  itinerary: DayItinerary[],
  preferences: ReminderPreferences,
): Reminder[] {
  const reminders: Reminder[] = []
  const reminderId = (key: string) => `${tripId}:${key}`

  itinerary.forEach((day, dayIndex) => {
    if (!day.date) return

    if (preferences.notifyTransportEve && day.transport) {
      const departure = readTime(day.transport.departureTime)
      const { hour, minute } = REMINDER_TIMES.transportEve
      reminders.push({
        id: reminderId(`eve-${day.id}`),
        tripId,
        kind: 'transport-eve',
        at: at(day.date, hour, minute, -1),
        localAt: localDateTime(day.date, hour, minute, -1),
        dayIndex,
        title: `Demain : ${lowerFirst(transportLabel(day.transport))}`,
        body: departure
          ? `Départ à ${departure}. Billets et adresses sont dans TripBrain.`
          : 'Vérifiez l’heure de départ et gardez vos billets à portée de main.',
      })
    }

    if (preferences.notifyMorning) {
      const { hour, minute } = REMINDER_TIMES.morning
      const count = day.activities.length
      reminders.push({
        id: reminderId(`morning-${day.id}`),
        tripId,
        kind: 'morning',
        at: at(day.date, hour, minute),
        localAt: localDateTime(day.date, hour, minute),
        dayIndex,
        title: `Aujourd’hui : ${day.title || day.city}`,
        body:
          count > 0
            ? `${day.city} · ${plural(count, 'activité')} au programme.`
            : `${day.city} · le programme du jour vous attend.`,
      })
    }

    const stay = day.accommodation
    // Le check-in a lieu le jour d'arrivée : la date de l'hébergement fait foi
    // quand elle est renseignée, sinon la journée qui le porte.
    if (
      preferences.notifyCheckIn &&
      stay &&
      (!stay.checkIn || stay.checkIn === day.date)
    ) {
      const { hour, minute } = REMINDER_TIMES.checkIn
      reminders.push({
        id: reminderId(`checkin-${day.id}`),
        tripId,
        kind: 'check-in',
        at: at(day.date, hour, minute),
        localAt: localDateTime(day.date, hour, minute),
        dayIndex,
        title: `Check-in : ${stay.name}`,
        body: stay.address || 'L’adresse est dans la fiche de l’hébergement.',
      })
    }
  })

  return reminders.sort((a, b) => a.at - b.at)
}

/**
 * Les rappels de tous les voyages de l'appareil, pas seulement du voyage
 * affiché : consulter un ancien voyage ne doit pas faire taire celui en cours.
 * Les voyages passés ne produisent que des rappels passés, que
 * `planReminders` écarte.
 */
export function computeAllReminders(
  trips: readonly { id: string; itinerary: DayItinerary[] }[],
  preferences: ReminderPreferences,
): Reminder[] {
  return trips
    .flatMap((trip) => computeReminders(trip.id, trip.itinerary, preferences))
    .sort((a, b) => a.at - b.at)
}

export interface ReminderPlan {
  /** À envoyer tout de suite (rappel de veille manqué de peu). */
  now: Reminder[]
  /** À programmer, dans l'ordre. */
  later: Reminder[]
}

/**
 * Ce qu'il faut faire des rappels à un instant donné : rien de rétroactif,
 * sauf la veille d'un trajet manquée depuis moins de trois heures ; jamais un
 * rappel déjà envoyé. `horizonMs` borne la programmation (un `setTimeout`
 * trop lointain déborde, et la page sera de toute façon rechargée d'ici là).
 */
export function planReminders(
  reminders: Reminder[],
  now: number,
  sentIds: ReadonlySet<string>,
  horizonMs = 24 * 60 * 60 * 1000,
): ReminderPlan {
  const plan: ReminderPlan = { now: [], later: [] }
  for (const reminder of reminders) {
    if (sentIds.has(reminder.id)) continue
    if (reminder.at > now) {
      if (reminder.at - now <= horizonMs) plan.later.push(reminder)
      continue
    }
    if (
      reminder.kind === 'transport-eve' &&
      now - reminder.at < MISSED_EVE_GRACE_MS
    ) {
      plan.now.push(reminder)
    }
  }
  return plan
}

/** Prochain rappel à venir (pour l'afficher dans les réglages, par exemple). */
export function nextReminder(
  reminders: Reminder[],
  now: number,
): Reminder | null {
  return reminders.find((reminder) => reminder.at > now) ?? null
}

const SENT_KEY = 'tripbrain-reminders-sent'
/** Au-delà, les plus anciens identifiants sont oubliés. */
const SENT_LIMIT = 200

/**
 * Les rappels envoyés avant les voyages multiples n'ont pas de préfixe de
 * voyage : ils ne pouvaient venir que du voyage alors affiché, on les lui
 * rattache. Sans cela, ils seraient soit renvoyés, soit (gardés tels quels)
 * pris pour ceux d'un autre voyage aux identifiants de journée identiques.
 */
export function upgradeSentReminderIds(
  ids: readonly string[],
  tripId: string,
): string[] {
  return ids.map((id) => (id.includes(':') ? id : `${tripId}:${id}`))
}

/** Applique `upgradeSentReminderIds` au registre de l'appareil, une seule fois. */
export function migrateSentReminders(tripId: string): void {
  try {
    const sent = [...readSentReminders()]
    if (sent.every((id) => id.includes(':'))) return
    localStorage.setItem(
      SENT_KEY,
      JSON.stringify(upgradeSentReminderIds(sent, tripId)),
    )
  } catch {
    // Au pire, un rappel de veille récent repartirait une fois.
  }
}

export function readSentReminders(): Set<string> {
  try {
    const raw = localStorage.getItem(SENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

export function markReminderSent(id: string): void {
  try {
    const sent = [...readSentReminders()].filter((item) => item !== id)
    sent.push(id)
    localStorage.setItem(SENT_KEY, JSON.stringify(sent.slice(-SENT_LIMIT)))
  } catch {
    // Sans stockage, un rappel pourrait repartir à la prochaine ouverture.
  }
}
