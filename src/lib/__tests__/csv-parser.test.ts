import { describe, it, expect } from 'vitest'
import { parseCsv, exportCsv, CsvParseError } from '../csv-parser'
import type { TripData } from '@/hooks/use-trip-data'
import type { DayItinerary } from '../itinerary-data'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid CSV with one day row.
 * - dayNumber is optional — auto-derived from row position
 * - tripStartDate / tripEndDate are auto-derived from the day dates
 * - activities are encoded as a JSON array
 */
function buildCsv(
  extraHeaders: string[] = [],
  extraValues: string[] = [],
): string {
  const baseHeaders = ['date', 'city', 'title']
  const baseValues = ['2025-06-01', 'Paris', 'Arrivée à Paris']

  const headers = [...baseHeaders, ...extraHeaders]
  const values = [...baseValues, ...extraValues]

  return [headers.join(','), values.join(',')].join('\n')
}

/** Encode a JSON activities value safely for use in a CSV field. */
function jsonActivities(activities: Record<string, unknown>[]): string {
  // Wrap in double-quotes, escaping inner double-quotes as ""
  return `"${JSON.stringify(activities).replace(/"/g, '""')}"`
}

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------

describe('parseCsv – basic parsing', () => {
  it('derives tripStartDate and tripEndDate from first/last day', () => {
    const csv = buildCsv()
    const result = parseCsv(csv)

    // Derived from the single day's date
    expect(result.tripStartDate).toBe('2025-06-01')
    expect(result.tripEndDate).toBe('2025-06-01')
    expect(result.itinerary).toHaveLength(1)

    const day = result.itinerary[0]
    expect(day.date).toBe('2025-06-01')
    expect(day.city).toBe('Paris')
    expect(day.title).toBe('Arrivée à Paris')
    expect(day.activities).toEqual([])
  })

  it('derives start/end from first and last day when multiple days are present', () => {
    const csv = [
      'date,city,title',
      '2025-06-01,Paris,Jour 1',
      '2025-06-02,Lyon,Jour 2',
      '2025-06-10,Marseille,Jour 3',
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.tripStartDate).toBe('2025-06-01')
    expect(result.tripEndDate).toBe('2025-06-10')
  })

  it('auto-derives dayNumber from row position when the column is absent', () => {
    const csv = [
      'date,city,title',
      '2025-06-01,Paris,Jour 1',
      '2025-06-02,Lyon,Jour 2',
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.itinerary[0].dayNumber).toBe(1)
    expect(result.itinerary[1].dayNumber).toBe(2)
  })

  it('uses explicit dayNumber when provided', () => {
    const csv = [
      'date,dayNumber,city,title',
      '2025-06-01,5,Paris,Jour 5',
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.itinerary[0].dayNumber).toBe(5)
  })

  it('assigns a source of "import" to each day', () => {
    const result = parseCsv(buildCsv())
    expect(result.itinerary[0].source).toBe('import')
  })

  it('generates sequential ids', () => {
    const csv = [
      'date,city,title',
      '2025-06-01,Paris,Jour 1',
      '2025-06-02,Lyon,Jour 2',
    ].join('\n')

    const result = parseCsv(csv)
    expect(result.itinerary[0].id).toBe('day-1')
    expect(result.itinerary[1].id).toBe('day-2')
  })

  it('normalises Windows (CRLF) line endings', () => {
    const csv = buildCsv().split('\n').join('\r\n')
    const result = parseCsv(csv)
    expect(result.itinerary).toHaveLength(1)
  })

  it('ignores blank lines', () => {
    const csv = 'date,city,title\n\n2025-06-01,Paris,Arrivée\n\n'
    const result = parseCsv(csv)
    expect(result.itinerary).toHaveLength(1)
  })

  it('parses multiple days in order', () => {
    const csv = [
      'date,city,title',
      '2025-06-01,Paris,Jour 1',
      '2025-06-02,Lyon,Jour 2',
      '2025-06-03,Marseille,Jour 3',
    ].join('\n')

    const result = parseCsv(csv)
    expect(result.itinerary).toHaveLength(3)
    expect(result.itinerary[2].city).toBe('Marseille')
  })
})

// ---------------------------------------------------------------------------
// RFC 4180 quoted fields
// ---------------------------------------------------------------------------

describe('parseCsv – quoted fields', () => {
  it('handles quoted fields containing commas', () => {
    const csv =
      'date,city,title\n' + '2025-06-01,Paris,"Arrivée, installation"'
    const result = parseCsv(csv)
    expect(result.itinerary[0].title).toBe('Arrivée, installation')
  })

  it('handles escaped double-quotes inside quoted fields', () => {
    const csv =
      'date,city,title,notes\n' +
      '2025-06-01,Paris,Jour 1,"Hôtel ""La Paix"""'
    const result = parseCsv(csv)
    expect(result.itinerary[0].notes).toBe('Hôtel "La Paix"')
  })
})

// ---------------------------------------------------------------------------
// Optional day fields
// ---------------------------------------------------------------------------

describe('parseCsv – optional day fields', () => {
  it('parses coordinates from lat|lon format', () => {
    const csv = buildCsv(['coordinates'], ['48.8566|2.3522'])
    const result = parseCsv(csv)
    expect(result.itinerary[0].coordinates).toEqual([48.8566, 2.3522])
  })

  it('uses [0, 0] when coordinates are absent', () => {
    const csv = buildCsv()
    const result = parseCsv(csv)
    expect(result.itinerary[0].coordinates).toEqual([0, 0])
  })

  it('uses [0, 0] for malformed coordinates', () => {
    const csv = buildCsv(['coordinates'], ['notacoord'])
    const result = parseCsv(csv)
    expect(result.itinerary[0].coordinates).toEqual([0, 0])
  })

  it('parses notes', () => {
    const csv = buildCsv(['notes'], ['Belle journée'])
    expect(parseCsv(csv).itinerary[0].notes).toBe('Belle journée')
  })

  it('parses walkingDistance', () => {
    const csv = buildCsv(['walkingDistance'], ['12 km'])
    expect(parseCsv(csv).itinerary[0].walkingDistance).toBe('12 km')
  })

  it('parses dayType', () => {
    const csv = buildCsv(['dayType'], ['arrival'])
    expect(parseCsv(csv).itinerary[0].dayType).toBe('arrival')
  })

  it('parses highlights as pipe-separated array', () => {
    const csv = buildCsv(['highlights'], ['Tour Eiffel|Louvre|Montmartre'])
    expect(parseCsv(csv).itinerary[0].highlights).toEqual([
      'Tour Eiffel',
      'Louvre',
      'Montmartre',
    ])
  })

  it('parses foodRecommendations as pipe-separated array', () => {
    const csv = buildCsv(['foodRecommendations'], ['Croissant|Baguette'])
    expect(parseCsv(csv).itinerary[0].foodRecommendations).toEqual([
      'Croissant',
      'Baguette',
    ])
  })

  it('parses packingTips as pipe-separated array', () => {
    const csv = buildCsv(['packingTips'], ['Parapluie|Crème solaire'])
    expect(parseCsv(csv).itinerary[0].packingTips).toEqual([
      'Parapluie',
      'Crème solaire',
    ])
  })

  it('parses tips as pipe-separated array', () => {
    const csv = buildCsv(['tips'], ["Réserver à l'avance|Arriver tôt"])
    expect(parseCsv(csv).itinerary[0].tips).toEqual([
      "Réserver à l'avance",
      'Arriver tôt',
    ])
  })

  it('omits undefined optional fields when values are empty', () => {
    const csv = buildCsv(['notes', 'walkingDistance'], ['', ''])
    const day = parseCsv(csv).itinerary[0]
    expect(day.notes).toBeUndefined()
    expect(day.walkingDistance).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Activities — JSON format (primary)
// ---------------------------------------------------------------------------

describe('parseCsv – activities (JSON format)', () => {
  it('parses a single activity from a JSON array', () => {
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([{ name: 'Tour Eiffel', type: 'visit', duration: '2h' }])}`,
    ].join('\n')
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities).toHaveLength(1)
    expect(activities[0].name).toBe('Tour Eiffel')
    expect(activities[0].type).toBe('visit')
    expect(activities[0].duration).toBe('2h')
  })

  it('parses multiple activities from a JSON array', () => {
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([
        { name: 'Tour Eiffel', type: 'visit', duration: '2h' },
        { name: 'Déjeuner', type: 'food', duration: '1h' },
      ])}`,
    ].join('\n')
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities).toHaveLength(2)
    expect(activities[1].type).toBe('food')
  })

  it('defaults to "visit" for unknown activity types', () => {
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([{ name: 'Musée', type: 'unknown' }])}`,
    ].join('\n')
    expect(parseCsv(csv).itinerary[0].activities[0].type).toBe('visit')
  })

  it('accepts all valid activity types', () => {
    const types = ['visit', 'transport', 'food', 'experience', 'shopping']
    for (const type of types) {
      const csv = [
        'date,city,title,activities',
        `2025-06-01,Paris,Arrivée,${jsonActivities([{ name: 'Act', type }])}`,
      ].join('\n')
      expect(parseCsv(csv).itinerary[0].activities[0].type).toBe(type)
    }
  })

  it('parses all extended activity fields', () => {
    const actObj = {
      name: 'Louvre',
      type: 'visit',
      duration: '3h',
      description: 'Musée',
      address: 'Rue de Rivoli, Paris',
      bookingUrl: 'https://louvre.fr',
      price: 17,
      currency: 'EUR',
      rating: 4.5,
      status: 'done',
      openAt: '09:00–18:00',
      tips: 'Arriver tôt',
    }
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([actObj])}`,
    ].join('\n')
    const a = parseCsv(csv).itinerary[0].activities[0]
    expect(a.description).toBe('Musée')
    expect(a.address).toBe('Rue de Rivoli, Paris')
    expect(a.bookingUrl).toBe('https://louvre.fr')
    expect(a.price).toBe(17)
    expect(a.currency).toBe('EUR')
    expect(a.rating).toBe(4.5)
    expect(a.status).toBe('done')
    expect(a.openAt).toBe('09:00–18:00')
    expect(a.tips).toBe('Arriver tôt')
  })

  it('ignores unknown status values', () => {
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([{ name: 'Act', type: 'visit', status: 'bad' }])}`,
    ].join('\n')
    expect(parseCsv(csv).itinerary[0].activities[0].status).toBeUndefined()
  })

  it('assigns source "import" to each activity', () => {
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([{ name: 'Tour Eiffel', type: 'visit' }])}`,
    ].join('\n')
    expect(parseCsv(csv).itinerary[0].activities[0].source).toBe('import')
  })

  it('returns an empty array when the column is absent', () => {
    const csv = buildCsv()
    expect(parseCsv(csv).itinerary[0].activities).toEqual([])
  })

  it('returns an empty array for an empty activities cell', () => {
    const csv = buildCsv(['activities'], [''])
    expect(parseCsv(csv).itinerary[0].activities).toEqual([])
  })

  it('returns an empty array for an empty JSON array', () => {
    const csv = [
      'date,city,title,activities',
      `2025-06-01,Paris,Arrivée,${jsonActivities([])}`,
    ].join('\n')
    expect(parseCsv(csv).itinerary[0].activities).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Activities — legacy pipe format (backward compatibility)
// ---------------------------------------------------------------------------

describe('parseCsv – activities (legacy pipe format)', () => {
  it('parses a single activity from legacy pipe format', () => {
    const csv = buildCsv(['activities'], ['Tour Eiffel|visit|2h'])
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities).toHaveLength(1)
    expect(activities[0].name).toBe('Tour Eiffel')
    expect(activities[0].type).toBe('visit')
    expect(activities[0].duration).toBe('2h')
  })

  it('parses multiple activities from legacy pipe format (semicolon-separated)', () => {
    const csv = buildCsv(
      ['activities'],
      ['Tour Eiffel|visit|2h;Déjeuner|food|1h30'],
    )
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities).toHaveLength(2)
    expect(activities[0].name).toBe('Tour Eiffel')
    expect(activities[1].type).toBe('food')
  })

  it('defaults to "visit" for unknown types in legacy format', () => {
    const csv = buildCsv(['activities'], ['Musée|unknown-type|1h'])
    expect(parseCsv(csv).itinerary[0].activities[0].type).toBe('visit')
  })
})

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------

describe('parseCsv – accommodation', () => {
  it('parses accommodation when accommodationName is provided', () => {
    const csv = buildCsv(
      [
        'accommodationName',
        'accommodationAddress',
        'accommodationCheckIn',
        'accommodationCheckOut',
        'accommodationBookingUrl',
      ],
      [
        'Hôtel de la Paix',
        '10 Rue de la Paix',
        '15:00',
        '11:00',
        'https://booking.com/test',
      ],
    )
    const acc = parseCsv(csv).itinerary[0].accommodation
    expect(acc).toBeDefined()
    expect(acc!.name).toBe('Hôtel de la Paix')
    expect(acc!.address).toBe('10 Rue de la Paix')
    expect(acc!.checkIn).toBe('15:00')
    expect(acc!.checkOut).toBe('11:00')
    expect(acc!.bookingUrl).toBe('https://booking.com/test')
    expect(acc!.source).toBe('import')
  })

  it('omits accommodation when accommodationName is absent', () => {
    const csv = buildCsv()
    expect(parseCsv(csv).itinerary[0].accommodation).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

describe('parseCsv – transport', () => {
  it('parses transport when transportType is provided', () => {
    const csv = buildCsv(
      [
        'transportType',
        'transportFrom',
        'transportTo',
        'transportDetails',
        'transportDepartureTime',
        'transportArrivalTime',
      ],
      [
        'train',
        'Paris Gare de Lyon',
        'Lyon Part-Dieu',
        'TGV 6607',
        '08:30',
        '10:00',
      ],
    )
    const transport = parseCsv(csv).itinerary[0].transport
    expect(transport).toBeDefined()
    expect(transport!.type).toBe('train')
    expect(transport!.from).toBe('Paris Gare de Lyon')
    expect(transport!.to).toBe('Lyon Part-Dieu')
    expect(transport!.details).toBe('TGV 6607')
    expect(transport!.departureTime).toBe('08:30')
    expect(transport!.arrivalTime).toBe('10:00')
    expect(transport!.source).toBe('import')
  })

  it('defaults to "car" for unknown transport types', () => {
    const csv = buildCsv(['transportType'], ['helicopter'])
    expect(parseCsv(csv).itinerary[0].transport!.type).toBe('car')
  })

  it('accepts all valid transport types', () => {
    const types = ['train', 'car', 'plane', 'bus']
    for (const type of types) {
      const csv = buildCsv(['transportType'], [type])
      expect(parseCsv(csv).itinerary[0].transport!.type).toBe(type)
    }
  })

  it('omits transport when transportType is absent', () => {
    const csv = buildCsv()
    expect(parseCsv(csv).itinerary[0].transport).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('parseCsv – error handling', () => {
  it('throws CsvParseError when the file has only one line', () => {
    expect(() => parseCsv('date,city,title')).toThrow(CsvParseError)
  })

  it('throws CsvParseError when the file is empty', () => {
    expect(() => parseCsv('')).toThrow(CsvParseError)
  })

  it('throws CsvParseError when "date" column is missing from a row', () => {
    const csv = 'city,title\nParis,Arrivée'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('throws CsvParseError when "city" column is missing', () => {
    const csv = 'date,title\n2025-06-01,Arrivée'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('throws CsvParseError when "title" column is missing', () => {
    const csv = 'date,city\n2025-06-01,Paris'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('throws CsvParseError when dayNumber is present but not an integer', () => {
    const csv = 'date,dayNumber,city,title\n2025-06-01,abc,Paris,Arrivée'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('CsvParseError has name "CsvParseError"', () => {
    try {
      parseCsv('')
    } catch (err) {
      expect((err as Error).name).toBe('CsvParseError')
    }
  })
})

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe('exportCsv', () => {
  const minimalData: TripData = {
    tripStartDate: '2025-06-01',
    tripEndDate: '2025-06-02',
    itinerary: [
      {
        id: 'day-1',
        date: '2025-06-01',
        dayNumber: 1,
        city: 'Paris',
        title: 'Arrivée à Paris',
        coordinates: [48.8566, 2.3522],
        activities: [],
      } as DayItinerary,
      {
        id: 'day-2',
        date: '2025-06-02',
        dayNumber: 2,
        city: 'Lyon',
        title: 'Journée Lyon',
        coordinates: [45.764, 4.8357],
        activities: [],
      } as DayItinerary,
    ],
  }

  it('returns a string with a header row and one row per day', () => {
    const csv = exportCsv(minimalData)
    const lines = csv.split('\n')
    // header + 2 data rows
    expect(lines).toHaveLength(3)
  })

  it('includes the standard column headers (no dayNumber, no tripDates)', () => {
    const headerLine = exportCsv(minimalData).split('\n')[0]
    expect(headerLine).toContain('date')
    expect(headerLine).toContain('city')
    expect(headerLine).toContain('activities')
    expect(headerLine).toContain('transportType')
    // auto-derived columns are NOT included
    expect(headerLine).not.toContain('dayNumber')
    expect(headerLine).not.toContain('tripStartDate')
    expect(headerLine).not.toContain('tripEndDate')
  })

  it('round-trips through parseCsv correctly', () => {
    const csv = exportCsv(minimalData)
    const parsed = parseCsv(csv)
    expect(parsed.itinerary).toHaveLength(2)
    expect(parsed.itinerary[0].date).toBe('2025-06-01')
    expect(parsed.itinerary[1].city).toBe('Lyon')
    // trip dates derived from first/last day
    expect(parsed.tripStartDate).toBe('2025-06-01')
    expect(parsed.tripEndDate).toBe('2025-06-02')
  })

  it('serialises coordinates as lat|lon', () => {
    const csv = exportCsv(minimalData)
    expect(csv).toContain('48.8566|2.3522')
  })

  it('wraps fields containing commas in double-quotes', () => {
    const data: TripData = {
      ...minimalData,
      itinerary: [
        {
          ...minimalData.itinerary[0],
          title: 'Arrivée, visite',
          activities: [],
        },
      ],
    }
    const csv = exportCsv(data)
    expect(csv).toContain('"Arrivée, visite"')
  })

  it('serialises pipe-separated list fields', () => {
    const data: TripData = {
      ...minimalData,
      itinerary: [
        {
          ...minimalData.itinerary[0],
          highlights: ['Tour Eiffel', 'Louvre'],
          activities: [],
        },
      ],
    }
    const csv = exportCsv(data)
    expect(csv).toContain('Tour Eiffel|Louvre')
  })

  it('serialises activities as a JSON array in the CSV cell', () => {
    const data: TripData = {
      ...minimalData,
      itinerary: [
        {
          ...minimalData.itinerary[0],
          activities: [
            {
              id: 'a1',
              name: 'Tour Eiffel',
              type: 'visit',
              duration: '2h',
              price: 29.9,
              currency: 'EUR',
              status: 'done',
            },
          ],
        },
      ],
    }
    const csv = exportCsv(data)
    // The activities cell must contain JSON (double-quotes escaped as "")
    expect(csv).toContain('Tour Eiffel')
    expect(csv).toContain('visit')
    // Round-trip check
    const parsed = parseCsv(csv)
    const a = parsed.itinerary[0].activities[0]
    expect(a.name).toBe('Tour Eiffel')
    expect(a.type).toBe('visit')
    expect(a.duration).toBe('2h')
    expect(a.price).toBe(29.9)
    expect(a.currency).toBe('EUR')
    expect(a.status).toBe('done')
  })

  it('omits the activities cell when there are no activities', () => {
    const csv = exportCsv(minimalData)
    // No JSON brackets should appear when activities is empty
    const dataLine = csv.split('\n')[1]
    expect(dataLine).not.toContain('[')
  })
})

// ---------------------------------------------------------------------------
// Full round-trip integration test
// ---------------------------------------------------------------------------

describe('parseCsv – integration', () => {
  it('parses a rich two-day itinerary correctly', () => {
    const csv = [
      'date,city,title,coordinates,notes,highlights,activities,accommodationName,transportType,transportFrom,transportTo',
      `2025-06-01,Paris,Arrivée à Paris,48.8566|2.3522,Première journée,Tour Eiffel|Champs-Élysées,${jsonActivities([{ name: 'Tour Eiffel', type: 'visit', duration: '2h' }, { name: 'Dîner', type: 'food', duration: '1h' }])},Hôtel Lumière,train,CDG,Paris Gare du Nord`,
      `2025-06-02,Paris,Journée musées,48.8566|2.3522,,Louvre|Orsay,${jsonActivities([{ name: 'Louvre', type: 'visit', duration: '4h' }, { name: 'Orsay', type: 'visit', duration: '2h' }])},Hôtel Lumière,,`,
    ].join('\n')

    const result: TripData = parseCsv(csv)

    // Trip dates derived from first/last day
    expect(result.tripStartDate).toBe('2025-06-01')
    expect(result.tripEndDate).toBe('2025-06-02')
    expect(result.itinerary).toHaveLength(2)

    const day1 = result.itinerary[0]
    expect(day1.city).toBe('Paris')
    expect(day1.coordinates).toEqual([48.8566, 2.3522])
    expect(day1.highlights).toEqual(['Tour Eiffel', 'Champs-Élysées'])
    expect(day1.activities).toHaveLength(2)
    expect(day1.accommodation?.name).toBe('Hôtel Lumière')
    expect(day1.transport?.type).toBe('train')
    expect(day1.transport?.from).toBe('CDG')

    const day2 = result.itinerary[1]
    expect(day2.activities).toHaveLength(2)
    expect(day2.transport).toBeUndefined()
  })
})

