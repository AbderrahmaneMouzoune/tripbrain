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

export function generateICSContent(days: DayItinerary[]): string {
  const events = days.map(generateVEvent).join('\r\n')
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
