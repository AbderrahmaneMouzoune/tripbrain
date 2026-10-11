import type { DayItinerary } from '@/lib/itinerary-data'
import {
  currentDayIndex,
  daysUntil,
  deriveTripTitle,
  pickDefaultTrip,
  sortTripSummaries,
  summarizeTrip,
  tripCities,
  tripStatus,
  type StoredTrip,
} from '@/lib/trips'

function day(date: string, city: string): DayItinerary {
  return {
    id: `day-${date}`,
    date,
    dayNumber: 1,
    city,
    title: city,
    activities: [],
    coordinates: [0, 0],
  }
}

function trip(id: string, days: DayItinerary[]): StoredTrip {
  return {
    id,
    title: id,
    itinerary: days,
    source: 'json',
    createdAt: 0,
    updatedAt: 0,
  }
}

const today = new Date(2026, 4, 14)

describe('tripCities', () => {
  it('garde l’ordre du voyage sans répéter une ville', () => {
    const days = [
      day('2026-05-10', 'Shanghai'),
      day('2026-05-11', 'Shanghai'),
      day('2026-05-12', 'Pékin'),
      day('2026-05-13', 'Shanghai'),
    ]
    expect(tripCities(days)).toEqual(['Shanghai', 'Pékin'])
  })
})

describe('deriveTripTitle', () => {
  it('nomme le voyage d’après ses étapes', () => {
    expect(deriveTripTitle([])).toBe('Mon voyage')
    expect(deriveTripTitle([day('2026-05-10', 'Lisbonne')])).toBe('Lisbonne')
    expect(
      deriveTripTitle([day('2026-05-10', 'Tokyo'), day('2026-05-11', 'Kyoto')]),
    ).toBe('Tokyo et Kyoto')
    expect(
      deriveTripTitle(
        ['A', 'B', 'C', 'D', 'E'].map((city, index) =>
          day(`2026-05-1${index}`, city),
        ),
      ),
    ).toBe('A, B et 3 autres villes')
  })
})

describe('tripStatus', () => {
  const days = [day('2026-05-10', 'A'), day('2026-05-29', 'B')]
  it('distingue avant, pendant et après', () => {
    expect(tripStatus(days, new Date(2026, 4, 1))).toBe('upcoming')
    expect(tripStatus(days, today)).toBe('ongoing')
    expect(tripStatus(days, new Date(2026, 4, 29))).toBe('ongoing')
    expect(tripStatus(days, new Date(2026, 5, 2))).toBe('past')
  })
})

describe('currentDayIndex', () => {
  const days = [
    day('2026-05-13', 'A'),
    day('2026-05-14', 'B'),
    day('2026-05-15', 'C'),
  ]
  it('se place sur la journée du jour, sinon sur un bord', () => {
    expect(currentDayIndex(days, today)).toBe(1)
    expect(currentDayIndex(days, new Date(2026, 4, 1))).toBe(0)
    expect(currentDayIndex(days, new Date(2026, 5, 1))).toBe(2)
    expect(currentDayIndex([], today)).toBe(0)
  })
})

describe('daysUntil', () => {
  it('compte les jours entiers sans se soucier de l’heure', () => {
    expect(daysUntil('2026-05-26', new Date(2026, 4, 14, 23, 30))).toBe(12)
    expect(daysUntil('2026-05-10', today)).toBe(-4)
  })
})

describe('sortTripSummaries / pickDefaultTrip', () => {
  const past = summarizeTrip(
    trip('past', [day('2025-10-01', 'Lisbonne')]),
    today,
  )
  const soon = summarizeTrip(trip('soon', [day('2026-06-01', 'Rome')]), today)
  const later = summarizeTrip(
    trip('later', [day('2027-04-12', 'Tokyo')]),
    today,
  )
  const now = summarizeTrip(
    trip('now', [day('2026-05-10', 'Shanghai'), day('2026-05-29', 'Paris')]),
    today,
  )

  it('met le voyage en cours d’abord, puis les prochains, puis les passés', () => {
    expect(
      sortTripSummaries([past, later, now, soon]).map((t) => t.id),
    ).toEqual(['now', 'soon', 'later', 'past'])
  })

  it('ouvre le voyage en cours, sinon le prochain', () => {
    expect(pickDefaultTrip([past, later, now])).toBe('now')
    expect(pickDefaultTrip([past, later])).toBe('later')
    expect(pickDefaultTrip([past])).toBe('past')
    expect(pickDefaultTrip([])).toBeNull()
  })
})
