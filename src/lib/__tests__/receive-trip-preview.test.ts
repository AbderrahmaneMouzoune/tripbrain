import {
  formatTripRange,
  joinFrench,
  previewIncludes,
  previewStats,
  projectRoute,
} from '@/components/receive/trip-preview-data'
import { itinerary as demo } from '@/lib/itinerary-data'
import type { DayItinerary } from '@/lib/itinerary-data'

function makeDay(
  overrides: Partial<DayItinerary> & Pick<DayItinerary, 'city' | 'coordinates'>,
): DayItinerary {
  return {
    id: `day-${overrides.city}`,
    date: '2026-05-10',
    dayNumber: 1,
    title: overrides.city,
    activities: [],
    ...overrides,
  }
}

const box = { width: 350, height: 170, padding: 20 }

describe('projectRoute', () => {
  it('ne garde qu’un point pour deux journées au même endroit', () => {
    const route = projectRoute(
      [
        makeDay({ city: 'A', coordinates: [10, 10] }),
        makeDay({ city: 'A', coordinates: [10, 10] }),
        makeDay({ city: 'B', coordinates: [20, 20] }),
      ],
      box,
    )
    expect(route.points).toHaveLength(2)
    expect(route.stops.map((s) => s.label)).toEqual(['A', 'B'])
  })

  it('reste dans la boîte, nord en haut, proportions conservées', () => {
    const route = projectRoute(
      [
        makeDay({ city: 'Sud-Ouest', coordinates: [0.5, 0.5] }),
        makeDay({ city: 'Nord-Est', coordinates: [10, 30] }),
      ],
      box,
    )
    for (const p of route.points) {
      expect(p.x).toBeGreaterThanOrEqual(box.padding)
      expect(p.x).toBeLessThanOrEqual(box.width - box.padding)
      expect(p.y).toBeGreaterThanOrEqual(box.padding)
      expect(p.y).toBeLessThanOrEqual(box.height - box.padding)
    }
    const [southWest, northEast] = route.points
    // Plus au nord = plus haut à l'écran ; plus à l'est = plus à droite.
    expect(northEast.y).toBeLessThan(southWest.y)
    expect(northEast.x).toBeGreaterThan(southWest.x)
    // Le tracé occupe toute la largeur (dimension limitante), centré en hauteur.
    expect(southWest.x).toBe(box.padding)
    expect(northEast.x).toBe(box.width - box.padding)
  })

  it('centre un voyage d’un seul lieu', () => {
    const route = projectRoute(
      [makeDay({ city: 'Lisbonne', coordinates: [38.7, -9.1] })],
      box,
    )
    expect(route.points).toEqual([{ x: 175, y: 85 }])
  })

  it('ignore les coordonnées absentes ou nulles', () => {
    const route = projectRoute(
      [
        makeDay({ city: 'Inconnu', coordinates: [0, 0] }),
        makeDay({ city: 'Faux', coordinates: [Number.NaN, 2] }),
      ],
      box,
    )
    expect(route).toEqual({ points: [], stops: [] })
  })

  it('n’étiquette une ville revisitée qu’une fois', () => {
    const route = projectRoute(demo, box)
    const labels = route.stops.map((s) => s.label).filter(Boolean)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toContain('Taipei')
    // Le tracé passe et repasse par Shanghai : plus de points que d'étapes.
    expect(route.points.length).toBeGreaterThan(route.stops.length)
  })
})

describe('previewStats', () => {
  it('compte le voyage d’exemple comme annoncé (20 jours, 7 villes, 9 hébergements, 9 trajets)', () => {
    expect(previewStats(demo)).toMatchObject({
      days: 20,
      cities: 7,
      accommodations: 9,
      transports: 9,
    })
  })

  it('ne compte qu’une fois un hébergement sur plusieurs nuits', () => {
    const stay = {
      id: 'h1',
      name: 'Hôtel',
      address: 'Rue',
      bookingUrl: '',
      checkIn: '',
      checkOut: '',
    }
    const stats = previewStats([
      makeDay({ city: 'A', coordinates: [1, 1], accommodation: stay }),
      makeDay({ city: 'A', coordinates: [1, 1], accommodation: stay }),
    ])
    expect(stats.accommodations).toBe(1)
    expect(stats.transports).toBe(0)
  })
})

describe('previewIncludes', () => {
  it('ne liste que ce que le voyage contient', () => {
    expect(
      previewIncludes([makeDay({ city: 'A', coordinates: [1, 1] })]),
    ).toEqual([])
    expect(
      previewIncludes([
        makeDay({
          city: 'A',
          coordinates: [1, 1],
          foodRecommendations: ['Pastéis'],
          activities: [
            {
              id: 'a',
              name: 'Musée',
              type: 'visit',
              openAt: '10:00–18:00',
            },
          ],
        }),
      ]),
    ).toEqual(['Programme jour par jour, avec horaires', 'Plats à goûter'])
  })

  it('décrit le voyage d’exemple', () => {
    const lines = previewIncludes(demo)
    expect(lines[0]).toBe('Programme jour par jour, avec horaires et adresses')
    expect(lines).toContain('Conseils et plats à goûter')
  })
})

describe('joinFrench', () => {
  it('énumère à la française', () => {
    expect(joinFrench([])).toBe('')
    expect(joinFrench(['a'])).toBe('a')
    expect(joinFrench(['a', 'b'])).toBe('a et b')
    expect(joinFrench(['a', 'b', 'c'])).toBe('a, b et c')
  })
})

describe('formatTripRange', () => {
  it('raccourcit selon ce que les dates partagent', () => {
    expect(formatTripRange('2026-05-10', '2026-05-29')).toBe('10 → 29 mai 2026')
    expect(formatTripRange('2026-04-28', '2026-05-03')).toBe(
      '28 avril → 3 mai 2026',
    )
    expect(formatTripRange('2026-05-10', '2026-05-10')).toBe('10 mai 2026')
    expect(formatTripRange('2026-12-28', '2027-01-03')).toMatch(
      /^28 déc\.? 2026 → 3 janv\.? 2027$/,
    )
  })

  it('reste vide sur une date illisible', () => {
    expect(formatTripRange('n’importe quoi', '2026-05-10')).toBe('')
  })
})
