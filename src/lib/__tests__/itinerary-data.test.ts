import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDate,
  getDayStatus,
  getCurrentDayIndex,
  itinerary,
  tripStartDate,
  tripEndDate,
  type DayItinerary,
  type Activity,
  type Accommodation,
  type Transport,
  type EntityMetadata,
} from '../itinerary-data'

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats a date string in French by default', () => {
    const result = formatDate('2026-05-10')
    // French locale: "dimanche 10 mai"
    expect(result).toMatch(/mai/i)
    expect(result).toMatch(/10/)
  })

  it('accepts a custom locale', () => {
    const result = formatDate('2026-05-10', 'en-US')
    expect(result).toMatch(/May/i)
    expect(result).toMatch(/10/)
  })

  it('includes the weekday in the output', () => {
    // 2026-05-10 is a Sunday
    const result = formatDate('2026-05-10', 'en-US')
    expect(result).toMatch(/sunday/i)
  })
})

// ---------------------------------------------------------------------------
// getDayStatus
// ---------------------------------------------------------------------------

describe('getDayStatus', () => {
  beforeEach(() => {
    // Fix "today" to 2026-05-15 so tests are deterministic
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "past" for a date before today', () => {
    expect(getDayStatus('2026-05-10')).toBe('past')
  })

  it('returns "current" for today\'s date', () => {
    expect(getDayStatus('2026-05-15')).toBe('current')
  })

  it('returns "future" for a date after today', () => {
    expect(getDayStatus('2026-05-20')).toBe('future')
  })
})

// ---------------------------------------------------------------------------
// getCurrentDayIndex
// ---------------------------------------------------------------------------

describe('getCurrentDayIndex', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when today is before the trip', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    expect(getCurrentDayIndex()).toBe(0)
  })

  it('returns last index when today is after the trip', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    expect(getCurrentDayIndex()).toBe(itinerary.length - 1)
  })

  it('returns the correct index when today matches a trip day', () => {
    const firstDay = itinerary[0]
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${firstDay.date}T12:00:00Z`))
    expect(getCurrentDayIndex()).toBe(0)
  })

  it('returns the correct index for a mid-trip day', () => {
    const midIndex = Math.floor(itinerary.length / 2)
    const midDay = itinerary[midIndex]
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${midDay.date}T12:00:00Z`))
    expect(getCurrentDayIndex()).toBe(midIndex)
  })
})

// ---------------------------------------------------------------------------
// tripStartDate / tripEndDate
// ---------------------------------------------------------------------------

describe('trip date constants', () => {
  it('tripStartDate is a valid Date', () => {
    expect(tripStartDate).toBeInstanceOf(Date)
    expect(isNaN(tripStartDate.getTime())).toBe(false)
  })

  it('tripEndDate is a valid Date', () => {
    expect(tripEndDate).toBeInstanceOf(Date)
    expect(isNaN(tripEndDate.getTime())).toBe(false)
  })

  it('tripEndDate is after tripStartDate', () => {
    expect(tripEndDate.getTime()).toBeGreaterThan(tripStartDate.getTime())
  })
})

// ---------------------------------------------------------------------------
// itinerary data structure
// ---------------------------------------------------------------------------

describe('itinerary data structure', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(itinerary)).toBe(true)
    expect(itinerary.length).toBeGreaterThan(0)
  })

  it('every day has required fields', () => {
    for (const day of itinerary) {
      expect(typeof day.id).toBe('string')
      expect(day.id.length).toBeGreaterThan(0)
      expect(typeof day.date).toBe('string')
      expect(typeof day.dayNumber).toBe('number')
      expect(typeof day.city).toBe('string')
      expect(typeof day.title).toBe('string')
      expect(Array.isArray(day.activities)).toBe(true)
      expect(Array.isArray(day.coordinates)).toBe(true)
      expect(day.coordinates).toHaveLength(2)
    }
  })

  it('day numbers are sequential starting from 1', () => {
    const numbers = itinerary.map((d) => d.dayNumber)
    numbers.forEach((num, idx) => expect(num).toBe(idx + 1))
  })

  it('dates are valid ISO date strings (YYYY-MM-DD)', () => {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
    for (const day of itinerary) {
      expect(day.date).toMatch(isoDateRegex)
      expect(isNaN(new Date(day.date).getTime())).toBe(false)
    }
  })

  it('dates are in chronological order', () => {
    for (let i = 1; i < itinerary.length; i++) {
      const prev = new Date(itinerary[i - 1].date).getTime()
      const curr = new Date(itinerary[i].date).getTime()
      expect(curr).toBeGreaterThanOrEqual(prev)
    }
  })

  it('activity types are valid enum values', () => {
    const validTypes: Activity['type'][] = [
      'visit',
      'transport',
      'food',
      'experience',
      'shopping',
    ]
    for (const day of itinerary) {
      for (const activity of day.activities) {
        expect(validTypes).toContain(activity.type)
      }
    }
  })

  it('transport type is a valid enum value when present', () => {
    const validTypes = ['train', 'car', 'plane', 'bus'] as const
    for (const day of itinerary) {
      if (day.transport) {
        expect(validTypes).toContain(day.transport.type)
      }
    }
  })

  it('coordinates are valid latitude/longitude tuples', () => {
    for (const day of itinerary) {
      const [lat, lng] = day.coordinates
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThanOrEqual(180)
    }
  })

  it('accommodation fields are complete when present', () => {
    for (const day of itinerary) {
      if (day.accommodation) {
        const acc: Accommodation = day.accommodation
        expect(typeof acc.id).toBe('string')
        expect(acc.id.length).toBeGreaterThan(0)
        expect(typeof acc.name).toBe('string')
        expect(typeof acc.address).toBe('string')
        expect(typeof acc.bookingUrl).toBe('string')
        expect(typeof acc.checkIn).toBe('string')
        expect(typeof acc.checkOut).toBe('string')
      }
    }
  })

  it('every activity has a required id field', () => {
    for (const day of itinerary) {
      for (const activity of day.activities) {
        expect(typeof activity.id).toBe('string')
        expect(activity.id.length).toBeGreaterThan(0)
      }
    }
  })

  it('transport has a required id field when present', () => {
    for (const day of itinerary) {
      if (day.transport) {
        const tr: Transport = day.transport
        expect(typeof tr.id).toBe('string')
        expect(tr.id.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Enriched entity tests (new fields)
// ---------------------------------------------------------------------------

describe('enriched Activity with booking and price', () => {
  const bookedActivity: Activity = {
    id: 'act-test-1',
    name: 'Grande Muraille Mutianyu',
    type: 'visit',
    duration: '4h',
    coordinates: [40.4319, 116.5704],
    bookingUrl: 'https://example.com/great-wall-ticket',
    reservationRequired: true,
    price: 40,
    currency: 'CNY',
    openAt: '07:30–18:00',
    address: 'Mutianyu, Huairou District, Beijing',
    rating: 4.8,
    tags: ['UNESCO', 'outdoor', 'hiking'],
    status: 'planned',
    tips: 'Arrive early to avoid crowds',
    source: 'ai',
    priority: 'must',
  }

  it('accepts all optional booking and price fields', () => {
    expect(bookedActivity.id).toBe('act-test-1')
    expect(bookedActivity.bookingUrl).toBe('https://example.com/great-wall-ticket')
    expect(bookedActivity.reservationRequired).toBe(true)
    expect(bookedActivity.price).toBe(40)
    expect(bookedActivity.currency).toBe('CNY')
  })

  it('accepts openAt schedule field', () => {
    expect(bookedActivity.openAt).toBe('07:30–18:00')
  })

  it('accepts context fields', () => {
    expect(bookedActivity.rating).toBe(4.8)
    expect(bookedActivity.tags).toEqual(['UNESCO', 'outdoor', 'hiking'])
  })

  it('accepts valid status values', () => {
    const planned: Activity = { ...bookedActivity, status: 'planned' }
    const done: Activity = { ...bookedActivity, status: 'done' }
    const skipped: Activity = { ...bookedActivity, status: 'skipped' }
    expect(planned.status).toBe('planned')
    expect(done.status).toBe('done')
    expect(skipped.status).toBe('skipped')
  })

  it('accepts source and priority metadata', () => {
    expect(bookedActivity.source).toBe('ai')
    expect(bookedActivity.priority).toBe('must')
  })
})

describe('enriched Transport with full booking info', () => {
  const bookedTransport: Transport = {
    id: 'tr-test-1',
    type: 'train',
    from: 'Shanghai',
    to: 'Beijing',
    details: 'G2 High-Speed',
    departureAddress: 'Shanghai Hongqiao Railway Station, 200 Hanzhong Road',
    departureTime: '08:00',
    arrivalTime: '12:30',
    duration: '4h30',
    provider: 'China Railway',
    bookingUrl: 'https://www.12306.cn',
    bookingReference: 'G2-20260511-SH-BJ',
    price: 553,
    currency: 'CNY',
    seat: '5C',
    gate: 'G12',
    terminal: 'T1',
    status: 'booked',
    notes: 'Business class seat',
    source: 'import',
    priority: 'must',
  }

  it('accepts all required transport fields', () => {
    expect(bookedTransport.id).toBe('tr-test-1')
    expect(bookedTransport.type).toBe('train')
    expect(bookedTransport.from).toBe('Shanghai')
    expect(bookedTransport.to).toBe('Beijing')
  })

  it('accepts departure address field', () => {
    expect(bookedTransport.departureAddress).toBe(
      'Shanghai Hongqiao Railway Station, 200 Hanzhong Road',
    )
  })

  it('accepts timing fields', () => {
    expect(bookedTransport.departureTime).toBe('08:00')
    expect(bookedTransport.arrivalTime).toBe('12:30')
    expect(bookedTransport.duration).toBe('4h30')
  })

  it('accepts full booking info', () => {
    expect(bookedTransport.provider).toBe('China Railway')
    expect(bookedTransport.bookingUrl).toBe('https://www.12306.cn')
    expect(bookedTransport.bookingReference).toBe('G2-20260511-SH-BJ')
  })

  it('accepts pricing fields', () => {
    expect(bookedTransport.price).toBe(553)
    expect(bookedTransport.currency).toBe('CNY')
  })

  it('accepts travel info fields', () => {
    expect(bookedTransport.seat).toBe('5C')
    expect(bookedTransport.gate).toBe('G12')
    expect(bookedTransport.terminal).toBe('T1')
  })

  it('accepts valid status values', () => {
    const planned: Transport = { ...bookedTransport, status: 'planned' }
    const booked: Transport = { ...bookedTransport, status: 'booked' }
    const checkedIn: Transport = { ...bookedTransport, status: 'checked-in' }
    const completed: Transport = { ...bookedTransport, status: 'completed' }
    expect(planned.status).toBe('planned')
    expect(booked.status).toBe('booked')
    expect(checkedIn.status).toBe('checked-in')
    expect(completed.status).toBe('completed')
  })

  it('accepts source and priority metadata', () => {
    expect(bookedTransport.source).toBe('import')
    expect(bookedTransport.priority).toBe('must')
  })
})

describe('enriched Accommodation with new fields', () => {
  const bookedAccommodation: Accommodation = {
    id: 'acc-test-1',
    name: 'The Peninsula Shanghai',
    address: '32 The Bund, Shanghai',
    bookingUrl: 'https://example.com/peninsula',
    checkIn: '2026-05-10',
    checkOut: '2026-05-12',
    price: 1200,
    currency: 'CNY',
    bookingReference: 'PEN-SH-20260510',
    status: 'booked',
    source: 'user',
    priority: 'must',
  }

  it('accepts pricing fields', () => {
    expect(bookedAccommodation.price).toBe(1200)
    expect(bookedAccommodation.currency).toBe('CNY')
  })

  it('accepts booking reference', () => {
    expect(bookedAccommodation.bookingReference).toBe('PEN-SH-20260510')
  })

  it('accepts valid status values', () => {
    const planned: Accommodation = { ...bookedAccommodation, status: 'planned' }
    const booked: Accommodation = { ...bookedAccommodation, status: 'booked' }
    const checkedIn: Accommodation = { ...bookedAccommodation, status: 'checked-in' }
    const completed: Accommodation = { ...bookedAccommodation, status: 'completed' }
    expect(planned.status).toBe('planned')
    expect(booked.status).toBe('booked')
    expect(checkedIn.status).toBe('checked-in')
    expect(completed.status).toBe('completed')
  })

  it('accepts source and priority metadata', () => {
    expect(bookedAccommodation.source).toBe('user')
    expect(bookedAccommodation.priority).toBe('must')
  })
})

describe('DayItinerary metadata fields', () => {
  it('accepts source and priority on DayItinerary', () => {
    const day: DayItinerary = {
      id: 'day-test-1',
      date: '2026-05-10',
      dayNumber: 1,
      city: 'Shanghai',
      title: 'Test day',
      activities: [],
      coordinates: [31.2304, 121.4737],
      source: 'ai',
      priority: 'must',
    }
    expect(day.source).toBe('ai')
    expect(day.priority).toBe('must')
  })

  it('accepts all valid source values', () => {
    const base: DayItinerary = {
      id: 'day-test-1',
      date: '2026-05-10',
      dayNumber: 1,
      city: 'Shanghai',
      title: 'Test day',
      activities: [],
      coordinates: [31.2304, 121.4737],
    }
    const userDay: DayItinerary = { ...base, source: 'user' }
    const importDay: DayItinerary = { ...base, source: 'import' }
    const aiDay: DayItinerary = { ...base, source: 'ai' }
    expect(userDay.source).toBe('user')
    expect(importDay.source).toBe('import')
    expect(aiDay.source).toBe('ai')
  })

  it('accepts all valid priority values', () => {
    const base: DayItinerary = {
      id: 'day-test-1',
      date: '2026-05-10',
      dayNumber: 1,
      city: 'Shanghai',
      title: 'Test day',
      activities: [],
      coordinates: [31.2304, 121.4737],
    }
    const mustDay: DayItinerary = { ...base, priority: 'must' }
    const niceDay: DayItinerary = { ...base, priority: 'nice' }
    const optionalDay: DayItinerary = { ...base, priority: 'optional' }
    expect(mustDay.priority).toBe('must')
    expect(niceDay.priority).toBe('nice')
    expect(optionalDay.priority).toBe('optional')
  })
})

describe('EntityMetadata shared base interface', () => {
  it('source and priority are the same type across all entities', () => {
    // Verify that all entities accept EntityMetadata fields via structural subtyping
    const meta: EntityMetadata = { source: 'ai', priority: 'must' }

    const activity: Activity = {
      id: 'act-meta-test',
      name: 'Test',
      type: 'visit',
      ...meta,
    }
    const transport: Transport = { id: 'tr-meta-test', type: 'train', ...meta }
    const accommodation: Accommodation = {
      id: 'acc-meta-test',
      name: 'Test Hotel',
      address: '1 Test Street',
      bookingUrl: 'https://example.com',
      checkIn: '2026-05-10',
      checkOut: '2026-05-11',
      ...meta,
    }
    const day: DayItinerary = {
      id: 'day-meta-test',
      date: '2026-05-10',
      dayNumber: 1,
      city: 'Test',
      title: 'Test',
      activities: [],
      coordinates: [0, 0],
      ...meta,
    }

    expect(activity.source).toBe('ai')
    expect(transport.priority).toBe('must')
    expect(accommodation.source).toBe('ai')
    expect(day.priority).toBe('must')
  })
})
