import { describe, it, expect } from 'vitest'
import type { Activity, DayItinerary } from '../itinerary-data'
import {
  createEmptyAccommodation,
  createEmptyActivity,
  createEmptyTransport,
  createEntityId,
  moveActivity,
  removeActivity,
  replaceDay,
  setAccommodation,
  setTransport,
  upsertActivity,
} from '../itinerary-edit'

function makeActivity(id: string, name = id): Activity {
  return { id, name, type: 'visit' }
}

function makeDay(overrides: Partial<DayItinerary> = {}): DayItinerary {
  return {
    id: 'day-1',
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Arrivée',
    coordinates: [31.2304, 121.4737],
    activities: [makeActivity('act-1'), makeActivity('act-2')],
    ...overrides,
  }
}

describe('createEntityId', () => {
  it('prefixes the id and stays unique across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createEntityId('act')))

    expect(ids.size).toBe(50)
    for (const id of ids) expect(id.startsWith('act-')).toBe(true)
  })
})

describe('replaceDay', () => {
  it('replaces the matching day and keeps the order', () => {
    const itinerary = [
      makeDay({ id: 'day-1' }),
      makeDay({ id: 'day-2', dayNumber: 2 }),
      makeDay({ id: 'day-3', dayNumber: 3 }),
    ]
    const edited = { ...itinerary[1], title: 'Nouveau titre' }

    const next = replaceDay(itinerary, edited)

    expect(next.map((day) => day.id)).toEqual(['day-1', 'day-2', 'day-3'])
    expect(next[1].title).toBe('Nouveau titre')
    expect(next[0]).toBe(itinerary[0])
  })

  it('leaves the itinerary untouched when the id is unknown', () => {
    const itinerary = [makeDay()]

    const next = replaceDay(itinerary, makeDay({ id: 'ghost' }))

    expect(next).toEqual(itinerary)
  })
})

describe('upsertActivity', () => {
  it('replaces an existing activity in place', () => {
    const day = makeDay()

    const next = upsertActivity(day, makeActivity('act-1', 'Renommée'))

    expect(next.activities).toHaveLength(2)
    expect(next.activities[0].name).toBe('Renommée')
    expect(day.activities[0].name).toBe('act-1')
  })

  it('appends an unknown activity at the end', () => {
    const day = makeDay()

    const next = upsertActivity(day, makeActivity('act-3'))

    expect(next.activities.map((activity) => activity.id)).toEqual([
      'act-1',
      'act-2',
      'act-3',
    ])
  })
})

describe('removeActivity', () => {
  it('drops the matching activity', () => {
    const next = removeActivity(makeDay(), 'act-1')

    expect(next.activities.map((activity) => activity.id)).toEqual(['act-2'])
  })

  it('is a no-op for an unknown id', () => {
    const day = makeDay()

    expect(removeActivity(day, 'ghost').activities).toEqual(day.activities)
  })
})

describe('moveActivity', () => {
  it('moves an activity down', () => {
    const next = moveActivity(makeDay(), 'act-1', 1)

    expect(next.activities.map((activity) => activity.id)).toEqual([
      'act-2',
      'act-1',
    ])
  })

  it('moves an activity up', () => {
    const next = moveActivity(makeDay(), 'act-2', -1)

    expect(next.activities.map((activity) => activity.id)).toEqual([
      'act-2',
      'act-1',
    ])
  })

  it('ignores moves outside the bounds', () => {
    const day = makeDay()

    expect(moveActivity(day, 'act-1', -1)).toBe(day)
    expect(moveActivity(day, 'act-2', 1)).toBe(day)
    expect(moveActivity(day, 'ghost', 1)).toBe(day)
  })
})

describe('setTransport', () => {
  it('sets the transport', () => {
    const transport = createEmptyTransport()

    const next = setTransport(makeDay(), transport)

    expect(next.transport).toBe(transport)
  })

  it('removes the key when given undefined', () => {
    const day = makeDay({ transport: createEmptyTransport() })

    const next = setTransport(day, undefined)

    expect('transport' in next).toBe(false)
  })
})

describe('setAccommodation', () => {
  it('sets the accommodation', () => {
    const day = makeDay()
    const accommodation = createEmptyAccommodation(day)

    expect(setAccommodation(day, accommodation).accommodation).toBe(
      accommodation,
    )
  })

  it('removes the key when given undefined', () => {
    const day = makeDay()
    const withStay = setAccommodation(day, createEmptyAccommodation(day))

    expect('accommodation' in setAccommodation(withStay, undefined)).toBe(false)
  })
})

describe('empty entity factories', () => {
  it('creates an activity flagged as user-made', () => {
    const activity = createEmptyActivity()

    expect(activity.name).toBe('')
    expect(activity.type).toBe('visit')
    expect(activity.source).toBe('user')
  })

  it('creates a transport flagged as user-made', () => {
    const transport = createEmptyTransport()

    expect(transport.type).toBe('train')
    expect(transport.status).toBe('planned')
    expect(transport.source).toBe('user')
  })

  it('pre-fills the stay with the day date and the next day', () => {
    const accommodation = createEmptyAccommodation(makeDay())

    expect(accommodation.checkIn).toBe('2026-05-10')
    expect(accommodation.checkOut).toBe('2026-05-11')
  })

  it('keeps an unparsable day date as-is for the checkout', () => {
    const accommodation = createEmptyAccommodation(makeDay({ date: 'bientôt' }))

    expect(accommodation.checkIn).toBe('bientôt')
    expect(accommodation.checkOut).toBe('bientôt')
  })
})
