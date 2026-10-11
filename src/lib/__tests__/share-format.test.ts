import {
  SHARE_CODE_TTL_MS,
  fitsInlineQr,
  formatCountdown,
  resolveShareExpiry,
  sharePrivacyNote,
  spellShareCode,
  toFrenchShareError,
} from '@/components/share/share-format'
import { SHARE_INLINE_LIMIT } from '@/lib/share'

describe('resolveShareExpiry', () => {
  it('reprend l’échéance annoncée par le serveur', () => {
    const expiresAt = new Date('2026-10-04T12:30:00Z')
    expect(resolveShareExpiry({ code: '12345678', expiresAt }, 0)).toBe(
      expiresAt,
    )
  })

  it('compte une heure depuis la création à défaut', () => {
    const createdAt = Date.UTC(2026, 9, 4, 12, 0)
    expect(
      resolveShareExpiry({ code: '12345678', expiresAt: null }, createdAt),
    ).toEqual(new Date(createdAt + SHARE_CODE_TTL_MS))
    expect(SHARE_CODE_TTL_MS).toBe(3_600_000)
  })

  it('ignore une date invalide', () => {
    const createdAt = 1_000
    expect(
      resolveShareExpiry(
        { code: '12345678', expiresAt: new Date('pas une date') },
        createdAt,
      ).getTime(),
    ).toBe(createdAt + SHARE_CODE_TTL_MS)
  })
})

describe('formatCountdown', () => {
  const now = Date.UTC(2026, 9, 4, 12, 0)
  const inMs = (ms: number) => new Date(now + ms)

  it('affiche les minutes restantes, arrondies vers le haut', () => {
    expect(formatCountdown(inMs(59 * 60_000), now)).toBe('59 min')
    expect(formatCountdown(inMs(58 * 60_000 + 1), now)).toBe('59 min')
  })

  it('passe aux heures au-delà de 60 minutes', () => {
    expect(formatCountdown(inMs(60 * 60_000), now)).toBe('1 h')
    expect(formatCountdown(inMs(65 * 60_000), now)).toBe('1 h 05')
  })

  it('prévient dans la dernière minute, puis renvoie null', () => {
    expect(formatCountdown(inMs(30_000), now)).toBe('moins d’une minute')
    expect(formatCountdown(inMs(0), now)).toBeNull()
    expect(formatCountdown(inMs(-5_000), now)).toBeNull()
  })
})

describe('fitsInlineQr', () => {
  it('suit la limite du QR code autonome', () => {
    expect(fitsInlineQr('a'.repeat(SHARE_INLINE_LIMIT))).toBe(true)
    expect(fitsInlineQr('a'.repeat(SHARE_INLINE_LIMIT + 1))).toBe(false)
  })
})

describe('sharePrivacyNote', () => {
  it('dit qu’un petit voyage n’est déposé nulle part', () => {
    expect(sharePrivacyNote(true)).toMatch(/rien n’est déposé sur un serveur/)
    expect(sharePrivacyNote(true)).toMatch(/une heure/)
  })

  it('annonce l’effacement au bout d’une heure sinon', () => {
    expect(sharePrivacyNote(false)).toMatch(/effacées au bout d’une heure/)
  })
})

describe('spellShareCode / toFrenchShareError', () => {
  it('épelle le code chiffre par chiffre', () => {
    expect(spellShareCode('48205137')).toBe('4 8 2 0 5 1 3 7')
  })

  it('traduit les erreurs réseau et garde les messages du serveur', () => {
    expect(toFrenchShareError(new TypeError('Failed to fetch'), 'share')).toBe(
      'Erreur réseau : vérifiez votre connexion internet et réessayez.',
    )
    expect(
      toFrenchShareError(
        new Error('Le partage n’est pas configuré sur ce serveur.'),
        'share',
      ),
    ).toBe('Le partage n’est pas configuré sur ce serveur.')
    expect(toFrenchShareError('?', 'compress')).toBe(
      'Erreur inconnue lors de la compression.',
    )
  })
})
