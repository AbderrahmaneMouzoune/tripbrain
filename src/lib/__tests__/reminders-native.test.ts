import type { DayItinerary } from '@/lib/itinerary-data'
import {
  computeReminders,
  localDateTime,
  reminderPath,
  toNativeReminders,
} from '../reminders'

const ALL = {
  notifyTransportEve: true,
  notifyMorning: true,
  notifyCheckIn: true,
}

const day = (
  id: string,
  date: string,
  extra: Partial<DayItinerary> = {},
): DayItinerary => ({
  id,
  date,
  dayNumber: 1,
  city: 'Lisbonne',
  title: 'Journée',
  coordinates: [0, 0],
  activities: [],
  ...extra,
})

describe('localDateTime', () => {
  it('écrit une heure murale, sans fuseau', () => {
    expect(localDateTime('2026-05-10', 8, 0)).toBe('2026-05-10T08:00:00')
    expect(localDateTime('2026-05-10', 20, 5, -1)).toBe('2026-05-09T20:05:00')
  })

  it('recule d’un mois pour la veille du 1er', () => {
    expect(localDateTime('2026-03-01', 20, 0, -1)).toBe('2026-02-28T20:00:00')
    expect(localDateTime('2028-03-01', 20, 0, -1)).toBe('2028-02-29T20:00:00')
    expect(localDateTime('2026-05-01', 20, 0, -1)).toBe('2026-04-30T20:00:00')
  })

  it('recule d’une année pour la veille du 1er janvier', () => {
    expect(localDateTime('2027-01-01', 20, 0, -1)).toBe('2026-12-31T20:00:00')
  })

  it('ignore les changements d’heure', () => {
    // Nuit du passage à l'heure d'été en Europe.
    expect(localDateTime('2026-03-30', 20, 0, -1)).toBe('2026-03-29T20:00:00')
  })
})

describe('rappels natifs', () => {
  const itinerary: DayItinerary[] = [
    day('d1', '2026-12-31'),
    day('d2', '2027-01-01', {
      transport: { id: 't', type: 'train', from: 'Lisbonne', to: 'Porto' },
      accommodation: {
        id: 'h',
        name: 'Casa',
        address: 'Rua 1',
        bookingUrl: '',
        checkIn: '2027-01-01',
        checkOut: '2027-01-02',
      },
    }),
  ]
  const reminders = computeReminders('trip-1', itinerary, ALL)

  it('porte l’heure murale de chaque rappel', () => {
    const eve = reminders.find((r) => r.kind === 'transport-eve')!
    expect(eve.localAt).toBe('2026-12-31T20:00:00')
    const checkIn = reminders.find((r) => r.kind === 'check-in')!
    expect(checkIn.localAt).toBe('2027-01-01T14:00:00')
    // Lue comme heure locale, l'heure murale retombe sur l'instant calculé.
    for (const reminder of reminders) {
      expect(new Date(reminder.localAt).getTime()).toBe(reminder.at)
    }
  })

  it('ouvre le bon voyage, la bonne journée et le bon écran', () => {
    expect(
      reminderPath({ tripId: 'trip-1', dayIndex: 1, kind: 'transport-eve' }),
    ).toBe('/?trip=trip-1&day=1&open=transport-eve')
  })

  it('ne confie au téléphone que les rappels à venir, en heure murale', () => {
    const now = new Date(2026, 11, 31, 12).getTime()
    const payload = toNativeReminders(reminders, now)
    expect(payload.map((r) => r.at)).toEqual([
      '2026-12-31T20:00:00',
      '2027-01-01T08:00:00',
      '2027-01-01T14:00:00',
    ])
    expect(payload[0]).toEqual({
      id: 'trip-1:eve-d2',
      title: 'Demain : train Lisbonne → Porto',
      body: expect.any(String),
      at: '2026-12-31T20:00:00',
      path: '/?trip=trip-1&day=1&open=transport-eve',
    })
    expect(payload.every((r) => !r.at.endsWith('Z'))).toBe(true)
  })
})
