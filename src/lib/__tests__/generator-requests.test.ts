import { addDays, todayIso } from '@/lib/generator/itinerary-quality'
import {
  expectedDays,
  firstIssueMessage,
  generateRequestSchema,
  refineRequestSchema,
} from '@/lib/generator/requests'
import { EMPTY_BRIEF, SAMPLE_BRIEF } from '@/lib/generator/trip-brief'

const future = addDays(todayIso(), 20)

describe('generateRequestSchema', () => {
  it('accepte une demande express', () => {
    const parsed = generateRequestSchema.safeParse({
      mode: 'express',
      description: '  5 jours à Lisbonne entre amis  ',
      startDate: future,
      durationDays: 5,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.mode === 'express') {
      expect(parsed.data.description).toBe('5 jours à Lisbonne entre amis')
      expect(expectedDays(parsed.data)).toBe(5)
    }
  })

  it('accepte un questionnaire complet', () => {
    const parsed = generateRequestSchema.safeParse({
      mode: 'brief',
      brief: SAMPLE_BRIEF,
      startDate: future,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(expectedDays(parsed.data)).toBe(8)
  })

  it('refuse un questionnaire sans destination', () => {
    expect(
      generateRequestSchema.safeParse({
        mode: 'brief',
        brief: EMPTY_BRIEF,
        startDate: future,
      }).success,
    ).toBe(false)
  })

  it('refuse une date passée, avec un message pour le voyageur', () => {
    const parsed = generateRequestSchema.safeParse({
      mode: 'express',
      description: '5 jours à Lisbonne entre amis',
      startDate: addDays(todayIso(), -3),
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(firstIssueMessage(parsed.error)).toBe(
        'La date de départ est déjà passée.',
      )
    }
  })

  it('tolère la veille, pour les fuseaux décalés', () => {
    expect(
      generateRequestSchema.safeParse({
        mode: 'express',
        description: '5 jours à Lisbonne entre amis',
        startDate: addDays(todayIso(), -1),
      }).success,
    ).toBe(true)
  })

  it.each([
    ['date impossible', { startDate: '2027-02-31' }],
    ['description trop courte', { description: 'Rome' }],
    ['description trop longue', { description: 'a'.repeat(301) }],
    ['durée nulle', { durationDays: 0 }],
    ['durée trop longue', { durationDays: 31 }],
    ['durée décimale', { durationDays: 2.5 }],
  ])('refuse : %s', (_, patch) => {
    expect(
      generateRequestSchema.safeParse({
        mode: 'express',
        description: '5 jours à Lisbonne entre amis',
        startDate: future,
        ...patch,
      }).success,
    ).toBe(false)
  })

  it('refuse un mode inconnu', () => {
    expect(
      generateRequestSchema.safeParse({ mode: 'chat', startDate: future })
        .success,
    ).toBe(false)
  })

  it('cache les messages techniques de Zod', () => {
    const parsed = generateRequestSchema.safeParse({ mode: 'express' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(firstIssueMessage(parsed.error)).toBe('Requête invalide.')
    }
  })
})

describe('refineRequestSchema', () => {
  const itinerary = {
    tripTitle: 'Japon',
    summary: 'Résumé',
    days: [{ date: future, city: 'Tokyo', title: 'Arrivée', activities: [] }],
  }

  it('accepte un itinéraire et une demande', () => {
    expect(
      refineRequestSchema.safeParse({
        itinerary,
        instruction: 'Ajoute une nuit à Hakone et enlève Nara',
        startDate: future,
      }).success,
    ).toBe(true)
  })

  it('refuse une demande vide ou un itinéraire sans journée', () => {
    expect(
      refineRequestSchema.safeParse({
        itinerary,
        instruction: '  ',
        startDate: future,
      }).success,
    ).toBe(false)
    expect(
      refineRequestSchema.safeParse({
        itinerary: { ...itinerary, days: [] },
        instruction: 'Plus de musées',
        startDate: future,
      }).success,
    ).toBe(false)
  })
})
