import { describe, expect, it } from 'vitest'
import { scanValueReloadsPage } from '@/components/receive/native-scan'

describe('scanValueReloadsPage', () => {
  const host = 'app.tripbrain.fr'

  it('never reloads with a v2 native', () => {
    expect(
      scanValueReloadsPage('https://app.tripbrain.fr/s/48205137', host, false),
    ).toBe(false)
  })

  it('reloads on app links and the custom scheme with a v1 native', () => {
    expect(
      scanValueReloadsPage('https://app.tripbrain.fr/s/48205137', host, true),
    ).toBe(true)
    expect(scanValueReloadsPage('tripbrain://s/48205137', host, true)).toBe(
      true,
    )
    expect(
      scanValueReloadsPage(
        'https://staging.tripbrain.fr/?code=48205137',
        'staging.tripbrain.fr',
        true,
      ),
    ).toBe(true)
  })

  it('does not reload on other hosts, codes or text', () => {
    expect(
      scanValueReloadsPage('https://tripbrain.fr/s/48205137', host, true),
    ).toBe(false)
    expect(scanValueReloadsPage('https://example.com', host, true)).toBe(false)
    expect(scanValueReloadsPage('48205137', host, true)).toBe(false)
    expect(
      scanValueReloadsPage('tripbrain://expo-development-client/x', host, true),
    ).toBe(false)
  })
})
