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

/** One minimal day — compresses well under 2 000 chars (inline path). */
const oneDay: DayItinerary = {
  id: 'day-1',
  date: '2025-01-01',
  dayNumber: 1,
  city: 'Paris',
  title: 'Arrivée à Paris',
  activities: [],
  coordinates: [48.8566, 2.3522],
}

/**
 * Build N days with enough varied content so the compressed base64url output
 * reliably exceeds the 2 000-char inline limit (upload path).
 * Empirically: 30 days with 3 activities each ≈ 2 828 chars.
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
})

describe('getInlineQrUrl', () => {
  it('should return a URL containing /?import= with the compressed payload', () => {
    const url = getInlineQrUrl('abc123')
    expect(url).toContain('/?import=abc123')
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
      expect.objectContaining({ route: 'json' }),
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

describe('uploadItinerary', () => {
  it('should call uploadFile with the json route and a JSON file', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: { url: 'https://pub.example.com/exports/1234-itinerary.json' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    const url = await uploadItinerary([oneDay])

    expect(uploadFile).toHaveBeenCalledOnce()
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'json',
        file: expect.objectContaining({ name: 'itinerary.json' }),
      }),
    )
    expect(url).toBe('https://pub.example.com/exports/1234-itinerary.json')
  })

  it('should throw when the upload result contains no URL in metadata', async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      metadata: { someOtherField: 42 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: {} as any,
    })

    await expect(uploadItinerary([oneDay])).rejects.toThrow(
      'URL de partage invalide',
    )
  })
})
