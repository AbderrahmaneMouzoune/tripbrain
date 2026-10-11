import type { DayItinerary } from '@/lib/itinerary-data'
import { swapDayPlans, swapLeavesBookingsBehind } from '@/lib/itinerary-edit'

function day(
  index: number,
  city: string,
  extra: Partial<DayItinerary> = {},
): DayItinerary {
  return {
    id: `day-${index + 1}`,
    date: `2026-05-1${index}`,
    dayNumber: index + 1,
    city,
    title: `Programme ${index + 1}`,
    activities: [
      { id: `act-${index}`, name: `Visite ${index}`, type: 'visit' },
    ],
    coordinates: [index, index],
    ...extra,
  }
}

describe('swapDayPlans', () => {
  const train = { id: 'tr-1', type: 'train' as const, from: 'A', to: 'B' }
  const itinerary = [
    day(0, 'Pékin', { notes: 'Note 1', transport: train }),
    day(1, 'Pékin', { highlights: ['Muraille'] }),
    day(2, 'Xi’an'),
  ]

  it('échange le programme et garde le calendrier en place', () => {
    const swapped = swapDayPlans(itinerary, 0, 1)
    expect(swapped[0].id).toBe('day-1')
    expect(swapped[0].date).toBe('2026-05-10')
    expect(swapped[0].title).toBe('Programme 2')
    expect(swapped[0].highlights).toEqual(['Muraille'])
    expect(swapped[0].notes).toBeUndefined()
    expect(swapped[0].transport).toBe(train)
    expect(swapped[1].title).toBe('Programme 1')
    expect(swapped[1].notes).toBe('Note 1')
    expect(swapped[1].transport).toBeUndefined()
    expect(swapped[2]).toBe(itinerary[2])
  })

  it('ne change rien pour des index identiques ou hors bornes', () => {
    expect(swapDayPlans(itinerary, 1, 1)).toBe(itinerary)
    expect(swapDayPlans(itinerary, -1, 1)).toBe(itinerary)
    expect(swapDayPlans(itinerary, 0, 9)).toBe(itinerary)
  })

  it('signale un trajet laissé derrière quand les villes diffèrent', () => {
    expect(swapLeavesBookingsBehind(itinerary, 0, 1)).toBe(false)
    expect(swapLeavesBookingsBehind(itinerary, 0, 2)).toBe(true)
    expect(swapLeavesBookingsBehind(itinerary, 1, 2)).toBe(false)
  })
})
