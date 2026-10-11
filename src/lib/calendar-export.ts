import { type DayItinerary, type Transport } from './itinerary-data'

/** Ce que l'export vers le calendrier peut ajouter aux journées elles-mêmes. */
export interface CalendarExportOptions {
  /**
   * Ajoute chaque trajet horodaté comme un événement à part, aux heures
   * prévues. Désactivé par défaut : l'export historique ne contient que des
   * journées entières.
   */
  includeTransports?: boolean
}

/** Libellé court d'un mode de transport, pour l'intitulé d'un événement. */
const TRANSPORT_SUMMARY_LABEL: Record<Transport['type'], string> = {
  plane: 'Vol',
  train: 'Train',
  bus: 'Bus',
  car: 'Trajet en voiture',
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

/** Heure « HH:MM » lue telle quelle, ou `null` si elle est absente ou libre. */
function parseTime(value: string | undefined): [number, number] | null {
  const match = value?.trim().match(TIME_PATTERN)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return [hours, minutes]
}

/**
 * Un trajet ne devient un événement que s'il a une heure de départ : sans
 * elle, il resterait une journée entière qui doublonne celle du jour.
 */
export function hasScheduledTransport(day: DayItinerary): boolean {
  return Boolean(day.transport && parseTime(day.transport.departureTime))
}

/** Nombre d'événements que le fichier .ics contiendra. */
export function countCalendarEvents(
  days: DayItinerary[],
  options: CalendarExportOptions = {},
): number {
  const transports = options.includeTransports
    ? days.filter(hasScheduledTransport).length
    : 0
  return days.length + transports
}

/** Intitulé d'un trajet : « Vol PKX → XIY », « Train ». */
export function transportSummary(transport: Transport): string {
  const label = TRANSPORT_SUMMARY_LABEL[transport.type] ?? 'Trajet'
  const route =
    transport.from && transport.to ? ` ${transport.from} → ${transport.to}` : ''
  return `${label}${route}`
}

/** Plage horaire lisible d'un trajet : « 13:00–15:10 », ou l'heure de départ seule. */
export function transportTimeRange(transport: Transport): string | null {
  const departure = parseTime(transport.departureTime)
  if (!departure) return null
  const arrival = parseTime(transport.arrivalTime)
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${pad(departure[0])}:${pad(departure[1])}`
  return arrival ? `${start}–${pad(arrival[0])}:${pad(arrival[1])}` : start
}

function formatICSDate(dateString: string): string {
  return dateString.replace(/-/g, '')
}

function getNextDayDate(dateString: string): string {
  const date = new Date(dateString)
  date.setDate(date.getDate() + 1)
  return date.toISOString().split('T')[0].replace(/-/g, '')
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function foldICSLine(line: string): string {
  // RFC 5545: lines longer than 75 octets should be folded
  if (line.length <= 75) return line
  const chunks: string[] = []
  chunks.push(line.slice(0, 75))
  let offset = 75
  while (offset < line.length) {
    chunks.push(' ' + line.slice(offset, offset + 74))
    offset += 74
  }
  return chunks.join('\r\n')
}

function buildEventDescription(day: DayItinerary): string {
  const parts: string[] = []

  const visitable = day.activities.filter((a) => a.type !== 'transport')
  if (visitable.length > 0) {
    parts.push(`Activités : ${visitable.map((a) => a.name).join(', ')}`)
  }

  if (day.transport) {
    const { type, from, to, details } = day.transport
    const label = {
      train: 'Train',
      car: 'Voiture',
      plane: 'Avion',
      bus: 'Bus',
    }[type]
    const route = from && to ? ` ${from} → ${to}` : ''
    parts.push(`Transport : ${label}${route}${details ? ` (${details})` : ''}`)
  }

  if (day.accommodation) {
    parts.push(
      `Hébergement : ${day.accommodation.name} — ${day.accommodation.address}`,
    )
  }

  if (day.highlights && day.highlights.length > 0) {
    parts.push(`À voir : ${day.highlights.join(', ')}`)
  }

  if (day.tips && day.tips.length > 0) {
    parts.push(`Conseils : ${day.tips.join(' | ')}`)
  }

  return parts.join('\n')
}

function generateVEvent(day: DayItinerary): string {
  const startDate = formatICSDate(day.date)
  const endDate = getNextDayDate(day.date)
  const summary = escapeICSText(`Jour ${day.dayNumber} – ${day.title}`)
  const description = escapeICSText(buildEventDescription(day))
  const location = escapeICSText(day.city)
  const uid = `tripbrain-day-${day.dayNumber}@voyage`

  const lines = [
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    foldICSLine(`SUMMARY:${summary}`),
    foldICSLine(`DESCRIPTION:${description}`),
    foldICSLine(`LOCATION:${location}`),
    `UID:${uid}`,
    'END:VEVENT',
  ]

  return lines.join('\r\n')
}

/** Date ISO décalée d'un jour, au format compact du calendrier. */
function addDaysCompact(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Trajet horodaté en heure « flottante » (sans fuseau) : les horaires des
 * billets sont donnés en heure locale du lieu, et c'est ainsi que le
 * calendrier doit les afficher, où que soit le téléphone.
 */
function generateTransportVEvent(day: DayItinerary): string | null {
  const transport = day.transport
  if (!transport) return null
  const departure = parseTime(transport.departureTime)
  if (!departure) return null

  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = (date: string, [h, m]: [number, number]) =>
    `${date}T${pad(h)}${pad(m)}00`

  const startDate = formatICSDate(day.date)
  const arrival = parseTime(transport.arrivalTime)
  // Une arrivée « avant » le départ tombe le lendemain (vol de nuit).
  const arrivesNextDay =
    arrival !== null &&
    arrival[0] * 60 + arrival[1] <= departure[0] * 60 + departure[1]
  const endDate = arrivesNextDay ? addDaysCompact(day.date, 1) : startDate

  const details = [
    transport.details,
    transport.provider && !transport.details?.includes(transport.provider)
      ? transport.provider
      : undefined,
    transport.bookingReference
      ? `Réservation : ${transport.bookingReference}`
      : undefined,
    transport.terminal ? `Terminal : ${transport.terminal}` : undefined,
    transport.gate ? `Porte : ${transport.gate}` : undefined,
    transport.seat ? `Place : ${transport.seat}` : undefined,
  ].filter(Boolean)

  const lines = [
    'BEGIN:VEVENT',
    `DTSTART:${stamp(startDate, departure)}`,
    ...(arrival ? [`DTEND:${stamp(endDate, arrival)}`] : []),
    foldICSLine(`SUMMARY:${escapeICSText(transportSummary(transport))}`),
    ...(details.length > 0
      ? [foldICSLine(`DESCRIPTION:${escapeICSText(details.join('\n'))}`)]
      : []),
    ...(transport.departureAddress || transport.from
      ? [
          foldICSLine(
            `LOCATION:${escapeICSText(transport.departureAddress || transport.from || '')}`,
          ),
        ]
      : []),
    `UID:tripbrain-transport-${day.dayNumber}@voyage`,
    'END:VEVENT',
  ]
  return lines.join('\r\n')
}

function buildCalendarMetadata(days: DayItinerary[]): {
  calName: string
  calDescription: string
} {
  if (days.length === 0) {
    return {
      calName: 'Mon voyage',
      calDescription: 'Itinéraire de voyage généré par TripBrain',
    }
  }

  const cities = [
    ...new Set(days.map((day) => day.city.trim()).filter(Boolean)),
  ]
  const sortedByDate = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const startDate = sortedByDate[0]?.date
  const endDate = sortedByDate.at(-1)?.date

  const routeLabel =
    cities.length <= 1
      ? cities[0]
      : `${cities[0]} → ${cities[cities.length - 1]}`

  return {
    calName: routeLabel ? `Voyage - ${routeLabel}` : 'Mon voyage',
    calDescription:
      startDate && endDate
        ? `Itinéraire du ${startDate} au ${endDate}`
        : 'Itinéraire de voyage généré par TripBrain',
  }
}

export function generateICSContent(
  days: DayItinerary[],
  options: CalendarExportOptions = {},
): string {
  const events = days
    .flatMap((day) => {
      const transport = options.includeTransports
        ? generateTransportVEvent(day)
        : null
      return transport
        ? [generateVEvent(day), transport]
        : [generateVEvent(day)]
    })
    .join('\r\n')
  const { calName, calDescription } = buildCalendarMetadata(days)

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TripBrain//Itinéraire//FR',
    foldICSLine(`X-WR-CALNAME:${escapeICSText(calName)}`),
    foldICSLine(`X-WR-CALDESC:${escapeICSText(calDescription)}`),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICS(
  days: DayItinerary[],
  filename: string,
  options: CalendarExportOptions = {},
): void {
  const content = generateICSContent(days, options)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

export function getGoogleCalendarUrl(day: DayItinerary): string {
  const startDate = formatICSDate(day.date)
  const endDate = getNextDayDate(day.date)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Jour ${day.dayNumber} – ${day.title}`,
    dates: `${startDate}/${endDate}`,
    details: buildEventDescription(day),
    location: day.city,
  })

  return `https://www.google.com/calendar/render?${params.toString()}`
}
