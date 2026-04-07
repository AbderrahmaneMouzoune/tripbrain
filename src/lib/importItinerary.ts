import type { CellValue, Worksheet } from 'exceljs'
import type { DayItinerary, Activity, Transport, Accommodation } from '@/lib/itinerary-data'

// ── Public types ──────────────────────────────────────────────────────────────

export interface ImportResult {
  itinerary: DayItinerary[]
  tripStartDate: Date
  tripEndDate: Date
}

// ── Internal types ────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>
type DayRow = Omit<DayItinerary, 'activities' | 'transport'>
type ActivityRow = Activity & { _dayId: string }
type TransportRow = Transport & { _dayId: string }

// ── Primitive helpers ─────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  if (v instanceof Date) return v.toISOString().split('T')[0]
  const s = String(v).trim()
  return s || undefined
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return isNaN(v) ? undefined : v
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function bool(v: unknown): boolean | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase().trim()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'oui') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'non') return false
  return undefined
}

function list(v: unknown): string[] | undefined {
  const s = str(v)
  if (!s) return undefined
  const items = s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

function coords(v: unknown): [number, number] | undefined {
  const s = str(v)
  if (!s) return undefined
  const parts = s.split('|')
  if (parts.length !== 2) return undefined
  const lat = Number(parts[0].trim())
  const lng = Number(parts[1].trim())
  if (isNaN(lat) || isNaN(lng)) return undefined
  return [lat, lng]
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToDay(row: RawRow, index: number): DayRow {
  const id = str(row['id']) ?? `day-import-${index + 1}`

  const accName = str(row['accommodation_name'])
  let accommodation: Accommodation | undefined
  if (accName) {
    accommodation = {
      id: str(row['accommodation_id']) ?? `acc-${id}`,
      name: accName,
      address: str(row['accommodation_address']) ?? '',
      bookingUrl: str(row['accommodation_booking_url']) ?? '',
      checkIn: str(row['accommodation_check_in']) ?? '',
      checkOut: str(row['accommodation_check_out']) ?? '',
      price: num(row['accommodation_price']),
      currency: str(row['accommodation_currency']),
      bookingReference: str(row['accommodation_booking_reference']),
      status: str(row['accommodation_status']) as Accommodation['status'],
      source: 'import',
    }
  }

  return {
    id,
    date: str(row['date']) ?? '',
    dayNumber: num(row['day_number']) ?? index + 1,
    city: str(row['city']) ?? '',
    title: str(row['title']) ?? '',
    highlights: list(row['highlights']),
    foodRecommendations: list(row['food_recommendations']),
    walkingDistance: str(row['walking_distance']),
    notes: str(row['notes']),
    packingTips: list(row['packing_tips']),
    dayType: str(row['day_type']),
    tips: list(row['tips']),
    accommodation,
    coordinates: coords(row['coordinates']) ?? [0, 0],
    source: 'import',
  }
}

function rowToActivity(row: RawRow, index: number): ActivityRow {
  return {
    _dayId: str(row['day_id']) ?? '',
    id: str(row['id']) ?? `act-import-${index + 1}`,
    name: str(row['name']) ?? '',
    description: str(row['description']),
    type: (str(row['type']) as Activity['type']) ?? 'visit',
    duration: str(row['duration']),
    coordinates: coords(row['coordinates']),
    openAt: str(row['open_at']),
    address: str(row['address']),
    bookingUrl: str(row['booking_url']),
    reservationRequired: bool(row['reservation_required']),
    price: num(row['price']),
    currency: str(row['currency']),
    rating: num(row['rating']),
    tags: list(row['tags']),
    status: str(row['status']) as Activity['status'],
    tips: str(row['tips']),
    source: 'import',
  }
}

function rowToTransport(row: RawRow, index: number): TransportRow {
  return {
    _dayId: str(row['day_id']) ?? '',
    id: str(row['id']) ?? `transport-import-${index + 1}`,
    type: (str(row['type']) as Transport['type']) ?? 'train',
    from: str(row['from']),
    to: str(row['to']),
    details: str(row['details']),
    departureAddress: str(row['departure_address']),
    departureTime: str(row['departure_time']),
    arrivalTime: str(row['arrival_time']),
    duration: str(row['duration']),
    provider: str(row['provider']),
    bookingUrl: str(row['booking_url']),
    bookingReference: str(row['booking_reference']),
    price: num(row['price']),
    currency: str(row['currency']),
    seat: str(row['seat']),
    gate: str(row['gate']),
    terminal: str(row['terminal']),
    status: str(row['status']) as Transport['status'],
    notes: str(row['notes']),
    source: 'import',
  }
}

// ── Assembly ──────────────────────────────────────────────────────────────────

function buildItinerary(
  dayRows: DayRow[],
  activityRows: ActivityRow[],
  transportRows: TransportRow[],
): ImportResult {
  const actsByDayId = new Map<string, Activity[]>()
  for (const { _dayId, ...activity } of activityRows) {
    if (!actsByDayId.has(_dayId)) actsByDayId.set(_dayId, [])
    actsByDayId.get(_dayId)!.push(activity as Activity)
  }

  const transByDayId = new Map<string, Transport>()
  for (const { _dayId, ...transport } of transportRows) {
    transByDayId.set(_dayId, transport as Transport)
  }

  const itinerary: DayItinerary[] = dayRows.map((day) => ({
    ...day,
    activities: actsByDayId.get(day.id) ?? [],
    transport: transByDayId.get(day.id),
  }))

  const dates = itinerary
    .map((d) => new Date(d.date))
    .filter((d) => !isNaN(d.getTime()))

  const tripStartDate =
    dates.length > 0
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : new Date()
  const tripEndDate =
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : new Date()

  return { itinerary, tripStartDate, tripEndDate }
}

// ── XLSX helpers ──────────────────────────────────────────────────────────────

function unwrapCellValue(value: CellValue): unknown {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    // Formula cell: { formula, result }
    if ('result' in value) return (value as { result: unknown }).result ?? null
    // Rich text: { richText: [{ text }, ...] }
    if ('richText' in value) {
      const rt = (value as { richText: { text: string }[] }).richText
      return Array.isArray(rt) ? rt.map((r) => r.text).join('') : null
    }
    // Hyperlink: { text, hyperlink }
    if ('text' in value && 'hyperlink' in value) {
      return (value as { text: string }).text
    }
    // Error cell
    if ('error' in value) return null
  }
  return value
}

function sheetToRows(sheet: Worksheet): RawRow[] {
  const headers: string[] = []
  const rows: RawRow[] = []
  let headersParsed = false

  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (!headersParsed) {
      headersParsed = true
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = str(unwrapCellValue(cell.value)) ?? ''
      })
      return
    }

    const record: RawRow = {}
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1]
      if (header) record[header] = unwrapCellValue(cell.value)
    })
    if (Object.values(record).some((v) => v != null && v !== '')) {
      rows.push(record)
    }
  })

  return rows
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // escaped quote
        } else {
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

function parseCsvText(text: string): RawRow[] {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const rows: RawRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const values = parseCsvLine(line)
    const record: RawRow = {}
    headers.forEach((h, j) => {
      record[h] = j < values.length ? values[j] : ''
    })
    if (Object.values(record).some((v) => v !== '' && v != null)) {
      rows.push(record)
    }
  }

  return rows
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Import trip data from a multi-sheet Excel file (.xlsx).
 *
 * Expected sheets: "Days", "Activities", "Transports".
 * Activities and Transports are linked to Days via a `day_id` column.
 * The Days sheet also carries accommodation columns prefixed with `accommodation_`.
 *
 * Shared conventions:
 * - Lists → pipe-separated values (e.g. "art|musée")
 * - Coordinates → "lat|lng" (e.g. "48.8566|2.3522")
 * - Dates → ISO 8601 strings
 * - Empty cell → field absent
 * - Price → raw number; currency in a separate column
 */
export async function importFromXlsx(file: File): Promise<ImportResult> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  const required = ['Days', 'Activities', 'Transports'] as const
  for (const name of required) {
    if (!workbook.getWorksheet(name)) {
      throw new Error(`Feuille "${name}" introuvable dans le fichier Excel.`)
    }
  }

  const dayRows = sheetToRows(workbook.getWorksheet('Days')!).map(rowToDay)
  const activityRows = sheetToRows(workbook.getWorksheet('Activities')!).map(
    rowToActivity,
  )
  const transportRows = sheetToRows(workbook.getWorksheet('Transports')!).map(
    rowToTransport,
  )

  return buildItinerary(dayRows, activityRows, transportRows)
}

/**
 * Import trip data from three CSV files.
 *
 * The `files` array must contain exactly three files named (case-insensitive):
 * `days.csv`, `activities.csv`, and `transports.csv`.
 *
 * Same column conventions as the Excel format.
 */
export async function importFromCsv(files: File[]): Promise<ImportResult> {
  const fileMap = new Map(files.map((f) => [f.name.toLowerCase(), f]))

  const daysFile = fileMap.get('days.csv')
  const activitiesFile = fileMap.get('activities.csv')
  const transportsFile = fileMap.get('transports.csv')

  if (!daysFile) throw new Error('Fichier "days.csv" manquant.')
  if (!activitiesFile) throw new Error('Fichier "activities.csv" manquant.')
  if (!transportsFile) throw new Error('Fichier "transports.csv" manquant.')

  const [daysText, activitiesText, transportsText] = await Promise.all([
    daysFile.text(),
    activitiesFile.text(),
    transportsFile.text(),
  ])

  const dayRows = parseCsvText(daysText).map(rowToDay)
  const activityRows = parseCsvText(activitiesText).map(rowToActivity)
  const transportRows = parseCsvText(transportsText).map(rowToTransport)

  return buildItinerary(dayRows, activityRows, transportRows)
}
