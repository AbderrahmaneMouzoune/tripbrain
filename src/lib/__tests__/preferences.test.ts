import { DEFAULT_PREFERENCES, parsePreferences } from '@/lib/preferences'

describe('parsePreferences', () => {
  it('retombe sur les valeurs par défaut sans donnée ou avec du JSON cassé', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences('{oups')).toEqual(DEFAULT_PREFERENCES)
  })

  it('garde les champs valides et ignore les autres', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        notifyMorning: false,
        wifiOnly: 'oui',
        tipsSeen: ['long-press', 42],
        inconnu: true,
      }),
    )
    expect(parsed.notifyMorning).toBe(false)
    expect(parsed.wifiOnly).toBe(DEFAULT_PREFERENCES.wifiOnly)
    expect(parsed.tipsSeen).toEqual([])
    expect(parsed).not.toHaveProperty('inconnu')
  })
})
