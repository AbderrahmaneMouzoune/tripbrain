import {
  buildBriefPrompt,
  buildExpressPrompt,
  buildRefinePrompt,
  calendarLines,
  JSON_SHAPE,
} from '@/lib/generator/itinerary-prompt'
import type { GeneratedItinerary } from '@/lib/generator/itinerary-schema'
import {
  buildBriefRules,
  EMPTY_BRIEF,
  SAMPLE_BRIEF,
  type TripBrief,
} from '@/lib/generator/trip-brief'

describe('calendarLines', () => {
  it('donne le jour de la semaine de chaque journée', () => {
    expect(calendarLines('2027-04-12', 3)).toEqual([
      '- Jour 1 : lundi 12 avril 2027 (2027-04-12)',
      '- Jour 2 : mardi 13 avril 2027 (2027-04-13)',
      '- Jour 3 : mercredi 14 avril 2027 (2027-04-14)',
    ])
  })

  it('passe les fins de mois sans décalage', () => {
    expect(calendarLines('2027-02-27', 3)[2]).toBe(
      '- Jour 3 : lundi 1 mars 2027 (2027-03-01)',
    )
  })
})

describe('buildExpressPrompt', () => {
  const { system, user } = buildExpressPrompt(
    '  Une semaine au Japon en couple, fan de temples  ',
    '2027-04-12',
    7,
  )

  it('encadre la description du voyageur', () => {
    expect(user).toContain(
      '<voyage>\nUne semaine au Japon en couple, fan de temples\n</voyage>',
    )
    expect(system).not.toContain('fan de temples')
  })

  it('reprend la date, la durée imposée et le calendrier', () => {
    expect(user).toContain('Le voyage commence le 2027-04-12')
    expect(user).toContain(
      'Il dure exactement 7 jours et se termine le 2027-04-18',
    )
    expect(user).toContain('exactement 7 éléments')
    expect(user).toContain('en avril')
    expect(user).toContain('- Jour 1 : lundi 12 avril 2027 (2027-04-12)')
    expect(user).toContain('- Jour 7 : dimanche 18 avril 2027 (2027-04-18)')
    expect(user).not.toContain('Jour 8 :')
  })

  it('met le format JSON minifié dans le prompt système', () => {
    expect(system).toContain(JSON_SHAPE)
    expect(system).toContain('sans bloc de code')
    expect(system).not.toContain('```json')
    expect(user).not.toContain(JSON_SHAPE)
  })

  it('garde un prompt système identique d’un voyage à l’autre', () => {
    expect(
      buildExpressPrompt('Un week-end à Rome', '2027-05-01', 2).system,
    ).toBe(system)
    expect(buildBriefPrompt(SAMPLE_BRIEF, '2027-04-12').system).toBe(system)
  })

  it('autorise un hébergement demandé par le voyageur', () => {
    expect(system).toContain('Seule exception : un hébergement qu’il demande')
  })

  it('n’impose pas de durée quand elle est inconnue', () => {
    const open = buildExpressPrompt('Un week-end à Rome', '2027-04-12').user
    expect(open).not.toContain('Il dure exactement')
    expect(open).toContain('arrête-toi à la durée qui convient')
    expect(open).toContain('- Jour 30 :')
  })

  it('accorde la durée au singulier', () => {
    expect(
      buildExpressPrompt('Une journée à Rome', '2027-04-12', 1).user,
    ).toContain('Il dure exactement 1 jour et se termine le 2027-04-12')
  })
})

describe('buildBriefPrompt', () => {
  it('traduit le questionnaire en sections et en règles', () => {
    const { user } = buildBriefPrompt(SAMPLE_BRIEF, '2027-04-12')
    expect(user).toContain('<voyage>\n## Le voyage')
    expect(user).toContain('Destination : Japon — Tokyo, Kyoto')
    expect(user).toContain('## Contraintes')
    expect(user).toContain('Alimentation : sans fruits de mer.')
    expect(user).toContain('3 à 5 activités par jour')
    expect(user).toContain('Il dure exactement 8 jours')
    // Règles déduites du brief : régime, transports, budget, réservations.
    expect(user).toContain('compatibles avec un régime sans fruits de mer')
    expect(user).toContain(
      'Construis l’itinéraire autour de ce qui est déjà réservé',
    )
  })

  it('omet les questions passées', () => {
    const { user } = buildBriefPrompt(
      { ...EMPTY_BRIEF, destination: 'Lisbonne', durationDays: 5 },
      '2027-04-12',
    )
    expect(user).not.toContain('## Rythme et budget')
    expect(user).not.toContain('## Envies')
    expect(user).toContain('3 à 6 activités par jour')
  })
})

describe('buildBriefRules', () => {
  it('laisse la marche possible quand les transports sont restreints', () => {
    const rules = buildBriefRules({ ...SAMPLE_BRIEF, transports: ['train'] })
    expect(rules.join('\n')).toContain(
      'uniquement avec le train : ne propose aucun trajet qui exige un autre moyen',
    )
    expect(rules.join('\n')).toContain(
      'La marche reste possible pour les courtes distances.',
    )
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
  const { system, user } = buildRefinePrompt(
    itinerary,
    ' Ajoute une nuit à Hakone et enlève Nara ',
    '2027-04-12',
  )

  it('transmet l’itinéraire actuel et la demande, encadrés', () => {
    expect(user).toContain(
      `<itineraire>${JSON.stringify(itinerary)}</itineraire>`,
    )
    expect(user).toContain(
      '<demande>Ajoute une nuit à Hakone et enlève Nara</demande>',
    )
  })

  it('garde le départ, le nombre de journées et le calendrier', () => {
    expect(user).toContain('Le voyage commence le 2027-04-12')
    expect(user).toContain('Garde 2 jours au total')
    expect(user).toContain('- Jour 2 : mardi 13 avril 2027 (2027-04-13)')
    expect(system).toContain('Recopie à l’identique')
    expect(system).not.toContain('```json')
  })
  it('sans demande d’origine, ne parle pas du voyageur', () => {
    expect(user).not.toContain('<voyage>')
  })

  it('renvoie le brief d’origine et ses contraintes', () => {
    const brief: TripBrief = {
      ...EMPTY_BRIEF,
      destination: 'Japon',
      diets: ['vegetarian'],
      mobility: ['wheelchair'],
      avoid: 'Les files d’attente',
    }
    const prompt = buildRefinePrompt(
      itinerary,
      'Plus de musées',
      '2027-04-12',
      {
        brief,
      },
    )
    expect(prompt.user.indexOf('<voyage>')).toBeLessThan(
      prompt.user.indexOf('<itineraire>'),
    )
    expect(prompt.user).toContain('À éviter : Les files d’attente')
    expect(prompt.user).toContain('Contraintes toujours valables')
    expect(prompt.user).toContain('végétarien')
    expect(prompt.system).toContain('doit encore la respecter')
  })

  it('renvoie la phrase d’une demande express', () => {
    const prompt = buildRefinePrompt(
      itinerary,
      'Plus de musées',
      '2027-04-12',
      {
        description: '5 jours au Japon, sans gluten',
      },
    )
    expect(prompt.user).toContain(
      '<voyage>\n5 jours au Japon, sans gluten\n</voyage>',
    )
  })
})
