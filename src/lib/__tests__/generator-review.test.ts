import { analyzeItinerary } from '@/lib/generator/itinerary-quality'
import { toDayItineraries } from '@/lib/generator/itinerary-schema'
import {
  confidenceBars,
  dayRangeLabel,
  formatTripRange,
  groupByCity,
  reviewPoints,
} from '@/lib/generator/review'

const days = toDayItineraries({
  tripTitle: 'Japon',
  summary: '',
  days: [
    {
      date: '2099-04-12',
      city: 'Tokyo',
      title: 'Arrivée',
      coordinates: { lat: 35.6, lng: 139.7 },
      activities: [
        {
          name: 'Senso-ji',
          type: 'visit',
          duration: '1h',
          coordinates: { lat: 35.7, lng: 139.79 },
        },
      ],
    },
    {
      date: '2099-04-13',
      city: 'Tokyo',
      title: 'Shibuya',
      coordinates: { lat: 35.6, lng: 139.7 },
      activities: [],
    },
    {
      date: '2099-04-14',
      city: 'Hakone',
      title: 'Lac Ashi',
      activities: [{ name: 'Owakudani', type: 'visit' }],
    },
    {
      date: '2099-04-15',
      city: 'Tokyo',
      title: 'Retour',
      coordinates: { lat: 35.6, lng: 139.7 },
      activities: [
        {
          name: 'Ginza',
          type: 'shopping',
          duration: '2h',
          coordinates: { lat: 35.67, lng: 139.76 },
        },
      ],
    },
  ],
})

describe('reviewPoints', () => {
  const report = analyzeItinerary(days)

  it('regroupe les défauts de fond par journée, avec la ville', () => {
    const points = reviewPoints(report, days)
    expect(points.find((point) => point.id === 'day-2')).toMatchObject({
      heading: 'Jour 2 · Tokyo :',
      summary: 'aucune activité prévue ce jour-là : ajoutez-en une.',
    })
  })

  it('réunit les détails d’agrément en une ligne chacun', () => {
    const points = reviewPoints(report, days)
    expect(points.map((point) => point.id)).toEqual([
      'day-2',
      'day-coordinates',
      'activities',
    ])
    const activities = points.find((point) => point.id === 'activities')
    expect(activities?.heading).toBe('1 activité à préciser :')
    expect(activities?.details).toHaveLength(2)
  })

  it('signale en tête une génération coupée', () => {
    const points = reviewPoints(report, days, {
      truncated: true,
      expectedDays: 10,
    })
    expect(points[0]).toMatchObject({
      id: 'truncated',
      summary: '4 jours sur 10 ont été écrits',
    })
  })

  it('ne signale rien sur un itinéraire complet', () => {
    const clean = [days[0]]
    expect(reviewPoints(analyzeItinerary(clean), clean)).toEqual([])
  })
})

describe('groupByCity', () => {
  it('regroupe les journées consécutives, dans l’ordre du voyage', () => {
    expect(groupByCity(days)).toEqual([
      { city: 'Tokyo', dayIndexes: [0, 1] },
      { city: 'Hakone', dayIndexes: [2] },
      { city: 'Tokyo', dayIndexes: [3] },
    ])
    expect(dayRangeLabel([0, 1])).toBe('J1–J2')
    expect(dayRangeLabel([2])).toBe('J3')
  })
})

describe('formatTripRange', () => {
  it('ne répète le mois et l’année que s’ils changent', () => {
    expect(formatTripRange('2027-04-12', 14)).toBe('12 → 25 avril 2027')
    expect(formatTripRange('2027-04-28', 6)).toBe('28 avril → 3 mai 2027')
    expect(formatTripRange('2026-12-30', 6)).toBe(
      '30 décembre 2026 → 4 janvier 2027',
    )
    expect(formatTripRange('2027-04-12', 1)).toBe('12 avril 2027')
    expect(formatTripRange('', 3)).toBe('')
  })
})

describe('confidenceBars', () => {
  it('ramène la confiance sur cinq barres', () => {
    expect(confidenceBars(100)).toBe(5)
    expect(confidenceBars(78)).toBe(4)
    expect(confidenceBars(50)).toBe(3)
    expect(confidenceBars(0)).toBe(0)
  })
})
