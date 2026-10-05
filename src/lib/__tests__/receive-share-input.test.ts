import {
  describeShareError,
  digitsOnly,
  extractShareCode,
  groupCodeDigits,
  isTripBrainHost,
  parseShareInput,
} from '@/components/receive/share-input'
import {
  shareAnalyticsSource,
  resolveIncomingShare,
} from '@/components/receive/received-trip'
import { compressItinerary } from '@/lib/share'
import type { DayItinerary } from '@/lib/itinerary-data'

const day: DayItinerary = {
  id: 'd1',
  date: '2026-05-10',
  dayNumber: 1,
  city: 'Lisbonne',
  title: 'Arrivée',
  activities: [],
  coordinates: [38.72, -9.14],
}

describe('saisie d’un code', () => {
  it('ne garde que les chiffres', () => {
    expect(digitsOnly('4820-5137')).toBe('48205137')
  })

  it('affiche le code en deux groupes de quatre', () => {
    expect(groupCodeDigits('482')).toBe('482')
    expect(groupCodeDigits('4820')).toBe('4820')
    expect(groupCodeDigits('48205')).toBe('4820 5')
    expect(groupCodeDigits('482051379')).toBe('4820 5137')
  })
})

describe('extractShareCode', () => {
  it('reconnaît un code seul, avec ou sans séparateur', () => {
    expect(extractShareCode('48205137')).toBe('48205137')
    expect(extractShareCode(' 4820 5137 \n')).toBe('48205137')
    expect(extractShareCode('4820-5137')).toBe('48205137')
    expect(extractShareCode('4820.5137')).toBe('48205137')
  })

  it('refuse un nombre de la mauvaise longueur', () => {
    expect(extractShareCode('4820513')).toBeNull()
    expect(extractShareCode('482051370')).toBeNull()
    expect(extractShareCode('')).toBeNull()
  })

  it('refuse un code noyé dans du texte (téléphone, date…)', () => {
    expect(extractShareCode('Appelle-moi au 48205137')).toBeNull()
    expect(extractShareCode('K7QP-2M4X')).toBeNull()
  })
})

describe('isTripBrainHost', () => {
  it('accepte le site, ses sous-domaines et l’origine courante', () => {
    expect(isTripBrainHost('tripbrain.fr')).toBe(true)
    expect(isTripBrainHost('app.tripbrain.fr')).toBe(true)
    expect(isTripBrainHost('localhost:3000', 'localhost:3000')).toBe(true)
  })

  it('refuse les autres domaines, même ressemblants', () => {
    expect(isTripBrainHost('eviltripbrain.fr')).toBe(false)
    expect(isTripBrainHost('tripbrain.fr.example.com')).toBe(false)
  })
})

describe('parseShareInput', () => {
  it('lit un code seul', () => {
    expect(parseShareInput('4820 5137')).toEqual({ code: '48205137' })
  })

  it('lit un lien /s/<code>', () => {
    expect(parseShareInput('https://app.tripbrain.fr/s/48205137')).toEqual({
      code: '48205137',
    })
    expect(parseShareInput('https://app.tripbrain.fr/s/4820-5137/')).toEqual({
      code: '48205137',
    })
  })

  it('lit ?code=, ?import= et #import=&from=generator', () => {
    expect(parseShareInput('https://app.tripbrain.fr/?code=48205137')).toEqual({
      code: '48205137',
    })
    expect(parseShareInput('https://app.tripbrain.fr/?import=abc')).toEqual({
      payload: 'abc',
    })
    expect(
      parseShareInput('https://app.tripbrain.fr/#import=xyz&from=generator'),
    ).toEqual({ payload: 'xyz', origin: 'generator' })
  })

  it('trouve le lien au milieu d’un message, sans la ponctuation finale', () => {
    expect(
      parseShareInput(
        'Voici notre voyage : https://app.tripbrain.fr/s/48205137. À bientôt !',
      ),
    ).toEqual({ code: '48205137' })
  })

  it('accepte l’origine courante (préproduction, local)', () => {
    expect(
      parseShareInput('http://localhost:3000/?code=48205137', 'localhost:3000'),
    ).toEqual({ code: '48205137' })
  })

  it('ignore les liens étrangers et les textes sans partage', () => {
    expect(parseShareInput('https://example.com/?code=48205137')).toBeNull()
    expect(parseShareInput('https://app.tripbrain.fr/guide')).toBeNull()
    expect(parseShareInput('bonjour')).toBeNull()
    expect(parseShareInput('javascript:alert(1)')).toBeNull()
  })
})

describe('describeShareError', () => {
  it('reformule un code introuvable ou expiré', () => {
    const result = describeShareError(new Error('Code inconnu ou expiré.'))
    expect(result.kind).toBe('not_found')
    expect(result.message).toMatch(/valables une heure/)
  })

  it('reconnaît une erreur réseau', () => {
    expect(describeShareError(new TypeError('Failed to fetch')).kind).toBe(
      'network',
    )
  })

  it('garde le message du serveur pour les autres cas', () => {
    const result = describeShareError(
      new Error('Trop de tentatives. Réessayez dans un instant.'),
    )
    expect(result).toEqual({
      kind: 'other',
      message: 'Trop de tentatives. Réessayez dans un instant.',
    })
  })
})

describe('réception d’un partage', () => {
  it('distingue les sources de mesure', () => {
    expect(shareAnalyticsSource({ code: '1' }, 'typed-code')).toBe('prompt')
    expect(shareAnalyticsSource({ code: '1' }, 'scan')).toBe('code')
    expect(shareAnalyticsSource({ payload: 'x' }, 'link')).toBe('payload')
    expect(
      shareAnalyticsSource({ payload: 'x', origin: 'generator' }, 'link'),
    ).toBe('generator')
  })

  it('décode un payload sans aller-retour serveur', async () => {
    const payload = await compressItinerary([day])
    await expect(resolveIncomingShare({ payload })).resolves.toEqual([day])
  })

  it('refuse un partage vide', async () => {
    const payload = await compressItinerary([])
    await expect(resolveIncomingShare({ payload })).rejects.toThrow(
      /aucune journée/,
    )
  })
})
