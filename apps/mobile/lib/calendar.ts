import * as Calendar from 'expo-calendar'
import { Platform } from 'react-native'

import type { CalendarEventPayload, CalendarOutcome } from './bridge-protocol'

// ─── « Ajouter au calendrier » ────────────────────────────────────────────────
//
// Sur le web, TripBrain produit un fichier .ics. Dans l'app, les journées
// sont écrites directement dans le calendrier du téléphone, en événements
// sur la journée entière.

function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : date
}

function nextDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}

/** Le calendrier où écrire : celui par défaut sur iOS, le premier modifiable sinon. */
async function pickCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === 'ios') {
    try {
      return Calendar.getDefaultCalendarSync()
    } catch {
      // Pas de calendrier par défaut : on cherche parmi les autres.
    }
  }
  const calendars = await Calendar.getCalendars()
  const writable = calendars.filter((calendar) => calendar.allowsModifications)
  return writable.find((calendar) => calendar.isPrimary) ?? writable[0] ?? null
}

export async function addCalendarEvents(
  events: CalendarEventPayload[],
): Promise<{ outcome: CalendarOutcome; count: number }> {
  try {
    const permission = await Calendar.requestCalendarPermissions(true)
    if (!permission.granted) return { outcome: 'denied', count: 0 }

    const calendar = await pickCalendar()
    if (!calendar) return { outcome: 'unavailable', count: 0 }

    let count = 0
    for (const event of events) {
      const start = parseDay(event.date)
      if (!start) continue
      const end = (event.endDate && parseDay(event.endDate)) || nextDay(start)
      await calendar.createEvent({
        title: event.title,
        startDate: start,
        endDate: end,
        allDay: true,
        location: event.location,
        notes: event.notes,
      })
      count++
    }
    return { outcome: 'added', count }
  } catch (error) {
    console.warn('[Calendrier] ajout impossible', error)
    return { outcome: 'unavailable', count: 0 }
  }
}
