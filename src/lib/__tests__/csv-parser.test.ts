import { describe, it, expect } from 'vitest'
import { parseCsv, exportCsv, CsvParseError } from '../csv-parser'
import type { TripData } from '@/hooks/use-trip-data'
import type { DayItinerary } from '../itinerary-data'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid CSV with one day row.
 * tripStartDate / tripEndDate are no longer CSV columns — they are always
 * derived from the first and last day's `date` field.
 */
function buildCsv(
  extraHeaders: string[] = [],
  extraValues: string[] = [],
): string {
  const baseHeaders = ['date', 'dayNumber', 'city', 'title']
  const baseValues = ['2025-06-01', '1', 'Paris', 'Arrivée à Paris']

  const headers = [...baseHeaders, ...extraHeaders]
  const values = [...baseValues, ...extraValues]

  return [headers.join(','), values.join(',')].join('\n')
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
    expect(day.dayNumber).toBe(1)
    expect(day.city).toBe('Paris')
    expect(day.title).toBe('Arrivée à Paris')
    expect(day.activities).toEqual([])
  })

  it('derives start/end from first and last day when multiple days are present', () => {
    const csv = [
      'date,dayNumber,city,title',
      '2025-06-01,1,Paris,Jour 1',
      '2025-06-02,2,Lyon,Jour 2',
      '2025-06-10,3,Marseille,Jour 3',
    ].join('\n')
    const result = parseCsv(csv)
    expect(result.tripStartDate).toBe('2025-06-01')
    expect(result.tripEndDate).toBe('2025-06-10')
  })

  it('assigns a source of "import" to each day', () => {
    const result = parseCsv(buildCsv())
    expect(result.itinerary[0].source).toBe('import')
  })

  it('generates sequential ids', () => {
    const csv = [
      'date,dayNumber,city,title',
      '2025-06-01,1,Paris,Jour 1',
      '2025-06-02,2,Lyon,Jour 2',
    ].join('\n')

    const result = parseCsv(csv)
    expect(result.itinerary[0].id).toBe('day-1')
    expect(result.itinerary[1].id).toBe('day-2')
  })

  it('normalises Windows (CRLF) line endings', () => {
    const csv = buildCsv()
      .split('\n')
      .join('\r\n')
    const result = parseCsv(csv)
    expect(result.itinerary).toHaveLength(1)
  })

  it('ignores blank lines', () => {
    const csv = 'date,dayNumber,city,title\n\n2025-06-01,1,Paris,Arrivée\n\n'
    const result = parseCsv(csv)
    expect(result.itinerary).toHaveLength(1)
  })

  it('parses multiple days in order', () => {
    const csv = [
      'date,dayNumber,city,title',
      '2025-06-01,1,Paris,Jour 1',
      '2025-06-02,2,Lyon,Jour 2',
      '2025-06-03,3,Marseille,Jour 3',
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
      'date,dayNumber,city,title\n' +
      '2025-06-01,1,Paris,"Arrivée, installation"'
    const result = parseCsv(csv)
    expect(result.itinerary[0].title).toBe('Arrivée, installation')
  })

  it('handles escaped double-quotes inside quoted fields', () => {
    const csv =
      'date,dayNumber,city,title,notes\n' +
      '2025-06-01,1,Paris,Jour 1,"Hôtel ""La Paix"""'
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
// Activities — basic
// ---------------------------------------------------------------------------

describe('parseCsv – activities (basic)', () => {
  it('parses a single activity with name, type and duration', () => {
    const csv = buildCsv(['activities'], ['Tour Eiffel|visit|2h'])
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities).toHaveLength(1)
    expect(activities[0].name).toBe('Tour Eiffel')
    expect(activities[0].type).toBe('visit')
    expect(activities[0].duration).toBe('2h')
  })

  it('parses multiple activities separated by semicolons', () => {
    const csv = buildCsv(
      ['activities'],
      ['Tour Eiffel|visit|2h;Déjeuner|food|1h30;Shopping|shopping|'],
    )
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities).toHaveLength(3)
    expect(activities[1].type).toBe('food')
    expect(activities[2].type).toBe('shopping')
  })

  it('defaults to "visit" for unknown activity types', () => {
    const csv = buildCsv(['activities'], ['Musée|unknown-type|1h'])
    const activities = parseCsv(csv).itinerary[0].activities
    expect(activities[0].type).toBe('visit')
  })

  it('accepts all valid activity types', () => {
    const types = ['visit', 'transport', 'food', 'experience', 'shopping']
    for (const type of types) {
      const csv = buildCsv(['activities'], [`Act|${type}|1h`])
      expect(parseCsv(csv).itinerary[0].activities[0].type).toBe(type)
    }
  })

  it('omits duration when not provided', () => {
    const csv = buildCsv(['activities'], ['Promenade|visit|'])
    const activity = parseCsv(csv).itinerary[0].activities[0]
    expect(activity.duration).toBeUndefined()
  })

  it('assigns source "import" to each activity', () => {
    const csv = buildCsv(['activities'], ['Tour Eiffel|visit|2h'])
    expect(parseCsv(csv).itinerary[0].activities[0].source).toBe('import')
  })

  it('returns an empty activities array when the column is absent', () => {
    const csv = buildCsv()
    expect(parseCsv(csv).itinerary[0].activities).toEqual([])
  })

  it('ignores empty activity tokens', () => {
    const csv = buildCsv(['activities'], [''])
    expect(parseCsv(csv).itinerary[0].activities).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Activities — extended fields
// ---------------------------------------------------------------------------

describe('parseCsv – activities (extended fields)', () => {
  it('parses address (field 4)', () => {
    // address contains a comma, so the activities field must be quoted
    const csv = [
      'date,dayNumber,city,title,activities',
      '2025-06-01,1,Paris,Arrivée à Paris,"Louvre|visit|3h||Rue de Rivoli, Paris"',
    ].join('\n')
    expect(parseCsv(csv).itinerary[0].activities[0].address).toBe(
      'Rue de Rivoli, Paris',
    )
  })

  it('parses bookingUrl (field 5)', () => {
    const csv = buildCsv(
      ['activities'],
      ['Louvre|visit|3h|||https://louvre.fr'],
    )
    expect(parseCsv(csv).itinerary[0].activities[0].bookingUrl).toBe(
      'https://louvre.fr',
    )
  })

  it('parses price as a number (field 6)', () => {
    const csv = buildCsv(
      ['activities'],
      ['Louvre|visit|3h||||17'],
    )
    expect(parseCsv(csv).itinerary[0].activities[0].price).toBe(17)
  })

  it('parses currency (field 7)', () => {
    const csv = buildCsv(
      ['activities'],
      ['Louvre|visit|3h||||17|EUR'],
    )
    expect(parseCsv(csv).itinerary[0].activities[0].currency).toBe('EUR')
  })

  it('parses rating as a number (field 8)', () => {
    // 6 pipes after '3h' puts 4.5 at index 8 (rating)
    const csv = buildCsv(
      ['activities'],
      ['Louvre|visit|3h||||||4.5'],
    )
    expect(parseCsv(csv).itinerary[0].activities[0].rating).toBe(4.5)
  })

  it('parses status (field 9)', () => {
    // 8 pipes after 'visit' puts status at index 9
    const types = ['planned', 'done', 'skipped']
    for (const status of types) {
      const csv = buildCsv(['activities'], [`Act|visit||||||||${status}`])
      expect(parseCsv(csv).itinerary[0].activities[0].status).toBe(status)
    }
  })

  it('ignores unknown status values', () => {
    const csv = buildCsv(['activities'], ['Act|visit||||||||bad-status'])
    expect(parseCsv(csv).itinerary[0].activities[0].status).toBeUndefined()
  })

  it('parses openAt (field 10)', () => {
    // 9 pipes after 'visit' puts value at index 10 (openAt)
    const csv = buildCsv(
      ['activities'],
      ['Louvre|visit|||||||||09:00–18:00'],
    )
    expect(parseCsv(csv).itinerary[0].activities[0].openAt).toBe('09:00–18:00')
  })

  it('parses tips (field 11)', () => {
    // 8 pipes → status(9), then openAt(10), then tips(11)
    const csv = buildCsv(
      ['activities'],
      ['Louvre|visit||||||||planned|09:00–18:00|Arriver tôt'],
    )
    expect(parseCsv(csv).itinerary[0].activities[0].tips).toBe('Arriver tôt')
  })

  it('trims trailing empty fields from activity token', () => {
    // Only name, type, duration provided — no excess pipes expected in output
    const csv = buildCsv(['activities'], ['Promenade|visit|2h'])
    const a = parseCsv(csv).itinerary[0].activities[0]
    expect(a.description).toBeUndefined()
    expect(a.address).toBeUndefined()
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
      ['train', 'Paris Gare de Lyon', 'Lyon Part-Dieu', 'TGV 6607', '08:30', '10:00'],
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
    expect(() => parseCsv('date,dayNumber,city,title')).toThrow(CsvParseError)
  })

  it('throws CsvParseError when the file is empty', () => {
    expect(() => parseCsv('')).toThrow(CsvParseError)
  })

  it('throws CsvParseError when "date" column is missing from a row', () => {
    const csv = 'dayNumber,city,title\n1,Paris,Arrivée'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('throws CsvParseError when "city" column is missing', () => {
    const csv = 'date,dayNumber,title\n2025-06-01,1,Arrivée'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('throws CsvParseError when "title" column is missing', () => {
    const csv = 'date,dayNumber,city\n2025-06-01,1,Paris'
    expect(() => parseCsv(csv)).toThrow(CsvParseError)
  })

  it('throws CsvParseError when dayNumber is not an integer', () => {
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

  it('includes the standard column headers', () => {
    const headerLine = exportCsv(minimalData).split('\n')[0]
    expect(headerLine).toContain('date')
    expect(headerLine).toContain('city')
    expect(headerLine).toContain('activities')
    expect(headerLine).toContain('transportType')
    // trip dates are NOT columns — derived on import
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

  it('serialises activities with extended fields', () => {
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
              description: 'Monument',
              address: 'Champ de Mars',
              price: 29.9,
              currency: 'EUR',
              rating: 4.5,
              status: 'planned',
              openAt: '09:00–18:00',
              tips: 'Arriver tôt',
            },
          ],
        },
      ],
    }
    const csv = exportCsv(data)
    // Should contain all extended fields
    expect(csv).toContain('Tour Eiffel|visit|2h|Monument|Champ de Mars||29.9|EUR|4.5|planned|09:00–18:00|Arriver tôt')
  })

  it('trims trailing empty fields from activity serialisation', () => {
    const data: TripData = {
      ...minimalData,
      itinerary: [
        {
          ...minimalData.itinerary[0],
          activities: [{ id: 'a1', name: 'Promenade', type: 'visit' }],
        },
      ],
    }
    const csv = exportCsv(data)
    // Should be just name|type, no trailing pipes
    expect(csv).toContain('Promenade|visit')
    // Should not have excessive trailing pipes
    const activityToken = csv
      .split('\n')[1]
      .split(',')
      .find((f) => f.includes('Promenade'))
    expect(activityToken).toBe('Promenade|visit')
  })

  it('round-trips activities through export then parse', () => {
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
    const parsed = parseCsv(csv)
    const activity = parsed.itinerary[0].activities[0]
    expect(activity.name).toBe('Tour Eiffel')
    expect(activity.type).toBe('visit')
    expect(activity.duration).toBe('2h')
    expect(activity.price).toBe(29.9)
    expect(activity.currency).toBe('EUR')
    expect(activity.status).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// Full round-trip integration test
// ---------------------------------------------------------------------------

describe('parseCsv – integration', () => {
  it('parses a rich two-day itinerary correctly', () => {
    const csv = [
      'date,dayNumber,city,title,coordinates,notes,highlights,activities,accommodationName,transportType,transportFrom,transportTo',
      '2025-06-01,1,Paris,Arrivée à Paris,48.8566|2.3522,Première journée,Tour Eiffel|Champs-Élysées,Tour Eiffel|visit|2h;Dîner|food|1h,Hôtel Lumière,train,CDG,Paris Gare du Nord',
      '2025-06-02,2,Paris,Journée musées,48.8566|2.3522,,Louvre|Orsay,Louvre|visit|4h;Orsay|visit|2h,Hôtel Lumière,,',
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

