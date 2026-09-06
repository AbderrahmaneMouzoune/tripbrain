/**
 * Rappels du voyage, calculés depuis l'itinéraire.
 *
 * Le téléphone (via l'app native) les présente à l'heure dite, sans réseau
 * ni serveur : un départ de train ou de vol, un check-out. Tout est recalculé
 * à chaque modification du voyage, dans le fuseau horaire courant de
 * l'appareil, ce qui compte quand on change de pays.
 *
 * Fonctions pures, testées dans `__tests__/reminders.test.ts`.
 */

import type { DayItinerary, Transport } from './itinerary-data'
import type { NativeReminder } from './native-app'

/** Avance du rappel selon le moyen de transport, en minutes. */
const LEAD_MINUTES: Record<Transport['type'], number> = {
  plane: 180,
  train: 60,
  bus: 60,
  car: 60,
}

const TRANSPORT_LABELS: Record<Transport['type'], string> = {
  plane: 'Vol',
  train: 'Train',
  bus: 'Bus',
  car: 'Départ en voiture',
}

/** Heure à laquelle on rappelle un check-out, faute de mieux. */
const CHECKOUT_TIME = '09:00'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

function filled(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** `AAAA-MM-JJ` + `HH:mm` en heure locale, décalée de `offsetMinutes`. */
function localDateTime(
  date: string,
  time: string,
  offsetMinutes = 0,
): string | null {
  if (!DATE_PATTERN.test(date)) return null
  const match = TIME_PATTERN.exec(time)
  if (!match) return null
  const [year, month, day] = date.split('-').map(Number)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  const value = new Date(year, month - 1, day, hours, minutes - offsetMinutes)
  if (Number.isNaN(value.getTime())) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:00`
}

function leadLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`
}

function transportReminder(day: DayItinerary): NativeReminder | null {
  const transport = day.transport
  if (!transport || !filled(transport.departureTime)) return null

  const lead = LEAD_MINUTES[transport.type] ?? 60
  const at = localDateTime(day.date, transport.departureTime, lead)
  if (!at) return null

  const route =
    filled(transport.from) && filled(transport.to)
      ? ` ${transport.from} → ${transport.to}`
      : filled(transport.to)
        ? ` vers ${transport.to}`
        : ''

  const title = `${TRANSPORT_LABELS[transport.type]}${route} dans ${leadLabel(lead)}`

  const body = [
    `Départ à ${transport.departureTime}`,
    filled(transport.details) ? transport.details : undefined,
    filled(transport.departureAddress)
      ? `Depuis ${transport.departureAddress}`
      : undefined,
    filled(transport.terminal) ? `Terminal ${transport.terminal}` : undefined,
    filled(transport.gate) ? `Porte ${transport.gate}` : undefined,
    filled(transport.seat) ? `Siège ${transport.seat}` : undefined,
    filled(transport.bookingReference)
      ? `Réf. ${transport.bookingReference}`
      : undefined,
  ]
    .filter(filled)
    .join(' · ')

  return { id: `transport-${transport.id}`, title, body, at, path: '/' }
}

function checkoutReminder(day: DayItinerary): NativeReminder | null {
  const accommodation = day.accommodation
  if (!accommodation || !filled(accommodation.checkOut)) return null

  const at = localDateTime(accommodation.checkOut, CHECKOUT_TIME)
  if (!at) return null

  const body = [
    accommodation.address,
    filled(accommodation.bookingReference)
      ? `Réf. ${accommodation.bookingReference}`
      : undefined,
  ]
    .filter(filled)
    .join(' · ')

  return {
    id: `checkout-${accommodation.id}`,
    title: `Check-out aujourd’hui — ${accommodation.name}`,
    body: body || undefined,
    at,
    path: '/',
  }
}

/**
 * Tous les rappels d'un itinéraire, du plus proche au plus lointain.
 * Un hébergement présent sur plusieurs journées n'a qu'un check-out.
 */
export function buildReminders(days: DayItinerary[]): NativeReminder[] {
  const reminders: NativeReminder[] = []
  const seen = new Set<string>()

  for (const day of days) {
    for (const reminder of [transportReminder(day), checkoutReminder(day)]) {
      if (!reminder || seen.has(reminder.id)) continue
      seen.add(reminder.id)
      reminders.push(reminder)
    }
  }

  return reminders.sort((a, b) => a.at.localeCompare(b.at))
}
