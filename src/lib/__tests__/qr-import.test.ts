import { compressItinerary } from '@/lib/qr-export'
import { decompressItinerary } from '@/lib/qr-import'
import type { DayItinerary } from '@/lib/itinerary-data'

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    address: "1 Place de l'Hôtel-de-Ville, 75004 Paris",
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

function makeMultiDayItinerary(count: number): DayItinerary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `day-${i + 1}`,
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    dayNumber: i + 1,
    city: `Ville-${i + 1}`,
    title: `Visite de Ville-${i + 1}`,
    activities: [],
    coordinates: [48.8 + i * 0.01, 2.3 + i * 0.01] as [number, number],
  }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('decompressItinerary', () => {
  it('should restore exactly the data compressed by compressItinerary', async () => {
    const compressed = await compressItinerary([oneDay])
    const restored = decompressItinerary(compressed)
    expect(restored).toEqual([oneDay])
  })

  it('should restore a multi-day itinerary without data loss', async () => {
    const days = makeMultiDayItinerary(5)
    const compressed = await compressItinerary(days)
    const restored = decompressItinerary(compressed)
    expect(restored).toEqual(days)
  })

  it('should restore a compressed empty array as an empty array', async () => {
    const compressed = await compressItinerary([])
    const restored = decompressItinerary(compressed)
    expect(Array.isArray(restored)).toBe(true)
    expect(restored).toHaveLength(0)
  })

  it('should throw for an invalid base64url string', () => {
    expect(() => decompressItinerary('données-invalides!!')).toThrow()
  })

  it('should throw when decompressed data is not an array', async () => {
    const { encode } = await import('@msgpack/msgpack')
    const { deflateSync } = await import('fflate')
    const packed = encode({ not: 'an array' })
    const compressed = deflateSync(packed as Uint8Array, { level: 9 })
    let binary = ''
    for (let i = 0; i < compressed.length; i++) {
      binary += String.fromCharCode(compressed[i])
    }
    const b64url = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    expect(() => decompressItinerary(b64url)).toThrow('Format invalide')
  })
})

// ── Test d'intégration : export → import ──────────────────────────────────────

describe('compressItinerary / decompressItinerary — integration', () => {
  it('should produce identical data after a full export-then-import roundtrip', async () => {
    const original = makeMultiDayItinerary(3)
    const compressed = await compressItinerary(original)
    const restored = decompressItinerary(compressed)
    expect(restored).toEqual(original)
  })

  it('should preserve all optional fields (accommodation, transport, notes) across the roundtrip', async () => {
    const compressed = await compressItinerary([oneDay])
    const [restored] = decompressItinerary(compressed)
    expect(restored.accommodation).toEqual(oneDay.accommodation)
    expect(restored.transport).toEqual(oneDay.transport)
  })

  it('should handle a single-day itinerary roundtrip without modification', async () => {
    const compressed = await compressItinerary([oneDay])
    const restored = decompressItinerary(compressed)
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe(oneDay.id)
    expect(restored[0].city).toBe(oneDay.city)
  })
})
