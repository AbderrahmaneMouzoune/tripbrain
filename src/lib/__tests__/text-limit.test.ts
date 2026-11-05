import { cleanAuthor, MAX_AUTHOR_LENGTH } from '@/lib/group-sync'
import { parseGroupWrite } from '@/lib/group-request'
import { truncateText, wellFormedText } from '@/lib/text-limit'

const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

describe('truncateText', () => {
  it('garde un texte sous la borne tel quel', () => {
    expect(truncateText('Porto 🍷', 40)).toBe('Porto 🍷')
  })

  it('retire en entier un emoji à cheval sur la borne', () => {
    expect(truncateText(`${'a'.repeat(119)}😀`, 120)).toBe('a'.repeat(119))
    expect(truncateText(`${'a'.repeat(118)}😀`, 120)).toBe(
      `${'a'.repeat(118)}😀`,
    )
  })

  it('reste sous la borne en unités UTF-16, comme maxLength', () => {
    for (let max = 0; max < 12; max++) {
      const cut = truncateText('🇯🇵🍣a🏯b👍🏽', max)
      expect(cut.length).toBeLessThanOrEqual(max)
      expect(cut).not.toMatch(LONE_SURROGATE)
    }
  })

  it('remplace par U+FFFD une moitié de paire déjà isolée', () => {
    expect(wellFormedText('a\ud83db')).toBe('a\uFFFDb')
    expect(wellFormedText('\udc00a')).toBe('\uFFFDa')
    expect(wellFormedText('😀')).toBe('😀')
    expect(truncateText('Porto \ud83d', 120)).toBe('Porto \uFFFD')
    expect(encodeURIComponent(truncateText('\ud83d'.repeat(5), 3))).toBe(
      '%EF%BF%BD'.repeat(3),
    )
  })
})

describe('prénoms et titres des voyages de groupe', () => {
  it('ne coupent jamais un emoji en deux', () => {
    expect(cleanAuthor(`${'b'.repeat(MAX_AUTHOR_LENGTH - 1)}😀`)).toBe(
      'b'.repeat(MAX_AUTHOR_LENGTH - 1),
    )
    const write = parseGroupWrite({
      data: 'x',
      title: `${'t'.repeat(119)}🗾`,
      author: 'Rui',
    })
    expect(write.ok && write.data.title).toBe('t'.repeat(119))
  })
})
