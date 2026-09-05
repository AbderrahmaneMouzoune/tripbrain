import { createRateLimiter, getClientKey } from '@/lib/rate-limit'

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('laisse passer les requêtes jusqu’à la limite', () => {
    const check = createRateLimiter({ limit: 3, windowMs: 60_000 })

    expect(check('ip').allowed).toBe(true)
    expect(check('ip').allowed).toBe(true)
    expect(check('ip').allowed).toBe(true)
  })

  it('refuse la requête qui dépasse la limite', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 })
    check('ip')
    check('ip')

    expect(check('ip').allowed).toBe(false)
  })

  it('indique le délai d’attente en secondes', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 })
    check('ip')

    vi.advanceTimersByTime(20_000)
    expect(check('ip').retryAfter).toBe(40)
  })

  it('rouvre la fenêtre une fois celle-ci écoulée', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 })
    check('ip')
    expect(check('ip').allowed).toBe(false)

    vi.advanceTimersByTime(60_001)
    expect(check('ip').allowed).toBe(true)
  })

  it('compte chaque appelant séparément', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 })
    check('ip-a')

    expect(check('ip-b').allowed).toBe(true)
    expect(check('ip-a').allowed).toBe(false)
  })

  it('ne retourne aucun délai quand la requête passe', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 })
    expect(check('ip').retryAfter).toBe(0)
  })
})

describe('getClientKey', () => {
  function request(headers: Record<string, string>): Request {
    return new Request('https://tripbrain.app/api/share', { headers })
  }

  it('retient la première adresse de x-forwarded-for', () => {
    const key = getClientKey(
      request({ 'x-forwarded-for': '203.0.113.4, 70.41.3.18' }),
    )
    expect(key).toBe('203.0.113.4')
  })

  it('retombe sur x-real-ip en l’absence de x-forwarded-for', () => {
    expect(getClientKey(request({ 'x-real-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    )
  })

  it('regroupe les appelants non identifiés sous une même clé', () => {
    expect(getClientKey(request({}))).toBe('unknown')
  })
})
