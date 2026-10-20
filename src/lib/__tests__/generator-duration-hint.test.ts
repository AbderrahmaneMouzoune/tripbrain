import { durationFromDescription } from '@/lib/generator/duration-hint'

describe('durationFromDescription', () => {
  it.each([
    ['4 jours à Paris en couple', 4],
    ['Quatre jours à Paris', 4],
    ['1 jour à Rome', 1],
    ['10j en Andalousie', 10],
    ['Une semaine au Japon en couple', 7],
    ['2 semaines en Italie', 14],
    ['trois semaines en Italie', 21],
    ['Week-end à Lisbonne', 2],
    ['un long weekend à Rome', 3],
    ['5 nuits à Marrakech', 6],
    ['Quinze jours au Mexique', 15],
  ])('lit « %s » comme %i jours', (text, days) => {
    expect(durationFromDescription(text)).toBe(days)
  })

  it.each([
    ['Paris en couple, musées et bonnes tables'],
    ['4 jours à Paris puis 3 jours à Lyon'],
    ['Deux mois en Amérique du Sud'],
    ['6 semaines en Asie'],
    ['Voyage pour 2 adultes'],
  ])('ne devine rien pour « %s »', (text) => {
    expect(durationFromDescription(text)).toBeNull()
  })

  it('accepte deux mentions qui donnent la même durée', () => {
    expect(durationFromDescription('Une semaine au Japon, soit 7 jours')).toBe(
      7,
    )
  })
})
