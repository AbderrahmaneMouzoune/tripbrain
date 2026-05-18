import {
  compressItinerary,
  exportItineraryQR,
  getInlineQrUrl,
  QR_INLINE_LIMIT,
  uploadItinerary,
} from '@/lib/qr-export'
import type { DayItinerary } from '@/lib/itinerary-data'
import { uploadFile } from '@better-upload/client'

vi.mock('@better-upload/client', () => ({
  uploadFile: vi.fn(),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** One minimal day with accommodation and transport — compresses well under 2 000 chars (inline path). */
const oneDay: DayItinerary = {
  id: 'day-1',
  date: '2025-01-01',
  dayNumber: 1,
  city: 'Paris',
  title: 'Arrivée à Paris',
  activities: [],
  coordinates: [48.8566, 2.3522],
  accommodation: {
    id: 'hotel-1',
    name: 'Hôtel de Ville',
    address: '1 Place de l\'Hôtel-de-Ville, 75004 Paris',
    bookingUrl: 'https://booking.com/hotel-de-ville',
    checkIn: '2025-01-01T15:00:00',
    checkOut: '2025-01-02T11:00:00',
    price: 180,
    currency: 'EUR',
    status: 'booked',
  },
  transport: {
    id: 'transport-1',
    type: 'train',
    from: 'CDG',
    to: 'Paris Gare du Nord',
    departureTime: '2025-01-01T09:30:00',
    arrivalTime: '2025-01-01T10:00:00',
    provider: 'RER B',
    status: 'booked',
  },
}

/**
 * Build N days with enough varied content so the compressed base64url output
 * reliably exceeds the 2 000-char inline limit (upload path).
 * Empirically: 30 days with 3 activities each ≈ 2 828 chars.
 * Odd days include transport and accommodation for more realistic data.
 */
function makeLargeItinerary(count: number): DayItinerary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `day-${i + 1}`,
    date: '2025-01-01',
    dayNumber: i + 1,
    city: `Ville-${i + 1}`,
    title: `Visite de la ville numéro ${i + 1} avec des activités intéressantes`,
    notes: `Notes du jour ${i + 1} : beaucoup de choses à faire et à voir dans cette ville.`,
    activities: [
      {
        id: `act-${i}-0`,
        name: `Musée ${i + 1}`,
        type: 'visit' as const,
        description: `Description longue de l'activité ${i + 1}-0 pour tester la compression deflate`,
      },
      {
        id: `act-${i}-1`,
        name: `Restaurant ${i + 1}`,
        type: 'food' as const,
        description: `Description longue de l'activité ${i + 1}-1 avec des informations spécifiques`,
      },
      {
        id: `act-${i}-2`,
        name: `Transport ${i + 1}`,
        type: 'transport' as const,
        description: `Description longue de l'activité ${i + 1}-2 incluant les meilleures pratiques`,
      },
    ],
    coordinates: [48.8 + i * 0.01, 2.3 + i * 0.01] as [number, number],
    ...(i % 2 === 0
      ? {
          transport: {
            id: `transport-day-${i + 1}`,
            type: 'train' as const,
            from: `Ville-${i}`,
            to: `Ville-${i + 1}`,
            departureTime: `2025-01-${String(i + 1).padStart(2, '0')}T08:00:00`,
            arrivalTime: `2025-01-${String(i + 1).padStart(2, '0')}T10:30:00`,
            provider: 'TGV',
            status: 'booked' as const,
          },
          accommodation: {
            id: `hotel-day-${i + 1}`,
            name: `Hôtel de Ville-${i + 1}`,
            address: `${i + 1} Rue Principale, Ville-${i + 1}`,
            bookingUrl: `https://booking.com/hotel-ville-${i + 1}`,
            checkIn: `2025-01-${String(i + 1).padStart(2, '0')}T15:00:00`,
            checkOut: `2025-01-${String(i + 2).padStart(2, '0')}T11:00:00`,
            price: 100 + i * 5,
            currency: 'EUR',
            status: 'booked' as const,
          },
        }
      : {}),
  }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks()
})

describe('compressItinerary', () => {
  it('should return a non-empty string for a single-day itinerary', async () => {
    const result = await compressItinerary([oneDay])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should not throw for an empty itinerary', async () => {
    await expect(compressItinerary([])).resolves.toBeDefined()
  })

  it('should produce output smaller than the original JSON string representation', async () => {
    const itinerary = makeLargeItinerary(10)
    const compressed = await compressItinerary(itinerary)
    const jsonLength = JSON.stringify(itinerary).length
    expect(compressed.length).toBeLessThan(jsonLength)
  })

  it('should handle an itinerary with only required fields and no optional data', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const minimalDay = { id: 'x', date: '2025-01-01', dayNumber: 1, city: 'X', title: 'T', activities: [], coordinates: [0, 0] } as any
    await expect(compressItinerary([minimalDay])).resolves.toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('should produce a base64url-safe string (no +, /, or = characters)', async () => {
    const result = await compressItinerary([oneDay])
    expect(result).not.toMatch(/[+/=]/)
  })
})

describe('getInlineQrUrl', () => {
  it('should return a URL containing /?import= with the compressed payload', () => {
    const url = getInlineQrUrl('abc123')
    expect(url).toContain('/?import=abc123')
  })
})

describe('uploadItinerary', () => {
  it('should call uploadFile with the itinerary-export route and a JSON file', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: { url: 'https://pub.example.com/exports/1234-itinerary.json' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    const compressed = await compressItinerary([oneDay])
    const url = await uploadItinerary(compressed)

    expect(uploadFile).toHaveBeenCalledOnce()
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'itinerary-export',
        file: expect.objectContaining({ name: 'itinerary.json' }),
      }),
    )
    expect(url).toBe('https://pub.example.com/exports/1234-itinerary.json')
  })

  it('should upload a JSON file containing the compressed payload', async () => {
    let capturedFile: File | undefined
    vi.mocked(uploadFile).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ file }: { route: string; file: File }) => {
        capturedFile = file
        return {
          metadata: { url: 'https://pub.example.com/exports/1234.json' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          file: {} as any,
        }
      },
    )

    const compressed = await compressItinerary([oneDay])
    await uploadItinerary(compressed)

    const content = JSON.parse(await capturedFile!.text())
    expect(content.data).toBe(compressed)
  })

  it('should throw when the upload result contains no URL in metadata', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: { someOtherField: 42 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    const compressed = await compressItinerary([oneDay])
    await expect(uploadItinerary(compressed)).rejects.toThrow(
      'URL de partage invalide',
    )
  })
})

describe('exportItineraryQR — inline path', () => {
  it('should return a URL containing /?import= when data fits within 2000 chars', async () => {
    const uri = await exportItineraryQR([oneDay])
    expect(uri).toContain('/?import=')
  })

  it('should embed the compressed payload directly in the URL', async () => {
    const compressed = await compressItinerary([oneDay])
    const uri = await exportItineraryQR([oneDay])
    expect(uri).toBe(`/?import=${compressed}`)
  })
})

describe('exportItineraryQR — upload path', () => {
  it('should exceed 2000 characters when compressing a 30-day itinerary', async () => {
    const compressed = await compressItinerary(makeLargeItinerary(30))
    expect(compressed.length).toBeGreaterThan(QR_INLINE_LIMIT)
  })

  it('should call uploadFile when compressed data exceeds the inline limit', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: { url: 'https://pub.example.com/exports/1234-itinerary.json' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    await exportItineraryQR(makeLargeItinerary(30))

    expect(uploadFile).toHaveBeenCalledOnce()
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'itinerary-export' }),
    )
  })

  it('should return the URL from upload metadata after a successful upload', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: { url: 'https://cdn.example.com/trip/xyz' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    const result = await exportItineraryQR(makeLargeItinerary(30))
    expect(result).toBe('https://cdn.example.com/trip/xyz')
  })

  it('should throw when upload metadata does not contain a URL string', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    await expect(exportItineraryQR(makeLargeItinerary(30))).rejects.toThrow(
      'URL de partage invalide',
    )
  })

  it('should propagate the error when uploadFile rejects', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('Network error'))

    await expect(exportItineraryQR(makeLargeItinerary(30))).rejects.toThrow(
      'Network error',
    )
  })
})
