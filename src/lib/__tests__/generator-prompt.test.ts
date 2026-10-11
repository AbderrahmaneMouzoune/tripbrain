import {
  buildBriefPrompt,
  buildExpressPrompt,
  buildRefinePrompt,
  JSON_SHAPE,
} from '@/lib/generator/itinerary-prompt'
import type { GeneratedItinerary } from '@/lib/generator/itinerary-schema'
import { EMPTY_BRIEF, SAMPLE_BRIEF } from '@/lib/generator/trip-brief'

describe('buildExpressPrompt', () => {
  const prompt = buildExpressPrompt(
    '  Une semaine au Japon en couple, fan de temples  ',
    '2027-04-12',
    7,
  )

  it('reprend la description, la date et la durée imposées', () => {
    expect(prompt).toContain('Une semaine au Japon en couple, fan de temples')
    expect(prompt).toContain('Le voyage commence le 2027-04-12')
    expect(prompt).toContain(
      'Il dure exactement 7 jours et se termine le 2027-04-18',
    )
    expect(prompt).toContain('exactement 7 éléments')
    expect(prompt).toContain('en avril')
  })

  it('demande le JSON minifié nu, sans bloc de code à copier', () => {
    expect(prompt).toContain(JSON_SHAPE)
    expect(prompt).toContain('sans bloc de code')
    expect(prompt).not.toContain('```json')
  })

  it('n’impose pas de durée quand elle est inconnue', () => {
    expect(
      buildExpressPrompt('Un week-end à Rome', '2027-04-12'),
    ).not.toContain('Il dure exactement')
  })

  it('accorde la durée au singulier', () => {
    expect(buildExpressPrompt('Une journée à Rome', '2027-04-12', 1)).toContain(
      'Il dure exactement 1 jour et se termine le 2027-04-12',
    )
  })
})

describe('buildBriefPrompt', () => {
  it('traduit le questionnaire en sections et en règles', () => {
    const prompt = buildBriefPrompt(SAMPLE_BRIEF, '2027-04-12')
    expect(prompt).toContain('## Le voyage')
    expect(prompt).toContain('Destination : Japon — Tokyo, Kyoto')
    expect(prompt).toContain('## Contraintes')
    expect(prompt).toContain('Alimentation : sans fruits de mer.')
    expect(prompt).toContain('3 à 5 activités par jour')
    expect(prompt).toContain('Il dure exactement 8 jours')
    // Règles déduites du brief : régime, transports, budget, réservations.
    expect(prompt).toContain('compatibles avec un régime sans fruits de mer')
    expect(prompt).toContain(
      'Construis l’itinéraire autour de ce qui est déjà réservé',
    )
  })

  it('omet les questions passées', () => {
    const prompt = buildBriefPrompt(
      { ...EMPTY_BRIEF, destination: 'Lisbonne', durationDays: 5 },
      '2027-04-12',
    )
    expect(prompt).not.toContain('## Rythme et budget')
    expect(prompt).not.toContain('## Envies')
    expect(prompt).toContain('3 à 6 activités par jour')
  })
})

describe('buildRefinePrompt', () => {
  const itinerary: GeneratedItinerary = {
    tripTitle: 'Japon',
    summary: 'Résumé',
    days: [
      { date: '2027-04-12', city: 'Tokyo', title: 'Arrivée', activities: [] },
      { date: '2027-04-13', city: 'Nara', title: 'Cerfs', activities: [] },
    ],
  }
  const prompt = buildRefinePrompt(
    itinerary,
    ' Ajoute une nuit à Hakone et enlève Nara ',
    '2027-04-12',
  )

  it('transmet l’itinéraire actuel et la demande, encadrés', () => {
    expect(prompt).toContain(
      `<itineraire>${JSON.stringify(itinerary)}</itineraire>`,
    )
    expect(prompt).toContain(
      '<demande>Ajoute une nuit à Hakone et enlève Nara</demande>',
    )
  })

  it('garde le départ et le nombre de journées', () => {
    expect(prompt).toContain('Le voyage commence le 2027-04-12')
    expect(prompt).toContain('Garde 2 jours au total')
    expect(prompt).toContain('Recopie à l’identique')
    expect(prompt).not.toContain('```json')
  })
})
