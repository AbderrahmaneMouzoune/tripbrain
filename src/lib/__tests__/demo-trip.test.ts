import { DEMO_TODAY_DAY, demoItineraryFor } from '@/lib/demo-trip'
import { itinerary } from '@/lib/itinerary-data'

describe('demoItineraryFor', () => {
  const today = new Date(2026, 9, 11, 15, 30)
  const demo = demoItineraryFor(itinerary, today)

  it('fait tomber le jour de démonstration aujourd’hui', () => {
    expect(demo[DEMO_TODAY_DAY - 1].date).toBe('2026-10-11')
    expect(demo[0].date).toBe('2026-10-09')
  })

  it('décale toutes les dates du même écart, hôtels compris', () => {
    expect(demo).toHaveLength(itinerary.length)
    demo.forEach((day, index) => {
      const original = itinerary[index]
      const shift = (iso: string) =>
        (Date.parse(iso) - Date.parse(original.date)) / 86_400_000
      expect(
        (Date.parse(day.date) - Date.parse(demo[0].date)) / 86_400_000,
      ).toBe(
        (Date.parse(original.date) - Date.parse(itinerary[0].date)) /
          86_400_000,
      )
      if (original.accommodation?.checkIn && day.accommodation?.checkIn) {
        expect(
          (Date.parse(day.accommodation.checkIn) - Date.parse(day.date)) /
            86_400_000,
        ).toBe(shift(original.accommodation.checkIn))
      }
    })
  })

  it('laisse le voyage d’origine intact', () => {
    expect(itinerary[0].date).toBe('2026-05-10')
  })
})
