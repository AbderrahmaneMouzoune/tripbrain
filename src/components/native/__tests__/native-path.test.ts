import { parseNativePath, readTripTarget } from '../native-path'

const ORIGIN = 'https://app.tripbrain.fr'

describe('parseNativePath', () => {
  it('ouvre le voyage, la journée et l’écran d’un rappel', () => {
    expect(
      parseNativePath('/?trip=abc&day=2&open=transport-eve', ORIGIN),
    ).toEqual({
      kind: 'trip',
      target: { tripId: 'abc', dayIndex: 2, open: 'transport-eve' },
    })
  })

  it('tolère une journée ou un écran illisibles', () => {
    expect(
      readTripTarget(new URLSearchParams('trip=abc&day=x&open=zz')),
    ).toEqual({ tripId: 'abc', dayIndex: null, open: null })
  })

  it('reconnaît un partage, par code ou par lien court', () => {
    expect(parseNativePath('/?code=AB12CD', ORIGIN)).toEqual({
      kind: 'share',
      share: { code: 'AB12CD' },
    })
    expect(parseNativePath(`${ORIGIN}/s/AB12CD`, ORIGIN)).toEqual({
      kind: 'share',
      share: { code: 'AB12CD' },
    })
  })

  it('referme tout sur l’accueil, recharge les autres pages', () => {
    expect(parseNativePath('/', ORIGIN)).toEqual({ kind: 'home' })
    expect(parseNativePath('/guide', ORIGIN)).toEqual({
      kind: 'page',
      href: `${ORIGIN}/guide`,
    })
  })

  it('ignore les liens vers un autre site', () => {
    expect(parseNativePath('https://exemple.com/?trip=abc', ORIGIN)).toBeNull()
  })
})
