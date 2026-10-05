import type { DayItinerary } from '@/lib/itinerary-data'
import {
  MISSED_EVE_GRACE_MS,
  computeReminders,
  nextReminder,
  planReminders,
} from '../reminders'

const ALL = {
  notifyTransportEve: true,
  notifyMorning: true,
  notifyCheckIn: true,
}

const itinerary: DayItinerary[] = [
  {
    id: 'd1',
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Arrivée à Shanghai',
    coordinates: [0, 0],
    activities: [
      { id: 'a1', name: 'Bund', type: 'visit' },
      { id: 'a2', name: 'Dîner', type: 'food' },
    ],
    accommodation: {
      id: 'h1',
      name: 'Lingju B&B',
      address: 'Lane 786, Julu Road',
      bookingUrl: '',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
    },
  },
  {
    id: 'd2',
    date: '2026-05-11',
    dayNumber: 2,
    city: 'Shanghai',
    title: 'Vieille ville',
    coordinates: [0, 0],
    activities: [],
    transport: {
      id: 't2',
      type: 'train',
      from: 'Shanghai',
      to: 'Qingdao',
      departureTime: '07:53',
    },
    // Hébergement repris d'une journée précédente : pas un nouveau check-in.
    accommodation: {
      id: 'h1',
      name: 'Lingju B&B',
      address: 'Lane 786, Julu Road',
      bookingUrl: '',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
    },
  },
  {
    id: 'd3',
    date: '2026-05-12',
    dayNumber: 3,
    city: 'Pékin',
    title: 'Arrivée à Pékin',
    coordinates: [0, 0],
    activities: [],
    transport: { id: 't3', type: 'plane' },
  },
]

const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

describe('computeReminders', () => {
  const reminders = computeReminders(itinerary, ALL)

  it('reminds the eve of each trip at 20:00 with the departure time', () => {
    const eve = reminders.find((r) => r.id === 'eve-d2')!
    expect(eve.at).toBe(local(2026, 5, 10, 20))
    expect(eve.title).toBe('Demain : train Shanghai → Qingdao')
    expect(eve.body).toContain('07:53')
  })

  it('stays useful when the departure time is unknown', () => {
    const eve = reminders.find((r) => r.id === 'eve-d3')!
    expect(eve.title).toBe('Demain : vol')
    expect(eve.body).not.toMatch(/\d{2}:\d{2}/)
  })

  it('sends the morning programme at 08:00 every day', () => {
    const mornings = reminders.filter((r) => r.kind === 'morning')
    expect(mornings).toHaveLength(3)
    expect(mornings[0].at).toBe(local(2026, 5, 10, 8))
    expect(mornings[0].body).toBe('Shanghai · 2 activités au programme.')
  })

  it('reminds the check-in on arrival day only', () => {
    const checkIns = reminders.filter((r) => r.kind === 'check-in')
    expect(checkIns.map((r) => r.id)).toEqual(['checkin-d1'])
    expect(checkIns[0].title).toBe('Check-in : Lingju B&B')
  })

  it('follows the preferences', () => {
    const none = computeReminders(itinerary, {
      notifyTransportEve: false,
      notifyMorning: false,
      notifyCheckIn: false,
    })
    expect(none).toEqual([])
    const evesOnly = computeReminders(itinerary, {
      ...ALL,
      notifyMorning: false,
      notifyCheckIn: false,
    })
    expect(evesOnly.every((r) => r.kind === 'transport-eve')).toBe(true)
  })

  it('sorts reminders by time', () => {
    const times = reminders.map((r) => r.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('planReminders', () => {
  const reminders = computeReminders(itinerary, ALL)

  it('schedules only what lies within the horizon', () => {
    const now = local(2026, 5, 10, 7)
    const plan = planReminders(reminders, now, new Set())
    expect(plan.now).toEqual([])
    expect(plan.later.map((r) => r.id)).toEqual([
      'morning-d1',
      'checkin-d1',
      'eve-d2',
    ])
  })

  it('never sends anything retroactively except a recent eve reminder', () => {
    const now = local(2026, 5, 10, 22) // 2 h après la veille du train
    const plan = planReminders(reminders, now, new Set())
    expect(plan.now.map((r) => r.id)).toEqual(['eve-d2'])
    expect(plan.now.some((r) => r.kind === 'morning')).toBe(false)
  })

  it('drops an eve reminder missed for more than three hours', () => {
    const eve = local(2026, 5, 10, 20)
    const plan = planReminders(
      reminders,
      eve + MISSED_EVE_GRACE_MS + 1,
      new Set(),
    )
    expect(plan.now).toEqual([])
  })

  it('never sends the same reminder twice', () => {
    const now = local(2026, 5, 10, 22)
    const plan = planReminders(reminders, now, new Set(['eve-d2', 'eve-d3']))
    expect(plan.now).toEqual([])
    expect(plan.later.map((r) => r.id)).not.toContain('eve-d3')
  })

  it('finds the next reminder', () => {
    expect(nextReminder(reminders, local(2026, 5, 11, 9))?.id).toBe('eve-d3')
    expect(nextReminder(reminders, local(2027, 1, 1, 0))).toBeNull()
  })
})
