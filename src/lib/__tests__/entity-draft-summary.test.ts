import { describe, it, expect } from 'vitest'
import {
  accommodationForm,
  activityForm,
  transportForm,
  type EditField,
} from '../edit-fields'
import {
  countNights,
  formatMinutes,
  formatShortDate,
  hostnameOf,
  minutesBetween,
  pricePerNight,
  summarizeSection,
  toDraft,
  validateDraft,
} from '../entity-draft'

const bookingFields = activityForm.fields.filter(
  (field) => field.section === 'booking',
)

describe('summarizeSection', () => {
  it('describes a booking section the way the folded header shows it', () => {
    const draft = toDraft(
      {
        price: 60,
        currency: 'CNY',
        rating: 4.9,
        reservationRequired: true,
      },
      bookingFields,
    )

    expect(summarizeSection(bookingFields, draft)).toEqual([
      '60 CNY',
      '4.9 ★',
      'réservation requise',
    ])
  })

  it('returns nothing for an empty section', () => {
    const draft = toDraft({}, bookingFields)
    expect(summarizeSection(bookingFields, draft)).toEqual([])
  })

  it('counts list entries and shows option labels', () => {
    const fields: readonly EditField[] = [
      {
        key: 'type',
        label: 'Catégorie',
        type: 'icon-choice',
        options: [{ value: 'food', label: 'Restauration' }],
      },
      { key: 'highlights', label: 'Points forts', type: 'lines' },
      { key: 'tags', label: 'Tags', type: 'chips' },
    ]
    const draft = toDraft(
      { type: 'food', highlights: ['Bund', ' ', 'Yu Garden'], tags: [] },
      fields,
    )

    expect(summarizeSection(fields, draft)).toEqual([
      'Restauration',
      '2 points forts',
    ])
  })

  it('merges a time range into a single entry', () => {
    const fields = transportForm.fields.filter(
      (field) => field.section === 'schedule',
    )
    const draft = toDraft(
      { departureTime: '13:00', arrivalTime: '15:10', duration: '2h10' },
      fields,
    )

    expect(summarizeSection(fields, draft)).toEqual(['13:00 → 15:10', '2h10'])
  })

  it('shortens links to their domain and long texts with an ellipsis', () => {
    const fields: readonly EditField[] = [
      { key: 'bookingUrl', label: 'Lien', type: 'url' },
      { key: 'address', label: 'Adresse', type: 'address' },
    ]
    const draft = toDraft(
      {
        bookingUrl: 'https://www.trip.com/hotels/order?id=1',
        address: '6th Floor and 8th Floor, Building 1, Jianhua South Road',
      },
      fields,
    )

    const [link, address] = summarizeSection(fields, draft)
    expect(link).toBe('trip.com')
    expect(address.endsWith('…')).toBe(true)
    expect(address.length).toBeLessThanOrEqual(32)
  })

  it('caps the summary at four entries', () => {
    const fields: readonly EditField[] = ['a', 'b', 'c', 'd', 'e'].map(
      (key) => ({ key, label: key, type: 'text' as const }),
    )
    const draft = toDraft({ a: '1', b: '2', c: '3', d: '4', e: '5' }, fields)
    expect(summarizeSection(fields, draft)).toHaveLength(4)
  })
})

describe('countNights', () => {
  it('counts the nights between check-in and check-out', () => {
    expect(countNights('2026-05-13', '2026-05-16')).toBe(3)
  })

  it('crosses month boundaries', () => {
    expect(countNights('2026-05-30', '2026-06-02')).toBe(3)
  })

  it('is negative when the stay ends before it starts', () => {
    expect(countNights('2026-05-16', '2026-05-13')).toBe(-3)
  })

  it('returns null while a date is missing or unreadable', () => {
    expect(countNights('2026-05-13', '')).toBeNull()
    expect(countNights('13/05/2026', '2026-05-16')).toBeNull()
    expect(countNights(undefined, '2026-05-16')).toBeNull()
  })
})

describe('validateDraft with a date range', () => {
  const fields = accommodationForm.fields

  it('flags a check-out before the check-in', () => {
    const draft = toDraft(
      { name: 'Hôtel', checkIn: '2026-05-16', checkOut: '2026-05-13' },
      fields,
    )
    expect(validateDraft(fields, draft)).toEqual({
      checkOut: 'La date doit suivre « Arrivée »',
    })
  })

  it('accepts a same-day stay and incomplete ranges', () => {
    const sameDay = toDraft(
      { name: 'Hôtel', checkIn: '2026-05-13', checkOut: '2026-05-13' },
      fields,
    )
    const open = toDraft({ name: 'Hôtel', checkIn: '2026-05-13' }, fields)
    expect(validateDraft(fields, sameDay)).toEqual({})
    expect(validateDraft(fields, open)).toEqual({})
  })
})

describe('minutesBetween / formatMinutes', () => {
  it('measures a same-day trip', () => {
    expect(minutesBetween('13:00', '15:10')).toBe(130)
    expect(formatMinutes(130)).toBe('2h10')
  })

  it('reads an earlier arrival as the next day', () => {
    expect(minutesBetween('22:30', '06:15')).toBe(465)
  })

  it('ignores free-form times', () => {
    expect(minutesBetween('vers midi', '15:10')).toBeNull()
    expect(minutesBetween('25:00', '15:10')).toBeNull()
  })

  it('formats short and round durations', () => {
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(180)).toBe('3h')
    expect(formatMinutes(65)).toBe('1h05')
  })
})

describe('pricePerNight', () => {
  it('divides the stay price by the nights, rounded', () => {
    expect(pricePerNight('136', 3)).toBe(45)
    expect(pricePerNight('99,5', 2)).toBe(50)
  })

  it('returns null without nights or amount', () => {
    expect(pricePerNight('136', 0)).toBeNull()
    expect(pricePerNight('136', null)).toBeNull()
    expect(pricePerNight('', 3)).toBeNull()
  })
})

describe('formatShortDate / hostnameOf', () => {
  it('formats ISO dates in French', () => {
    expect(formatShortDate('2026-05-13')).toBe('13 mai')
    expect(formatShortDate('pas une date')).toBe('pas une date')
  })

  it('extracts a readable domain', () => {
    expect(hostnameOf('https://www.trip.com/x')).toBe('trip.com')
    expect(hostnameOf('pas un lien')).toBeNull()
  })
})
