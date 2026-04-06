import type { DayItinerary, Activity, Accommodation, Transport } from './itinerary-data'
import type { TripData } from '@/hooks/use-trip-data'

// ---------------------------------------------------------------------------
// RFC 4180-compatible CSV tokeniser
// ---------------------------------------------------------------------------

/**
 * Splits a raw CSV line into individual field strings, respecting
 * double-quoted fields (which may contain commas and embedded double-quotes
 * represented as "").
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: "" inside a quoted field is an escaped double-quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip the second quote of the "" pair
        } else {
          // Closing quote
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function splitPipe(value: string): string[] {
  return value
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseOptionalNumber(value: string): number | undefined {
  const n = Number(value)
  return value.trim() !== '' && !isNaN(n) ? n : undefined
}

function parseCoordinates(value: string): [number, number] | undefined {
  if (!value.trim()) return undefined
  const parts = value.split('|')
  if (parts.length !== 2) return undefined
  const lat = parseFloat(parts[0])
  const lon = parseFloat(parts[1])
  if (isNaN(lat) || isNaN(lon)) return undefined
  return [lat, lon]
}

function generateId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`
}

// ---------------------------------------------------------------------------
// Activity parsing
// Each activity token: "name|type|duration"
// Multiple activities separated by ";"
// ---------------------------------------------------------------------------

const VALID_ACTIVITY_TYPES = new Set([
  'visit',
  'transport',
  'food',
  'experience',
  'shopping',
])

function parseActivities(value: string, dayIndex: number): Activity[] {
  if (!value.trim()) return []

  return value
    .split(';')
    .map((token, i) => {
      const parts = token.split('|').map((s) => s.trim())
      const name = parts[0] || ''
      if (!name) return null

      const rawType = (parts[1] || 'visit').toLowerCase()
      const type = VALID_ACTIVITY_TYPES.has(rawType)
        ? (rawType as Activity['type'])
        : 'visit'
      const duration = parts[2] || undefined

      const activity: Activity = {
        id: `day-${dayIndex + 1}-activity-${i + 1}`,
        name,
        type,
        source: 'import',
      }
      if (duration) activity.duration = duration
      return activity
    })
    .filter((a): a is Activity => a !== null)
}

// ---------------------------------------------------------------------------
// Accommodation parsing
// ---------------------------------------------------------------------------

function parseAccommodation(
  row: Record<string, string>,
  dayIndex: number,
): Accommodation | undefined {
  const name = row['accommodationName']?.trim()
  if (!name) return undefined

  return {
    id: `day-${dayIndex + 1}-accommodation`,
    name,
    address: row['accommodationAddress']?.trim() ?? '',
    checkIn: row['accommodationCheckIn']?.trim() ?? '',
    checkOut: row['accommodationCheckOut']?.trim() ?? '',
    bookingUrl: row['accommodationBookingUrl']?.trim() ?? '',
    source: 'import',
  }
}

// ---------------------------------------------------------------------------
// Transport parsing
// ---------------------------------------------------------------------------

const VALID_TRANSPORT_TYPES = new Set(['train', 'car', 'plane', 'bus'])

function parseTransport(
  row: Record<string, string>,
  dayIndex: number,
): Transport | undefined {
  const rawType = row['transportType']?.trim().toLowerCase()
  if (!rawType) return undefined

  const type = VALID_TRANSPORT_TYPES.has(rawType)
    ? (rawType as Transport['type'])
    : 'car'

  const transport: Transport = {
    id: `day-${dayIndex + 1}-transport`,
    type,
    source: 'import',
  }

  if (row['transportFrom']?.trim()) transport.from = row['transportFrom'].trim()
  if (row['transportTo']?.trim()) transport.to = row['transportTo'].trim()
  if (row['transportDetails']?.trim())
    transport.details = row['transportDetails'].trim()
  if (row['transportDepartureTime']?.trim())
    transport.departureTime = row['transportDepartureTime'].trim()
  if (row['transportArrivalTime']?.trim())
    transport.arrivalTime = row['transportArrivalTime'].trim()

  return transport
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvParseError'
  }
}

/**
 * Parses a TripBrain CSV string into a {@link TripData} object.
 *
 * ### CSV format
 *
 * The first row must be a header row. Every subsequent row represents one day
 * of the itinerary. The following columns are recognised:
 *
 * **Trip-level** (only needed on the first data row):
 * - `tripStartDate` — ISO date `YYYY-MM-DD`
 * - `tripEndDate`   — ISO date `YYYY-MM-DD`
 *
 * **Day-level** (required):
 * - `date`      — ISO date `YYYY-MM-DD`
 * - `dayNumber` — integer (1, 2, 3, …)
 * - `city`      — city name
 * - `title`     — short title for the day
 *
 * **Day-level** (optional):
 * - `coordinates`        — `lat|lon` (e.g. `48.8566|2.3522`)
 * - `notes`              — free-form text
 * - `walkingDistance`    — e.g. `8 km`
 * - `dayType`            — e.g. `arrival`, `departure`, `exploration`
 * - `highlights`         — `|`-separated list
 * - `foodRecommendations`— `|`-separated list
 * - `packingTips`        — `|`-separated list
 * - `tips`               — `|`-separated list
 *
 * **Activities** (optional, one `activities` column):
 * - Format: `name|type|duration` entries separated by `;`
 * - `type` must be one of: `visit`, `transport`, `food`, `experience`, `shopping`
 * - Example: `Louvre|visit|3h;Déjeuner|food|1h30`
 *
 * **Accommodation** (optional):
 * - `accommodationName`
 * - `accommodationAddress`
 * - `accommodationCheckIn`
 * - `accommodationCheckOut`
 * - `accommodationBookingUrl`
 *
 * **Transport** (optional):
 * - `transportType` — one of: `train`, `car`, `plane`, `bus`
 * - `transportFrom`
 * - `transportTo`
 * - `transportDetails`
 * - `transportDepartureTime`
 * - `transportArrivalTime`
 */
export function parseCsv(csvText: string): TripData {
  // Normalise line endings
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Filter blank lines
  const nonEmpty = lines.filter((l) => l.trim() !== '')
  if (nonEmpty.length < 2) {
    throw new CsvParseError(
      'Le fichier CSV doit contenir une ligne d\'en-tête et au moins une ligne de données.',
    )
  }

  const headers = splitCsvLine(nonEmpty[0]).map((h) => h.trim())

  if (headers.length === 0) {
    throw new CsvParseError('Impossible de lire les colonnes du fichier CSV.')
  }

  let tripStartDate = ''
  let tripEndDate = ''
  const itinerary: DayItinerary[] = []

  for (let rowIdx = 1; rowIdx < nonEmpty.length; rowIdx++) {
    const values = splitCsvLine(nonEmpty[rowIdx])
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = values[i] ?? ''
    })

    // Trip-level dates — pick from first row that has them
    if (!tripStartDate && row['tripStartDate']?.trim()) {
      tripStartDate = row['tripStartDate'].trim()
    }
    if (!tripEndDate && row['tripEndDate']?.trim()) {
      tripEndDate = row['tripEndDate'].trim()
    }

    // Validate required day fields
    const date = row['date']?.trim()
    const city = row['city']?.trim()
    const title = row['title']?.trim()
    const dayNumberRaw = row['dayNumber']?.trim()

    if (!date) {
      throw new CsvParseError(
        `Ligne ${rowIdx + 1} : la colonne "date" est obligatoire.`,
      )
    }
    if (!city) {
      throw new CsvParseError(
        `Ligne ${rowIdx + 1} : la colonne "city" est obligatoire.`,
      )
    }
    if (!title) {
      throw new CsvParseError(
        `Ligne ${rowIdx + 1} : la colonne "title" est obligatoire.`,
      )
    }

    const dayNumber = dayNumberRaw ? parseInt(dayNumberRaw, 10) : rowIdx
    // rowIdx is 1-based here (header is row 0), so it naturally gives
    // dayNumber 1, 2, 3… when the column is absent. This fallback is
    // intentional and documented in the JSDoc above.
    if (isNaN(dayNumber)) {
      throw new CsvParseError(
        `Ligne ${rowIdx + 1} : "dayNumber" doit être un entier.`,
      )
    }

    const coordRaw = row['coordinates']?.trim() ?? ''
    // DayItinerary.coordinates is non-optional in the type definition, so we
    // must always supply a value. [0, 0] is the conventional "unknown" sentinel
    // and matches the fallback used by other parts of the app.
    const coordinates = parseCoordinates(coordRaw) ?? [0, 0]

    const day: DayItinerary = {
      id: generateId('day', rowIdx - 1),
      date,
      dayNumber,
      city,
      title,
      coordinates,
      activities: parseActivities(row['activities'] ?? '', rowIdx - 1),
      source: 'import',
    }

    if (row['notes']?.trim()) day.notes = row['notes'].trim()
    if (row['walkingDistance']?.trim())
      day.walkingDistance = row['walkingDistance'].trim()
    if (row['dayType']?.trim()) day.dayType = row['dayType'].trim()

    const highlights = splitPipe(row['highlights'] ?? '')
    if (highlights.length > 0) day.highlights = highlights

    const foodRecommendations = splitPipe(row['foodRecommendations'] ?? '')
    if (foodRecommendations.length > 0)
      day.foodRecommendations = foodRecommendations

    const packingTips = splitPipe(row['packingTips'] ?? '')
    if (packingTips.length > 0) day.packingTips = packingTips

    const tips = splitPipe(row['tips'] ?? '')
    if (tips.length > 0) day.tips = tips

    const accommodation = parseAccommodation(row, rowIdx - 1)
    if (accommodation) day.accommodation = accommodation

    const transport = parseTransport(row, rowIdx - 1)
    if (transport) day.transport = transport

    itinerary.push(day)
  }

  if (itinerary.length === 0) {
    throw new CsvParseError('Le fichier CSV ne contient aucune journée.')
  }

  // Fall back to first/last day dates if trip-level dates are absent
  if (!tripStartDate) tripStartDate = itinerary[0].date
  if (!tripEndDate) tripEndDate = itinerary[itinerary.length - 1].date

  // Validate ISO date format
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!isoDateRegex.test(tripStartDate)) {
    throw new CsvParseError(
      `"tripStartDate" doit être au format YYYY-MM-DD (reçu : "${tripStartDate}").`,
    )
  }
  if (!isoDateRegex.test(tripEndDate)) {
    throw new CsvParseError(
      `"tripEndDate" doit être au format YYYY-MM-DD (reçu : "${tripEndDate}").`,
    )
  }

  return { itinerary, tripStartDate, tripEndDate }
}

// Re-export for consumers that only need the helper
export { parseOptionalNumber, splitPipe }
