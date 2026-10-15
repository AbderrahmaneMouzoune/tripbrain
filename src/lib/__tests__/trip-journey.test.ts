import { describe, expect, it } from 'vitest'
import { EMPTY_BRIEF, type TripBrief } from '@/lib/generator/trip-brief'
import {
  answerLabel,
  applyExpress,
  chapterQuestions,
  dateShortcuts,
  isAnswered,
  missingRequired,
  packsFor,
  parseExpress,
  precisionOf,
  questionById,
  setSingle,
  togglePack,
  tripTotalFor,
  visibleQuestions,
  type JourneyAnswers,
} from '@/lib/generator/trip-journey'

const answers = (
  brief: Partial<TripBrief> = {},
  startDate = '2027-04-12',
): JourneyAnswers => ({
  brief: { ...EMPTY_BRIEF, ...brief },
  startDate,
})

describe('parcours du générateur', () => {
  it('ne réclame que la destination et la date', () => {
    expect(missingRequired(answers({}, '')).map((q) => q.id)).toEqual([
      'destination',
      'when',
    ])
    expect(missingRequired(answers({ destination: 'Lisbonne' }))).toEqual([])
  })

  it('montre la composition seulement pour un groupe à plusieurs', () => {
    const ids = (brief: Partial<TripBrief>) =>
      chapterQuestions(answers(brief), 'people').map((q) => q.id)
    expect(ids({ group: 'couple' })).not.toContain('party')
    expect(ids({ group: 'family' })).toContain('party')
  })

  it('compte la composition comme répondue dès que le groupe est choisi', () => {
    const party = questionById('party')
    expect(isAnswered(party, answers({ group: '' }))).toBe(false)
    expect(
      isAnswered(party, answers(setSingle(EMPTY_BRIEF, 'group', 'family'))),
    ).toBe(true)
  })

  it('retire les dépenses plaisir quand le budget est sans compter', () => {
    const brief = setSingle(
      { ...EMPTY_BRIEF, splurges: ['food'] },
      'budget',
      'premium',
    )
    expect(brief.splurges).toEqual([])
    expect(visibleQuestions(answers(brief)).map((q) => q.id)).not.toContain(
      'splurges',
    )
  })

  it('stocke la marche comme une liste d’un élément', () => {
    const brief = setSingle(EMPTY_BRIEF, 'mobility', 'great')
    expect(brief.mobility).toEqual(['great'])
    expect(setSingle(brief, 'mobility', '').mobility).toEqual([])
  })

  it('fait monter la précision de 30 à 100', () => {
    expect(precisionOf(answers({ destination: 'Rome' })).value).toBe(30)
    const half = precisionOf(
      answers({
        destination: 'Rome',
        origin: 'Paris',
        shape: 'base',
        pace: 'slow',
      }),
    )
    expect(half.value).toBeGreaterThan(30)
    expect(half.answered).toBe(3)
  })

  it('résume les réponses pour le billet', () => {
    const when = questionById('when')
    expect(answerLabel(when, answers({ durationDays: 5 }))).toBe(
      '12 avril · 5 jours',
    )
    expect(
      answerLabel(questionById('budget'), answers({ budget: 'comfort' })),
    ).toBe('Confort')
  })

  it('coche puis décoche un pack en un geste', () => {
    const pack = packsFor(questionById('transports'), answers()).find(
      (p) => p.label === 'En ville',
    )!
    const on = togglePack(['train'], pack)
    expect(on).toEqual(['train', 'walk', 'publicTransport', 'taxi'])
    expect(togglePack(on, pack)).toEqual(['train'])
  })

  it('met en avant les packs adaptés à la situation', () => {
    const packs = packsFor(questionById('interests'), answers({ children: 2 }))
    expect(packs[0].label).toBe('Avec les enfants')
    expect(packs[0].recommended).toBe(true)
  })

  it('estime le budget de tout le séjour', () => {
    expect(
      tripTotalFor(answers({ adults: 2, durationDays: 5 }).brief, 'moderate'),
    ).toBe('≈ 800 €')
    expect(
      tripTotalFor(answers({ adults: 2, durationDays: 5 }).brief, 'premium'),
    ).toBe('+ de 3 000 €')
  })

  it('lit une phrase libre', () => {
    const { detected, brief } = parseExpress(
      '10 jours au Portugal en famille, tranquille, petit budget, on aime la plage',
    )
    expect(brief).toMatchObject({
      durationDays: 10,
      destination: 'Portugal',
      group: 'family',
      pace: 'slow',
      budget: 'backpacker',
      interests: ['beach'],
    })
    expect(detected.map((item) => item.kind)).toContain('Destination')
  })

  it('garde la phrase dans le brief, sans dépasser la limite', () => {
    const brief = applyExpress(EMPTY_BRIEF, 'Une semaine en couple à Rome')
    expect(brief.group).toBe('couple')
    expect(brief.adults).toBe(2)
    expect(brief.extra).toBe('En une phrase : Une semaine en couple à Rome')
    expect(
      applyExpress(EMPTY_BRIEF, 'x'.repeat(400)).extra.length,
    ).toBeLessThanOrEqual(300)
  })

  it('propose des dates à venir', () => {
    const shortcuts = dateShortcuts(new Date(2026, 9, 15))
    expect(shortcuts.map((s) => s.date)).toEqual([
      '2026-10-17',
      '2026-11-15',
      '2027-07-05',
    ])
  })
})
