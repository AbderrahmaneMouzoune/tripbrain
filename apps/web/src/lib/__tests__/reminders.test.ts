import { buildReminders } from '@/lib/reminders'
import type { DayItinerary } from '@/lib/itinerary-data'

function day(overrides: Partial<DayItinerary>): DayItinerary {
  return {
    id: 'd1',
    date: '2026-05-12',
    dayNumber: 1,
    city: 'Tachkent',
    title: 'Départ',
    activities: [],
    coordinates: [41.3, 69.2],
    ...overrides,
  }
}

describe('buildReminders', () => {
  it('rappelle un train une heure avant le départ', () => {
    const [reminder] = buildReminders([
      day({
        transport: {
          id: 't1',
          type: 'train',
          from: 'Tachkent',
          to: 'Samarcande',
          departureTime: '07:53',
          details: 'Afrosiyob 762',
          seat: '12A',
        },
      }),
    ])
    expect(reminder).toEqual({
      id: 'transport-t1',
      title: 'Train Tachkent → Samarcande dans 1 h',
      body: 'Départ à 07:53 · Afrosiyob 762 · Siège 12A',
      at: '2026-05-12T06:53:00',
      path: '/',
    })
  })

  it('prévient trois heures avant un vol, même la veille au soir', () => {
    const [reminder] = buildReminders([
      day({
        date: '2026-05-20',
        transport: {
          id: 't2',
          type: 'plane',
          to: 'Paris',
          departureTime: '01:30',
        },
      }),
    ])
    expect(reminder.title).toBe('Vol vers Paris dans 3 h')
    expect(reminder.at).toBe('2026-05-19T22:30:00')
  })

  it('rappelle un check-out une seule fois par hébergement', () => {
    const accommodation = {
      id: 'h1',
      name: 'Hôtel Rayann',
      address: 'Rue Registan, Samarcande',
      bookingUrl: '',
      checkIn: '2026-05-12',
      checkOut: '2026-05-14',
      bookingReference: 'ABC123',
    }
    const reminders = buildReminders([
      day({ id: 'd1', date: '2026-05-12', accommodation }),
      day({ id: 'd2', date: '2026-05-13', accommodation }),
    ])
    expect(reminders).toEqual([
      {
        id: 'checkout-h1',
        title: 'Check-out aujourd’hui — Hôtel Rayann',
        body: 'Rue Registan, Samarcande · Réf. ABC123',
        at: '2026-05-14T09:00:00',
        path: '/',
      },
    ])
  })

  it('ignore ce qui n’a pas d’heure ou de date valide', () => {
    expect(
      buildReminders([
        day({ transport: { id: 't3', type: 'bus' } }),
        day({
          id: 'd9',
          date: 'bientôt',
          transport: { id: 't4', type: 'bus', departureTime: '10:00' },
        }),
        day({
          id: 'd10',
          transport: { id: 't5', type: 'bus', departureTime: '25:00' },
        }),
      ]),
    ).toEqual([])
  })

  it('trie du plus proche au plus lointain', () => {
    const reminders = buildReminders([
      day({
        id: 'd2',
        date: '2026-05-15',
        transport: { id: 't6', type: 'bus', departureTime: '09:00' },
      }),
      day({
        id: 'd1',
        date: '2026-05-12',
        transport: { id: 't7', type: 'car', departureTime: '08:00' },
      }),
    ])
    expect(reminders.map((r) => r.id)).toEqual(['transport-t7', 'transport-t6'])
  })
})
