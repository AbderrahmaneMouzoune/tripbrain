import type { TripData } from '@/hooks/use-trip-data'
import type { DayItinerary, Activity } from '@/lib/itinerary-data'

/**
 * CSV format for TripBrain import.
 *
 * Each row = one day in the itinerary.
 * Multi-value cells (highlights, tips) use "|" as separator.
 * Activities use ";" to separate activities, and "|" to separate fields
 * within each activity:  name|type|duration
 * tripStartDate & tripEndDate should appear on the first row.
 */

export const CSV_HEADERS = [
  'date',
  'dayNumber',
  'city',
  'title',
  'latitude',
  'longitude',
  'dayType',
  'highlights',
  'notes',
  'tips',
  'walkingDistance',
  'activities',
  'accommodation_name',
  'accommodation_address',
  'accommodation_checkIn',
  'accommodation_checkOut',
  'transport_type',
  'transport_from',
  'transport_to',
  'transport_details',
  'tripStartDate',
  'tripEndDate',
] as const

export type CsvHeader = (typeof CSV_HEADERS)[number]

/** Parse a CSV string produced by any spreadsheet app into TripData */
export function parseCsv(csvText: string): TripData {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error(
      "Le fichier CSV doit contenir au moins une ligne d'en-tête et une ligne de données.",
    )
  }

  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase())

  const get = (row: string[], key: CsvHeader): string => {
    const idx = headers.indexOf(key)
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }

  let tripStartDate = ''
  let tripEndDate = ''
  const itinerary: DayItinerary[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.every((c) => c.trim() === '')) continue

    // Pick up trip-level dates from the first row that has them
    if (!tripStartDate) {
      const sd = get(cells, 'tripStartDate')
      if (sd) tripStartDate = sd
    }
    if (!tripEndDate) {
      const ed = get(cells, 'tripEndDate')
      if (ed) tripEndDate = ed
    }

    const date = get(cells, 'date')
    const city = get(cells, 'city')
    const title = get(cells, 'title')

    if (!date || !city || !title) {
      throw new Error(
        `Ligne ${i + 1} : les champs "date", "city" et "title" sont obligatoires.`,
      )
    }

    const latStr = get(cells, 'latitude')
    const lngStr = get(cells, 'longitude')
    const lat = parseFloat(latStr)
    const lng = parseFloat(lngStr)

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(
        `Ligne ${i + 1} : "latitude" et "longitude" doivent être des nombres valides (ex. 48.8566 et 2.3522).`,
      )
    }

    const dayNumberStr = get(cells, 'dayNumber')
    const dayNumber = parseInt(dayNumberStr, 10)
    if (isNaN(dayNumber)) {
      throw new Error(`Ligne ${i + 1} : "dayNumber" doit être un entier.`)
    }

    // Multi-value fields
    const highlights = splitPipe(get(cells, 'highlights'))
    const tips = splitPipe(get(cells, 'tips'))

    // Activities: "name|type|duration;name2|type2|duration2"
    const activities = parseActivities(get(cells, 'activities'), i + 1)

    // Accommodation (optional)
    const accName = get(cells, 'accommodation_name')
    const accommodation =
      accName
        ? {
            name: accName,
            address: get(cells, 'accommodation_address'),
            bookingUrl: '',
            checkIn: get(cells, 'accommodation_checkIn'),
            checkOut: get(cells, 'accommodation_checkOut'),
          }
        : undefined

    // Transport (optional)
    const transportType = get(cells, 'transport_type') as
      | 'train'
      | 'car'
      | 'plane'
      | 'bus'
      | ''
    const transport =
      transportType
        ? {
            type: transportType,
            from: get(cells, 'transport_from') || undefined,
            to: get(cells, 'transport_to') || undefined,
            details: get(cells, 'transport_details') || undefined,
          }
        : undefined

    const day: DayItinerary = {
      date,
      dayNumber,
      city,
      title,
      coordinates: [lat, lng],
      activities,
      ...(get(cells, 'dayType') && { dayType: get(cells, 'dayType') }),
      ...(highlights.length && { highlights }),
      ...(get(cells, 'notes') && { notes: get(cells, 'notes') }),
      ...(tips.length && { tips }),
      ...(get(cells, 'walkingDistance') && {
        walkingDistance: get(cells, 'walkingDistance'),
      }),
      ...(accommodation && { accommodation }),
      ...(transport && { transport }),
    }

    itinerary.push(day)
  }

  if (itinerary.length === 0) {
    throw new Error('Aucune journée valide trouvée dans le fichier CSV.')
  }

  if (!tripStartDate) tripStartDate = itinerary[0].date
  if (!tripEndDate) tripEndDate = itinerary[itinerary.length - 1].date

  return { itinerary, tripStartDate, tripEndDate }
}

function splitPipe(value: string): string[] {
  if (!value) return []
  return value
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseActivities(value: string, lineNumber: number): Activity[] {
  if (!value) return []
  return value
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const parts = a.split('|').map((p) => p.trim())
      const name = parts[0]
      const rawType = parts[1] ?? 'visit'
      const duration = parts[2] || undefined

      if (!name) {
        throw new Error(
          `Ligne ${lineNumber} : chaque activité doit avoir un nom (ex. "Visite musée|visit|2h").`,
        )
      }

      const allowedTypes = ['visit', 'transport', 'food', 'experience', 'shopping']
      const type = allowedTypes.includes(rawType)
        ? (rawType as Activity['type'])
        : 'visit'

      return { name, type, ...(duration && { duration }) }
    })
}

/** RFC 4180-compliant CSV row parser (handles quoted fields) */
function parseCsvRow(line: string): string[] {
  const result: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(field)
        field = ''
      } else {
        field += ch
      }
    }
  }
  result.push(field)
  return result
}

/** Generate an example CSV string with two realistic demo days */
export function generateExampleCsv(): string {
  const rows: string[] = [CSV_HEADERS.join(',')]

  const day1: Record<CsvHeader, string> = {
    date: '2026-06-01',
    dayNumber: '1',
    city: 'Paris',
    title: 'Arrivée à Paris',
    latitude: '48.8566',
    longitude: '2.3522',
    dayType: 'arrival',
    highlights: 'Tour Eiffel|Montmartre',
    notes: 'Première journée tranquille pour se remettre du voyage.',
    tips: 'Acheter un carnet de tickets de métro|Privilégier la marche dans le centre',
    walkingDistance: '5 km',
    activities:
      "Check-in hôtel|experience|1h;Balade sur les Champs-Élysées|visit|2h;Dîner bistrot|food|1h30",
    accommodation_name: 'Hôtel Le Marais',
    accommodation_address: '12 Rue de Rivoli, 75004 Paris',
    accommodation_checkIn: '2026-06-01',
    accommodation_checkOut: '2026-06-03',
    transport_type: 'plane',
    transport_from: 'Lyon',
    transport_to: 'Paris CDG',
    transport_details: 'Vol AF1234 – départ 08h00',
    tripStartDate: '2026-06-01',
    tripEndDate: '2026-06-07',
  }

  const day2: Record<CsvHeader, string> = {
    date: '2026-06-02',
    dayNumber: '2',
    city: 'Paris',
    title: 'Musées et gastronomie',
    latitude: '48.8606',
    longitude: '2.3376',
    dayType: 'exploration',
    highlights: "Louvre|Musée d'Orsay|Saint-Germain-des-Prés",
    notes: "Réserver le Louvre à l'avance pour éviter la queue.",
    tips: 'Entrée gratuite le premier dimanche du mois|Pique-niquer aux Tuileries',
    walkingDistance: '8 km',
    activities:
      "Visite du Louvre|visit|3h;Déjeuner Café Marly|food|1h30;Visite Musée d'Orsay|visit|2h;Shopping rue de Rivoli|shopping|1h",
    accommodation_name: 'Hôtel Le Marais',
    accommodation_address: '12 Rue de Rivoli, 75004 Paris',
    accommodation_checkIn: '2026-06-01',
    accommodation_checkOut: '2026-06-03',
    transport_type: '',
    transport_from: '',
    transport_to: '',
    transport_details: '',
    tripStartDate: '',
    tripEndDate: '',
  }

  rows.push(toCsvRow(day1))
  rows.push(toCsvRow(day2))

  return rows.join('\n')
}

function toCsvRow(record: Record<CsvHeader, string>): string {
  return CSV_HEADERS.map((h) => quoteCsvField(record[h])).join(',')
}

function quoteCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
