import { type DayItinerary } from './itinerary-data'

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
    const { type, from, to, details, flightNumber, departureTime, arrivalTime, duration, price, notes } = day.transport
    const label = { train: 'Train', car: 'Voiture', plane: 'Avion', bus: 'Bus', boat: 'Bateau' }[type]
    const route = from && to ? ` ${from} → ${to}` : ''
    const parts2: string[] = [`Transport : ${label}${route}${details ? ` (${details})` : ''}`]
    if (flightNumber) parts2.push(`N° vol : ${flightNumber}`)
    if (departureTime || arrivalTime) {
      const times = [departureTime, arrivalTime].filter(Boolean).join(' → ')
      parts2.push(`Horaires : ${times}`)
    }
    if (duration !== undefined) {
      const h = Math.floor(duration / 60)
      const m = duration % 60
      parts2.push(`Durée : ${h}h${m > 0 ? `${m}m` : ''}`)
    }
    if (price !== undefined) parts2.push(`Prix : ${price} €`)
    if (notes) parts2.push(notes)
    parts.push(parts2.join(' | '))
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
  const uid = `ouzbekistan-2026-day-${day.dayNumber}@voyage`

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

export function generateICSContent(days: DayItinerary[]): string {
  const events = days.map(generateVEvent).join('\r\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ouzbekistan 2026//Mon Voyage//FR',
    'X-WR-CALNAME:Ouzbekistan 2026',
    'X-WR-CALDESC:Mon itineraire de voyage en Ouzbekistan',
    'X-WR-TIMEZONE:Asia/Tashkent',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICS(days: DayItinerary[], filename: string): void {
  const content = generateICSContent(days)
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
