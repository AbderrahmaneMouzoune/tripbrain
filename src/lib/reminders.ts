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
  /** Stable d'un calcul à l'autre : sert à ne jamais envoyer deux fois. */
  id: string
  kind: ReminderKind
  /** Horodatage (ms) de l'envoi prévu. */
  at: number
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

/**
 * Tous les rappels du voyage selon les préférences, triés par heure d'envoi
 * (passés compris : le tri entre passé et futur revient à `planReminders`).
 */
export function computeReminders(
  itinerary: DayItinerary[],
  preferences: Pick<
    Preferences,
    'notifyTransportEve' | 'notifyMorning' | 'notifyCheckIn'
  >,
): Reminder[] {
  const reminders: Reminder[] = []

  itinerary.forEach((day, dayIndex) => {
    if (!day.date) return

    if (preferences.notifyTransportEve && day.transport) {
      const departure = readTime(day.transport.departureTime)
      const { hour, minute } = REMINDER_TIMES.transportEve
      reminders.push({
        id: `eve-${day.id}`,
        kind: 'transport-eve',
        at: at(day.date, hour, minute, -1),
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
        id: `morning-${day.id}`,
        kind: 'morning',
        at: at(day.date, hour, minute),
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
        id: `checkin-${day.id}`,
        kind: 'check-in',
        at: at(day.date, hour, minute),
        dayIndex,
        title: `Check-in : ${stay.name}`,
        body: stay.address || 'L’adresse est dans la fiche de l’hébergement.',
      })
    }
  })

  return reminders.sort((a, b) => a.at - b.at)
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
