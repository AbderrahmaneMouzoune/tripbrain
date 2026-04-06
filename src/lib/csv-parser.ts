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

/**
 * Wraps a CSV field value in double-quotes when necessary (RFC 4180).
 * Characters that trigger quoting: comma, double-quote, newline.
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ---------------------------------------------------------------------------
// Activity parsing
//
// Primary format (JSON array in the CSV cell):
//   [{"name":"Tour Eiffel","type":"visit","duration":"2h"},{"name":"Dîner","type":"food"}]
//
// Legacy fallback (pipe-positional, supported for backward compatibility):
//   name|type|duration|...(12 fields)...; next activity; ...
// ---------------------------------------------------------------------------

const VALID_ACTIVITY_TYPES = new Set([
  'visit',
  'transport',
  'food',
  'experience',
  'shopping',
])

const VALID_ACTIVITY_STATUSES = new Set(['planned', 'done', 'skipped'])

function buildActivityFromObject(
  obj: Record<string, unknown>,
  id: string,
): Activity | null {
  const name = String(obj.name ?? '').trim()
  if (!name) return null

  const rawType = String(obj.type ?? 'visit').toLowerCase()
  const type = VALID_ACTIVITY_TYPES.has(rawType)
    ? (rawType as Activity['type'])
    : 'visit'

  const activity: Activity = { id, name, type, source: 'import' }

  if (obj.duration) activity.duration = String(obj.duration)
  if (obj.description) activity.description = String(obj.description)
  if (obj.address) activity.address = String(obj.address)
  if (obj.bookingUrl) activity.bookingUrl = String(obj.bookingUrl)
  const price = parseOptionalNumber(String(obj.price ?? ''))
  if (price !== undefined) activity.price = price
  if (obj.currency) activity.currency = String(obj.currency)
  const rating = parseOptionalNumber(String(obj.rating ?? ''))
  if (rating !== undefined) activity.rating = rating
  const rawStatus = String(obj.status ?? '').toLowerCase()
  if (VALID_ACTIVITY_STATUSES.has(rawStatus))
    activity.status = rawStatus as Activity['status']
  if (obj.openAt) activity.openAt = String(obj.openAt)
  if (obj.tips) activity.tips = String(obj.tips)

  return activity
}

/** Parse activities from a JSON array cell value (primary format). */
function parseActivitiesJson(value: string, dayIndex: number): Activity[] {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((item, i) => {
      if (typeof item !== 'object' || item === null) return null
      return buildActivityFromObject(
        item as Record<string, unknown>,
        `day-${dayIndex + 1}-activity-${i + 1}`,
      )
    })
    .filter((a): a is Activity => a !== null)
}

/** Parse activities from the legacy pipe-positional format (backward compat). */
function parseActivitiesLegacy(value: string, dayIndex: number): Activity[] {
  return value
    .split(';')
    .map((token, i) => {
      const parts = token.split('|').map((s) => s.trim())
      const name = parts[0] || ''
      if (!name) return null
      const obj: Record<string, unknown> = {
        name,
        type: parts[1] ?? 'visit',
        duration: parts[2] ?? '',
        description: parts[3] ?? '',
        address: parts[4] ?? '',
        bookingUrl: parts[5] ?? '',
        price: parts[6] ?? '',
        currency: parts[7] ?? '',
        rating: parts[8] ?? '',
        status: parts[9] ?? '',
        openAt: parts[10] ?? '',
        tips: parts[11] ?? '',
      }
      return buildActivityFromObject(obj, `day-${dayIndex + 1}-activity-${i + 1}`)
    })
    .filter((a): a is Activity => a !== null)
}

function parseActivities(value: string, dayIndex: number): Activity[] {
  const trimmed = value.trim()
  if (!trimmed) return []

  // Primary format: JSON array
  if (trimmed.startsWith('[')) {
    try {
      return parseActivitiesJson(trimmed, dayIndex)
    } catch {
      // fall through to legacy
    }
  }

  // Legacy fallback: pipe-separated positional fields
  return parseActivitiesLegacy(trimmed, dayIndex)
}

/**
 * Serialises a single activity to a plain JSON-serialisable object.
 * Only non-empty/non-default fields are included.
 */
function serializeActivityToObject(a: Activity): Record<string, unknown> {
  const obj: Record<string, unknown> = { name: a.name, type: a.type }
  if (a.duration) obj.duration = a.duration
  if (a.description) obj.description = a.description
  if (a.address) obj.address = a.address
  if (a.bookingUrl) obj.bookingUrl = a.bookingUrl
  if (a.price !== undefined) obj.price = a.price
  if (a.currency) obj.currency = a.currency
  if (a.rating !== undefined) obj.rating = a.rating
  if (a.status) obj.status = a.status
  if (a.openAt) obj.openAt = a.openAt
  if (a.tips) obj.tips = a.tips
  return obj
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
 * **Day-level** (required):
 * - `date`      — ISO date `YYYY-MM-DD`
 * - `city`      — city name
 * - `title`     — short title for the day
 *
 * Trip start/end dates and day numbers are automatically derived.
 *
 * **Day-level** (optional):
 * - `dayNumber`           — integer (auto-derived from row position if absent)
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
 * - Primary format: JSON array of activity objects
 *   `[{"name":"Louvre","type":"visit","duration":"3h"},{"name":"Dîner","type":"food"}]`
 * - Supported keys: `name` (required), `type`, `duration`, `description`,
 *   `address`, `bookingUrl`, `price`, `currency`, `rating`, `status`, `openAt`, `tips`
 * - Legacy format (backward compat): pipe-positional `name|type|duration|...` separated by `;`
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
      "Le fichier CSV doit contenir une ligne d'en-tête et au moins une ligne de données.",
    )
  }

  const headers = splitCsvLine(nonEmpty[0]).map((h) => h.trim())

  if (headers.length === 0) {
    throw new CsvParseError('Impossible de lire les colonnes du fichier CSV.')
  }

  const itinerary: DayItinerary[] = []

  for (let rowIdx = 1; rowIdx < nonEmpty.length; rowIdx++) {
    const values = splitCsvLine(nonEmpty[rowIdx])
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = values[i] ?? ''
    })

    // Validate required day fields
    const date = row['date']?.trim()
    const city = row['city']?.trim()
    const title = row['title']?.trim()

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

    // dayNumber is optional — fall back to row position (1-based).
    // If explicitly provided, it must be a valid integer.
    const dayNumberRaw = row['dayNumber']?.trim()
    const dayNumber = dayNumberRaw ? parseInt(dayNumberRaw, 10) : rowIdx
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

  // Trip dates are always derived from the first and last day
  const tripStartDate = itinerary[0].date
  const tripEndDate = itinerary[itinerary.length - 1].date

  return { itinerary, tripStartDate, tripEndDate }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** Column header order used for both import and export. */
const CSV_HEADERS = [
  'date',
  'city',
  'title',
  'coordinates',
  'notes',
  'walkingDistance',
  'dayType',
  'highlights',
  'foodRecommendations',
  'packingTips',
  'tips',
  'activities',
  'accommodationName',
  'accommodationAddress',
  'accommodationCheckIn',
  'accommodationCheckOut',
  'accommodationBookingUrl',
  'transportType',
  'transportFrom',
  'transportTo',
  'transportDetails',
  'transportDepartureTime',
  'transportArrivalTime',
]

/**
 * Serialises a {@link TripData} object to a TripBrain CSV string.
 *
 * Activities are encoded as a JSON array in the `activities` column so that
 * field names are explicit and the format is human-readable.
 * `dayNumber` is omitted from the export because it is always derived from
 * the row position on import.
 * The trip start/end dates are also omitted because they are derived from
 * the first and last day.
 */
export function exportCsv(data: TripData): string {
  const rows = data.itinerary.map((day) => {
    const activities = day.activities ?? []
    const activityStr =
      activities.length > 0
        ? JSON.stringify(activities.map(serializeActivityToObject))
        : ''

    const row = [
      day.date,
      day.city,
      day.title,
      day.coordinates ? `${day.coordinates[0]}|${day.coordinates[1]}` : '',
      day.notes ?? '',
      day.walkingDistance ?? '',
      day.dayType ?? '',
      (day.highlights ?? []).join('|'),
      (day.foodRecommendations ?? []).join('|'),
      (day.packingTips ?? []).join('|'),
      (day.tips ?? []).join('|'),
      activityStr,
      day.accommodation?.name ?? '',
      day.accommodation?.address ?? '',
      day.accommodation?.checkIn ?? '',
      day.accommodation?.checkOut ?? '',
      day.accommodation?.bookingUrl ?? '',
      day.transport?.type ?? '',
      day.transport?.from ?? '',
      day.transport?.to ?? '',
      day.transport?.details ?? '',
      day.transport?.departureTime ?? '',
      day.transport?.arrivalTime ?? '',
    ]

    return row.map(csvEscape).join(',')
  })

  return [CSV_HEADERS.join(','), ...rows].join('\n')
}

// Re-export for consumers that only need the helpers
export { parseOptionalNumber, splitPipe, csvEscape, CSV_HEADERS }

