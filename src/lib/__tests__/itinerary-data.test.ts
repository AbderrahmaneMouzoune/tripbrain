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
        expect(typeof acc.name).toBe('string')
        expect(typeof acc.address).toBe('string')
        expect(typeof acc.bookingUrl).toBe('string')
        expect(typeof acc.checkIn).toBe('string')
        expect(typeof acc.checkOut).toBe('string')
      }
    }
  })
})
