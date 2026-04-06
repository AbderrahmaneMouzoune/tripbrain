import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateICSContent,
  getGoogleCalendarUrl,
  downloadICS,
} from '../calendar-export'
import { type DayItinerary } from '../itinerary-data'

/**
 * RFC 5545 §3.1 – unfold continuation lines (CRLF followed by a single space
 * or tab) so that tests can assert on unfolded text.
 */
function unfoldICS(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, '')
}

// ---------------------------------------------------------------------------
// Minimal fixture used across all tests
// ---------------------------------------------------------------------------

const minimalDay: DayItinerary = {
  id: 'day-1',
  date: '2026-05-10',
  dayNumber: 1,
  city: 'Tachkent',
  title: 'Arrivée à Tachkent',
  activities: [],
  coordinates: [41.2995, 69.2401],
}

const fullDay: DayItinerary = {
  id: 'day-2',
  date: '2026-05-11',
  dayNumber: 2,
  city: 'Samarcande',
  title: 'Régistan & Bibi-Khanym',
  activities: [
    { id: 'act-day2-1', name: 'Régistan', type: 'visit', duration: '2h' },
    { id: 'act-day2-2', name: 'Bibi-Khanym', type: 'visit', duration: '1h' },
    {
      id: 'act-day2-3',
      name: 'Trajet bus',
      type: 'transport',
      duration: '30min',
    },
  ],
  transport: {
    id: 'tr-day2',
    type: 'train',
    from: 'Tachkent',
    to: 'Samarcande',
    details: 'Afrosiyob',
  },
  accommodation: {
    id: 'acc-day2',
    name: 'Hôtel Registan Plaza',
    address: '1 Place du Régistan',
    bookingUrl: 'https://example.com',
    checkIn: '2026-05-11',
    checkOut: '2026-05-13',
  },
  highlights: ['Régistan', 'Nécropole Chah-i-Zinda'],
  tips: ['Arriver tôt le matin', 'Porter de la crème solaire'],
  coordinates: [39.6542, 66.9758],
}

const specialCharsDay: DayItinerary = {
  id: 'day-3',
  date: '2026-05-12',
  dayNumber: 3,
  city: 'Boukhara, Ouzbékistan',
  title: 'Visite; avec, virgules & backslash\\',
  activities: [{ id: 'act-day3-1', name: 'Arc de Boukhara', type: 'visit' }],
  coordinates: [39.7747, 64.4286],
}

// ---------------------------------------------------------------------------
// generateICSContent
// ---------------------------------------------------------------------------

describe('generateICSContent', () => {
  it('wraps content in VCALENDAR block', () => {
    const ics = generateICSContent([minimalDay])
    expect(ics).toMatch(/^BEGIN:VCALENDAR/)
    expect(ics).toMatch(/END:VCALENDAR$/)
  })

  it('includes required calendar headers', () => {
    const ics = generateICSContent([minimalDay])
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('CALSCALE:GREGORIAN')
    expect(ics).toContain('METHOD:PUBLISH')
  })

  it('generates a VEVENT for each day', () => {
    const ics = generateICSContent([minimalDay, fullDay])
    const beginCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length
    const endCount = (ics.match(/END:VEVENT/g) ?? []).length
    expect(beginCount).toBe(2)
    expect(endCount).toBe(2)
  })

  it('uses CRLF line endings throughout', () => {
    const ics = generateICSContent([minimalDay])
    // Every line ending should be \r\n
    const lines = ics.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    // No bare \n (i.e. no line that contains \n without preceding \r)
    expect(ics).not.toMatch(/(?<!\r)\n/)
  })

  it('formats DTSTART and DTEND as DATE values', () => {
    const ics = generateICSContent([minimalDay])
    expect(ics).toContain('DTSTART;VALUE=DATE:20260510')
    expect(ics).toContain('DTEND;VALUE=DATE:20260511')
  })

  it('sets DTEND to the next calendar day', () => {
    // 2026-05-10 → end should be 2026-05-11
    const ics = generateICSContent([minimalDay])
    expect(ics).toContain('DTEND;VALUE=DATE:20260511')
  })

  it('includes city as LOCATION', () => {
    const ics = generateICSContent([minimalDay])
    expect(ics).toContain('LOCATION:Tachkent')
  })

  it('includes day summary with day number and title', () => {
    const ics = generateICSContent([minimalDay])
    // Summary may be folded, so just check key parts appear somewhere
    expect(ics).toContain('Jour 1')
    expect(ics).toContain('Arrivée à Tachkent')
  })

  it('includes a stable UID for each event', () => {
    const ics = generateICSContent([minimalDay])
    expect(ics).toContain('UID:ouzbekistan-2026-day-1@voyage')
  })

  it('includes non-transport activities in description', () => {
    const ics = generateICSContent([fullDay])
    expect(ics).toContain('Régistan')
    expect(ics).toContain('Bibi-Khanym')
  })

  it('excludes transport activities from the Activités list', () => {
    const ics = generateICSContent([fullDay])
    // "Trajet bus" has type transport and must not appear in "Activités :"
    const descMatch = ics.match(/DESCRIPTION:([^\r\n]*)/)
    expect(descMatch).not.toBeNull()
    // The raw description line should not list the transport activity name
    expect(ics).not.toContain('Trajet bus')
  })

  it('includes transport details in description', () => {
    const ics = generateICSContent([fullDay])
    expect(ics).toContain('Train')
    expect(ics).toContain('Tachkent')
    expect(ics).toContain('Samarcande')
    expect(ics).toContain('Afrosiyob')
  })

  it('includes accommodation in description', () => {
    const ics = unfoldICS(generateICSContent([fullDay]))
    expect(ics).toContain('Hôtel Registan Plaza')
    expect(ics).toContain('1 Place du Régistan')
  })

  it('includes highlights in description', () => {
    const ics = generateICSContent([fullDay])
    expect(ics).toContain('Nécropole Chah-i-Zinda')
  })

  it('includes tips in description', () => {
    const ics = unfoldICS(generateICSContent([fullDay]))
    expect(ics).toContain('Arriver tôt le matin')
  })

  it('escapes semicolons in text fields', () => {
    const ics = generateICSContent([specialCharsDay])
    expect(ics).toContain('\\;')
  })

  it('escapes commas in text fields', () => {
    const ics = generateICSContent([specialCharsDay])
    expect(ics).toContain('\\,')
  })

  it('escapes backslashes in text fields', () => {
    const ics = generateICSContent([specialCharsDay])
    expect(ics).toContain('\\\\')
  })

  it('folds lines longer than 75 characters', () => {
    // fullDay has a long description that should be folded
    const ics = generateICSContent([fullDay])
    const lines = ics.split('\r\n')
    for (const line of lines) {
      // Folded continuation lines start with a space; the space counts toward
      // the 75-octet rule only in the previous line (RFC 5545 §3.1).
      // Here we check that no line exceeds 75 chars (the spec limit).
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it('returns an empty events section for an empty days array', () => {
    const ics = generateICSContent([])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('handles a day without optional fields gracefully', () => {
    expect(() => generateICSContent([minimalDay])).not.toThrow()
    const ics = generateICSContent([minimalDay])
    expect(ics).toContain('BEGIN:VEVENT')
  })
})

// ---------------------------------------------------------------------------
// getGoogleCalendarUrl
// ---------------------------------------------------------------------------

describe('getGoogleCalendarUrl', () => {
  it('returns a valid Google Calendar URL', () => {
    const url = getGoogleCalendarUrl(minimalDay)
    expect(url).toMatch(/^https:\/\/www\.google\.com\/calendar\/render/)
  })

  it('includes the action=TEMPLATE parameter', () => {
    const url = getGoogleCalendarUrl(minimalDay)
    expect(url).toContain('action=TEMPLATE')
  })

  it('encodes the event title (text parameter)', () => {
    const url = getGoogleCalendarUrl(minimalDay)
    const params = new URL(url).searchParams
    expect(params.get('text')).toContain('Jour 1')
    expect(params.get('text')).toContain('Arrivée à Tachkent')
  })

  it('encodes the dates range correctly', () => {
    const url = getGoogleCalendarUrl(minimalDay)
    const params = new URL(url).searchParams
    // Dates format: YYYYMMDD/YYYYMMDD
    expect(params.get('dates')).toBe('20260510/20260511')
  })

  it('sets the end date to the next day', () => {
    const url = getGoogleCalendarUrl(minimalDay)
    const params = new URL(url).searchParams
    const [, end] = (params.get('dates') ?? '/').split('/')
    expect(end).toBe('20260511')
  })

  it('sets the location to the city', () => {
    const url = getGoogleCalendarUrl(minimalDay)
    const params = new URL(url).searchParams
    expect(params.get('location')).toBe('Tachkent')
  })

  it('includes activity names in details for a full day', () => {
    const url = getGoogleCalendarUrl(fullDay)
    const params = new URL(url).searchParams
    expect(params.get('details')).toContain('Régistan')
    expect(params.get('details')).toContain('Bibi-Khanym')
  })

  it('includes transport info in details', () => {
    const url = getGoogleCalendarUrl(fullDay)
    const params = new URL(url).searchParams
    expect(params.get('details')).toContain('Train')
  })

  it('does not throw for a minimal day without optional fields', () => {
    expect(() => getGoogleCalendarUrl(minimalDay)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// downloadICS
// ---------------------------------------------------------------------------

describe('downloadICS', () => {
  let clickMock: ReturnType<typeof vi.fn>
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let originalURL: typeof globalThis.URL | undefined
  let originalDocument: Document | undefined

  beforeEach(() => {
    clickMock = vi.fn()
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url')
    revokeObjectURLMock = vi.fn()

    originalURL = globalThis.URL
    originalDocument = globalThis.document

    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      },
    })

    const mockLink = { href: '', download: '', click: clickMock }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn().mockReturnValue(mockLink),
      },
    })
  })

  afterEach(() => {
    if (originalURL === undefined) {
      delete (globalThis as { URL?: unknown }).URL
    } else {
      Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        writable: true,
        value: originalURL,
      })
    }

    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: originalDocument,
      })
    }

    vi.clearAllMocks()
  })

  it('creates a Blob with the text/calendar MIME type', () => {
    downloadICS([minimalDay], 'trip.ics')
    const blobArg = createObjectURLMock.mock.calls[0]?.[0]
    expect(blobArg).toBeInstanceOf(Blob)
    expect((blobArg as Blob).type).toBe('text/calendar;charset=utf-8')
  })

  it('sets the anchor download attribute to the provided filename', () => {
    const mockLink = { href: '', download: '', click: clickMock }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn().mockReturnValue(mockLink),
      },
    })
    downloadICS([minimalDay], 'my-trip.ics')
    expect(mockLink.download).toBe('my-trip.ics')
  })

  it('calls click() on the anchor element', () => {
    downloadICS([minimalDay], 'trip.ics')
    expect(clickMock).toHaveBeenCalledOnce()
  })

  it('revokes the object URL after triggering the download', () => {
    downloadICS([minimalDay], 'trip.ics')
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url')
  })

  it('works with multiple days', () => {
    expect(() => downloadICS([minimalDay, fullDay], 'multi.ics')).not.toThrow()
    expect(clickMock).toHaveBeenCalledOnce()
  })

  it('works with an empty days array', () => {
    expect(() => downloadICS([], 'empty.ics')).not.toThrow()
    expect(clickMock).toHaveBeenCalledOnce()
  })
})
