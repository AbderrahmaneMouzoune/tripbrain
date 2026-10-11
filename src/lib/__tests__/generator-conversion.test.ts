import { analyzeItinerary } from '@/lib/generator/itinerary-quality'
import {
  toDayItineraries,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import { readGeneratedItinerary } from '@/lib/generator/read-result'
import { compressItinerary, decompressItinerary } from '@/lib/share'

const GENERATED: GeneratedItinerary = {
  tripTitle: 'Japon au printemps',
  summary: 'Tokyo puis Kyoto.',
  days: [
    {
      date: '2027-04-12',
      city: 'Tokyo',
      title: 'Arrivée',
      dayType: 'arrival',
      coordinates: { lat: 35.68, lng: 139.76 },
      highlights: ['Shinjuku'],
      activities: [
        {
          name: 'Shinjuku Gyoen',
          type: 'visit',
          duration: '1h30',
          coordinates: { lat: 35.685, lng: 139.71 },
          price: 5,
          currency: 'EUR',
        },
        { name: 'Ramen', type: 'food', duration: '1h' },
      ],
    },
    {
      date: '2027-04-13',
      city: 'Kyoto',
      title: 'Vers Kyoto',
      transport: {
        type: 'train',
        from: 'Tokyo',
        to: 'Kyoto',
        duration: '2h15',
      },
      activities: [{ name: 'Fushimi Inari', type: 'visit' }],
    },
  ],
}

describe('toDayItineraries', () => {
  const days = toDayItineraries(GENERATED)

  it('produit des journées au format de l’app, aux identifiants stables', () => {
    expect(days).toHaveLength(2)
    expect(days[0]).toMatchObject({
      id: 'day-1',
      dayNumber: 1,
      date: '2027-04-12',
      city: 'Tokyo',
      coordinates: [35.68, 139.76],
      source: 'ai',
    })
    expect(days[0].activities.map((activity) => activity.id)).toEqual([
      'act-1-1',
      'act-1-2',
    ])
    expect(days[0].activities[0]).toMatchObject({
      coordinates: [35.685, 139.71],
      status: 'planned',
      source: 'ai',
      price: 5,
    })
    expect(days[1].transport).toMatchObject({
      id: 'transport-2',
      type: 'train',
      from: 'Tokyo',
      to: 'Kyoto',
      status: 'planned',
    })
  })

  it('met l’origine du repère quand la ville n’a pas de coordonnées', () => {
    expect(days[1].coordinates).toEqual([0, 0])
  })

  it('ne laisse aucune clé à undefined', () => {
    const hasUndefined = (value: unknown): boolean =>
      typeof value === 'object' && value !== null
        ? Object.values(value).some(
            (field) => field === undefined || hasUndefined(field),
          )
        : false
    expect(hasUndefined(days)).toBe(false)
  })

  it('passe la validation du partage, comme un voyage venu du site', async () => {
    const payload = await compressItinerary(days)
    expect(decompressItinerary(payload)).toEqual(days)
  })

  it('alimente le rapport de qualité de l’app', () => {
    const report = analyzeItinerary(days)
    expect(report.stats).toEqual({
      days: 2,
      activities: 3,
      cities: ['Tokyo', 'Kyoto'],
    })
    expect(report.issues.some((issue) => issue.field === 'coordinates')).toBe(
      true,
    )
  })
})

describe('readGeneratedItinerary', () => {
  it('recale les dates sur le départ choisi', () => {
    const text = JSON.stringify({
      ...GENERATED,
      days: GENERATED.days.map((day) => ({ ...day, date: '2023-01-01' })),
    })
    const result = readGeneratedItinerary(text, '2027-05-01')
    expect(result.truncated).toBe(false)
    expect(result.itinerary?.days.map((day) => day.date)).toEqual([
      '2027-05-01',
      '2027-05-02',
    ])
  })

  it('garde les journées complètes d’une réponse coupée', () => {
    const full = JSON.stringify(GENERATED)
    const cut = full.slice(0, full.indexOf('"Vers Kyoto"'))
    const result = readGeneratedItinerary(cut, '2027-04-12')
    expect(result.truncated).toBe(true)
    expect(result.itinerary?.days).toHaveLength(1)
    expect(result.itinerary?.days[0].city).toBe('Tokyo')
  })

  it('rend null quand la réponse n’est pas un itinéraire', () => {
    expect(
      readGeneratedItinerary('Désolé, je ne peux pas.', '2027-04-12'),
    ).toMatchObject({ itinerary: null })
    expect(
      readGeneratedItinerary(
        '{"tripTitle":"x","summary":"y","days":[]}',
        '2027-04-12',
      ).itinerary,
    ).toBeNull()
  })
})
