import {
  buildRouteSketch,
  cityOfDay,
  countAccommodations,
  countTransports,
  describeTripMoment,
  formatMonthYear,
  formatRelativeDays,
  formatTripOrigin,
  formatTripRange,
  formatWeekdayShort,
  groupTripsByStatus,
  plural,
} from '@/components/trip-menu/trip-format'
import type { DayItinerary } from '@/lib/itinerary-data'
import type { TripSummary } from '@/lib/trips'

function summary(partial: Partial<TripSummary>): TripSummary {
  return {
    id: 'trip',
    title: 'Voyage',
    source: 'json',
    createdAt: 0,
    updatedAt: 0,
    isDemo: false,
    startDate: '2026-05-10',
    endDate: '2026-05-29',
    dayCount: 20,
    cityCount: 7,
    cities: [],
    status: 'upcoming',
    ...partial,
  }
}

function day(partial: Partial<DayItinerary>): DayItinerary {
  return {
    id: 'd',
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Jour',
    activities: [],
    coordinates: [31.23, 121.47],
    ...partial,
  }
}

describe('groupTripsByStatus', () => {
  it('range en cours, à venir puis passés, sans section vide', () => {
    const trips = [
      summary({ id: 'a', status: 'past' }),
      summary({ id: 'b', status: 'ongoing' }),
      summary({ id: 'c', status: 'past' }),
    ]
    const sections = groupTripsByStatus(trips)
    expect(sections.map((s) => s.status)).toEqual(['ongoing', 'past'])
    expect(sections[0].label).toBe('En cours')
    expect(sections[1].trips.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('renvoie une liste vide sans voyage', () => {
    expect(groupTripsByStatus([])).toEqual([])
  })
})

describe('formatTripRange', () => {
  it('abrège un voyage dans un seul mois', () => {
    expect(formatTripRange('2026-05-10', '2026-05-29')).toBe('10 → 29 mai')
  })

  it('ajoute l’année sur demande', () => {
    expect(
      formatTripRange('2027-04-12', '2027-04-25', { withYear: true }),
    ).toBe('12 → 25 avr. 2027')
  })

  it('nomme les deux mois quand le voyage les chevauche', () => {
    expect(formatTripRange('2026-05-28', '2026-06-03')).toBe('28 mai → 3 juin')
  })

  it('donne les deux années quand le voyage passe le Nouvel An', () => {
    expect(formatTripRange('2026-12-28', '2027-01-03')).toBe(
      '28 déc. 2026 → 3 janv. 2027',
    )
  })

  it('gère un voyage d’un jour et l’absence de dates', () => {
    expect(formatTripRange('2026-05-10', '2026-05-10')).toBe('10 mai')
    expect(formatTripRange(null, null)).toBeNull()
  })
})

describe('formatMonthYear / formatWeekdayShort', () => {
  it('situe un voyage passé au mois', () => {
    expect(formatMonthYear('2025-10-04')).toBe('oct. 2025')
    expect(formatMonthYear(null)).toBeNull()
  })

  it('abrège le jour de la semaine en capitales, sans point', () => {
    // Le 14 mai 2026 est un jeudi.
    expect(formatWeekdayShort('2026-05-14')).toBe('JEU')
  })
})

describe('formatRelativeDays / formatTripOrigin', () => {
  const now = new Date(2026, 9, 4, 15, 0)

  it('compte les jours calendaires écoulés', () => {
    expect(formatRelativeDays(new Date(2026, 9, 4, 8).getTime(), now)).toBe(
      'aujourd’hui',
    )
    expect(formatRelativeDays(new Date(2026, 9, 3, 23).getTime(), now)).toBe(
      'hier',
    )
    expect(formatRelativeDays(new Date(2026, 9, 2).getTime(), now)).toBe(
      'il y a 2 jours',
    )
    expect(formatRelativeDays(new Date(2026, 6, 4).getTime(), now)).toBe(
      'il y a 3 mois',
    )
    expect(formatRelativeDays(new Date(2024, 9, 1).getTime(), now)).toBe(
      'il y a 2 ans',
    )
  })

  it('choisit le verbe selon la provenance', () => {
    const twoDaysAgo = new Date(2026, 9, 2).getTime()
    expect(formatTripOrigin('generator', twoDaysAgo, now)).toBe(
      'Généré il y a 2 jours',
    )
    expect(formatTripOrigin('share', twoDaysAgo, now)).toBe(
      'Reçu il y a 2 jours',
    )
    expect(formatTripOrigin('xlsx', twoDaysAgo, now)).toBe(
      'Importé il y a 2 jours',
    )
    expect(formatTripOrigin('demo', twoDaysAgo, now)).toBe('Voyage d’exemple')
  })

  it('ne dit rien d’un voyage migré, dont la date ne signifie rien', () => {
    expect(formatTripOrigin('legacy', Date.now(), now)).toBeNull()
  })
})

describe('describeTripMoment', () => {
  it('donne le jour et l’avancement pendant le voyage', () => {
    const moment = describeTripMoment(
      summary({ status: 'ongoing' }),
      new Date(2026, 4, 14),
    )
    expect(moment.dayNumber).toBe(5)
    expect(moment.headline).toBe('En cours · jour 5 sur 20')
    expect(moment.progress).toBeCloseTo(0.25)
  })

  it('compte les jours avant le départ', () => {
    expect(
      describeTripMoment(summary({ status: 'upcoming' }), new Date(2026, 4, 1))
        .headline,
    ).toBe('À venir · dans 9 jours')
    expect(
      describeTripMoment(summary({ status: 'upcoming' }), new Date(2026, 4, 9))
        .headline,
    ).toBe('À venir · demain')
  })

  it('marque un voyage passé comme terminé', () => {
    const moment = describeTripMoment(summary({ status: 'past' }))
    expect(moment.headline).toBe('Terminé')
    expect(moment.progress).toBeNull()
  })
})

describe('comptes et pluriels', () => {
  it('compte les trajets et les hébergements distincts', () => {
    const stay = {
      id: 'h1',
      name: 'Hôtel du Bund',
      address: '',
      bookingUrl: '',
      checkIn: '',
      checkOut: '',
    }
    const days = [
      day({ accommodation: stay, transport: { id: 't', type: 'train' } }),
      day({ accommodation: { ...stay, id: 'h1-bis' } }),
      day({ accommodation: { ...stay, id: 'h2', name: 'Autre' } }),
    ]
    expect(countTransports(days)).toBe(1)
    expect(countAccommodations(days)).toBe(2)
  })

  it('accorde au pluriel', () => {
    expect(plural(1, 'jour')).toBe('1 jour')
    expect(plural(3, 'jour')).toBe('3 jours')
    expect(plural(2, 'autre journée', 'autres journées')).toBe(
      '2 autres journées',
    )
  })

  it('retrouve la ville du jour', () => {
    const days = [day({ city: 'Shanghai' }), day({ city: 'Pékin' })]
    expect(cityOfDay(days, 2)).toBe('Pékin')
    expect(cityOfDay(days, null)).toBeNull()
  })
})

describe('buildRouteSketch', () => {
  const box = { width: 100, height: 60, padding: 10 }

  it('reste dans la boîte, marges comprises', () => {
    const sketch = buildRouteSketch(
      [
        [31.23, 121.47],
        [36.07, 120.38],
        [39.9, 116.4],
        [34.34, 108.94],
      ],
      box,
    )!
    expect(sketch.points).toHaveLength(4)
    for (const point of sketch.points) {
      expect(point.x).toBeGreaterThanOrEqual(10)
      expect(point.x).toBeLessThanOrEqual(90)
      expect(point.y).toBeGreaterThanOrEqual(10)
      expect(point.y).toBeLessThanOrEqual(50)
    }
    expect(sketch.path.startsWith('M')).toBe(true)
    expect(sketch.path.match(/L/g)).toHaveLength(3)
  })

  it('met le nord en haut et l’est à droite', () => {
    const sketch = buildRouteSketch(
      [
        [30, 100],
        [40, 110],
      ],
      box,
    )!
    const [south, north] = sketch.points
    expect(north.y).toBeLessThan(south.y)
    expect(north.x).toBeGreaterThan(south.x)
  })

  it('fusionne les journées consécutives au même endroit', () => {
    const sketch = buildRouteSketch(
      [
        [31.23, 121.47],
        [31.23, 121.47],
        [39.9, 116.4],
      ],
      box,
    )!
    expect(sketch.points).toHaveLength(2)
    expect(sketch.pointIndexByInput).toEqual([0, 0, 1])
  })

  it('ignore les coordonnées absentes ou nulles', () => {
    const sketch = buildRouteSketch(
      [[0, 0], undefined, [31.23, 121.47], [Number.NaN, 2]],
      box,
    )!
    expect(sketch.points).toHaveLength(1)
    expect(sketch.pointIndexByInput).toEqual([-1, -1, 0, 0])
    // Un seul point : au centre de la boîte.
    expect(sketch.points[0]).toEqual({ x: 50, y: 30 })
  })

  it('renvoie null sans étape utilisable', () => {
    expect(buildRouteSketch([], box)).toBeNull()
    expect(buildRouteSketch([[0, 0]], box)).toBeNull()
  })
})
