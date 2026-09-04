import {
  SHARE_INLINE_LIMIT,
  compressItinerary,
  createShareCode,
  decompressItinerary,
  fetchSharedItinerary,
  formatExpiresIn,
  formatShareCode,
  getInlineQrUrl,
  getShareCodeUrl,
  summarizeSharedItinerary,
} from '@/lib/share'
import type { DayItinerary } from '@/lib/itinerary-data'

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** One minimal day with accommodation and transport — compresses well under 2 000 chars (QR code autonome). */
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

/** Remplace `fetch` par une réponse contrôlée et retourne l'espion. */
function stubFetch(response: {
  ok?: boolean
  status?: number
  body?: unknown
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.body ?? {},
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('compressItinerary', () => {
  it('retourne une chaîne non vide pour un itinéraire d’une journée', async () => {
    const result = await compressItinerary([oneDay])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('ne lève pas d’erreur pour un itinéraire vide', async () => {
    await expect(compressItinerary([])).resolves.toBeDefined()
  })

  it('produit une sortie plus courte que le JSON d’origine', async () => {
    const itinerary = makeLargeItinerary(10)
    const compressed = await compressItinerary(itinerary)
    expect(compressed.length).toBeLessThan(JSON.stringify(itinerary).length)
  })

  it('accepte une journée réduite à ses champs obligatoires', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const minimalDay = {
      id: 'x',
      date: '2025-01-01',
      dayNumber: 1,
      city: 'X',
      title: 'T',
      activities: [],
      coordinates: [0, 0],
    } as any
    await expect(compressItinerary([minimalDay])).resolves.toMatch(
      /^[A-Za-z0-9_-]+$/,
    )
  })

  it('produit une chaîne base64url (sans +, / ni =)', async () => {
    const result = await compressItinerary([oneDay])
    expect(result).not.toMatch(/[+/=]/)
  })

  it('dépasse la limite inline pour un itinéraire de 30 jours', async () => {
    const compressed = await compressItinerary(makeLargeItinerary(30))
    expect(compressed.length).toBeGreaterThan(SHARE_INLINE_LIMIT)
  })
})

describe('decompressItinerary', () => {
  it('restitue l’itinéraire compressé à l’identique', async () => {
    const itinerary = makeLargeItinerary(3)
    const restored = decompressItinerary(await compressItinerary(itinerary))
    expect(restored).toEqual(itinerary)
  })

  it('préserve les coordonnées et les champs optionnels', async () => {
    const [restored] = decompressItinerary(await compressItinerary([oneDay]))
    expect(restored.coordinates).toEqual(oneDay.coordinates)
    expect(restored.accommodation?.name).toBe(oneDay.accommodation?.name)
    expect(restored.transport?.provider).toBe(oneDay.transport?.provider)
  })

  it('rejette un payload qui n’est pas décodable', () => {
    expect(() => decompressItinerary('pas-un-payload')).toThrow(
      /illisibles ou incomplètes/,
    )
  })

  it('rejette un payload qui ne contient pas un tableau de journées', async () => {
    const compressed = await compressItinerary(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { itinerary: [] } as any,
    )
    expect(() => decompressItinerary(compressed)).toThrow(/itinéraire valide/)
  })

  it('rejette une journée à laquelle il manque des champs obligatoires', async () => {
    const compressed = await compressItinerary(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ id: 'day-1', city: 'Paris' }] as any,
    )
    expect(() => decompressItinerary(compressed)).toThrow(/itinéraire valide/)
  })
})

describe('getInlineQrUrl', () => {
  it('retourne une URL contenant /?import= avec le payload compressé', () => {
    expect(getInlineQrUrl('abc123')).toContain('/?import=abc123')
  })
})

describe('getShareCodeUrl', () => {
  it('retourne une URL contenant /?code= avec le code', () => {
    expect(getShareCodeUrl('K7QP2M4X')).toContain('/?code=K7QP2M4X')
  })
})

describe('formatShareCode', () => {
  it('découpe un code de huit caractères en deux groupes', () => {
    expect(formatShareCode('K7QP2M4X')).toBe('K7QP-2M4X')
  })

  it('laisse un code de quatre caractères intact', () => {
    expect(formatShareCode('8143')).toBe('8143')
  })
})

describe('formatExpiresIn', () => {
  const now = new Date('2026-05-10T12:00:00Z')

  it('retourne null quand l’échéance est inconnue', () => {
    expect(formatExpiresIn(null, now)).toBeNull()
  })

  it('retourne null quand l’échéance est passée', () => {
    expect(formatExpiresIn(new Date('2026-05-10T11:00:00Z'), now)).toBeNull()
  })

  it('exprime les échéances courtes en minutes', () => {
    expect(formatExpiresIn(new Date('2026-05-10T12:45:00Z'), now)).toBe(
      '45 minutes',
    )
  })

  it('exprime une heure au singulier', () => {
    expect(formatExpiresIn(new Date('2026-05-10T13:00:00Z'), now)).toBe(
      '1 heure',
    )
  })
})

describe('summarizeSharedItinerary', () => {
  it('retourne null pour un itinéraire vide', () => {
    expect(summarizeSharedItinerary([])).toBeNull()
  })

  it('résume le nombre de jours et les villes extrêmes', () => {
    const summary = summarizeSharedItinerary(makeLargeItinerary(4))
    expect(summary).toEqual({
      dayCount: 4,
      firstCity: 'Ville-1',
      lastCity: 'Ville-4',
      startDate: '2025-01-01',
      endDate: '2025-01-01',
    })
  })
})

describe('createShareCode', () => {
  it('envoie le payload compressé à /api/share', async () => {
    const fetchMock = stubFetch({ body: { code: 'K7QP2M4X', expiresAt: null } })

    const compressed = await compressItinerary([oneDay])
    await createShareCode(compressed)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/share')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).data).toBe(compressed)
  })

  it('retourne le code et son échéance', async () => {
    stubFetch({
      body: { code: 'K7QP2M4X', expiresAt: '2026-05-10T13:00:00.000Z' },
    })

    const share = await createShareCode('payload')
    expect(share.code).toBe('K7QP2M4X')
    expect(share.expiresAt?.toISOString()).toBe('2026-05-10T13:00:00.000Z')
  })

  it('accepte une réponse sans échéance', async () => {
    stubFetch({ body: { code: 'K7QP2M4X', expiresAt: null } })
    await expect(createShareCode('payload')).resolves.toMatchObject({
      expiresAt: null,
    })
  })

  it('remonte le message d’erreur du serveur', async () => {
    stubFetch({
      ok: false,
      status: 413,
      body: { error: 'Itinéraire trop volumineux pour être partagé.' },
    })
    await expect(createShareCode('payload')).rejects.toThrow(
      'Itinéraire trop volumineux pour être partagé.',
    )
  })

  it('utilise un message générique quand le serveur n’en fournit aucun', async () => {
    stubFetch({ ok: false, status: 500, body: {} })
    await expect(createShareCode('payload')).rejects.toThrow(
      /Le partage a échoué/,
    )
  })

  it('rejette une réponse sans code exploitable', async () => {
    stubFetch({ body: { expiresAt: null } })
    await expect(createShareCode('payload')).rejects.toThrow(
      'Code de partage invalide.',
    )
  })
})

describe('fetchSharedItinerary', () => {
  it('interroge /api/share/<code> et restitue l’itinéraire', async () => {
    const itinerary = makeLargeItinerary(2)
    const fetchMock = stubFetch({
      body: { data: await compressItinerary(itinerary) },
    })

    await expect(fetchSharedItinerary('k7qp-2m4x')).resolves.toEqual(itinerary)
    expect(fetchMock).toHaveBeenCalledWith('/api/share/k7qp-2m4x')
  })

  it('refuse un code vide sans appeler le serveur', async () => {
    const fetchMock = stubFetch({ body: {} })
    await expect(fetchSharedItinerary('   ')).rejects.toThrow(
      'Saisissez un code de partage.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('remonte le message d’erreur du serveur pour un code inconnu', async () => {
    stubFetch({
      ok: false,
      status: 404,
      body: { error: 'Code inconnu ou expiré.' },
    })
    await expect(fetchSharedItinerary('K7QP2M4X')).rejects.toThrow(
      'Code inconnu ou expiré.',
    )
  })

  it('rejette une réponse sans données', async () => {
    stubFetch({ body: { data: '' } })
    await expect(fetchSharedItinerary('K7QP2M4X')).rejects.toThrow(
      'Le partage ne contient aucune donnée.',
    )
  })
})
