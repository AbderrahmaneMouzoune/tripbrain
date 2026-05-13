import { compressItinerary, exportItineraryQR } from '@/lib/qr-export'
import type { DayItinerary } from '@/lib/itinerary-data'

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
  vi.unstubAllGlobals()
})

describe('compressItinerary', () => {
  it("retourne une chaîne non vide pour un itinéraire d'un seul jour", async () => {
    const result = await compressItinerary([oneDay])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it("ne lève pas d'erreur pour un itinéraire vide", async () => {
    await expect(compressItinerary([])).resolves.toBeDefined()
  })
})

describe('exportItineraryQR — chemin inline', () => {
  it('retourne une URI commençant par tripbrain://v1/ quand les données tiennent en inline (≤ 2 000 chars)', async () => {
    const uri = await exportItineraryQR([oneDay])
    expect(uri).toMatch(/^tripbrain:\/\/v1\//)
  })

  it('intègre le payload compressé directement dans la URI', async () => {
    const compressed = await compressItinerary([oneDay])
    const uri = await exportItineraryQR([oneDay])
    expect(uri).toBe(`tripbrain://v1/${compressed}`)
  })
})

describe('exportItineraryQR — chemin upload', () => {
  it('le grand itinéraire (30 jours) dépasse bien 2 000 caractères après compression', async () => {
    const compressed = await compressItinerary(makeLargeItinerary(30))
    expect(compressed.length).toBeGreaterThan(2000)
  })

  it('appelle fetch quand les données compressées dépassent 2 000 caractères', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://example.com/trip/abc123' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await exportItineraryQR(makeLargeItinerary(30))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it("retourne l'URL du serveur après un upload réussi", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/trip/xyz' }),
      }),
    )

    const result = await exportItineraryQR(makeLargeItinerary(30))
    expect(result).toBe('https://cdn.example.com/trip/xyz')
  })

  it('lève une erreur avec le message du serveur en cas de réponse non-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Upload non implémenté côté serveur.' }),
      }),
    )

    await expect(exportItineraryQR(makeLargeItinerary(30))).rejects.toThrow(
      'Upload non implémenté côté serveur.',
    )
  })

  it('lève "Erreur inconnue" quand le corps de la réponse d\'erreur ne peut pas être analysé comme JSON', async () => {
    // response.json() throws → .catch(() => ({ error: 'Erreur inconnue' })) kicks in
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError('not json')
        },
      }),
    )

    await expect(exportItineraryQR(makeLargeItinerary(30))).rejects.toThrow(
      'Erreur inconnue',
    )
  })

  it('lève "Téléversement échoué" quand la réponse d\'erreur ne contient pas de champ error', async () => {
    // response.json() resolves with {} → err.error is undefined → fallback message
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    )

    await expect(exportItineraryQR(makeLargeItinerary(30))).rejects.toThrow(
      'Téléversement échoué',
    )
  })
})
