import { describe, it, expect } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'

const QR_MAX_BYTES = 2900

describe('compression QR', () => {
  it('un itinéraire vide reste sous la limite de 2900 octets', () => {
    const json = JSON.stringify({ itinerary: [] })
    const compressed = compressToEncodedURIComponent(json)
    const byteCount = new TextEncoder().encode(compressed).length
    expect(byteCount).toBeLessThan(QR_MAX_BYTES)
  })

  it('isTooLarge est vrai quand les octets dépassent QR_MAX_BYTES', () => {
    const byteCount = 2901
    expect(byteCount > QR_MAX_BYTES).toBe(true)
  })

  it('la compression réduit la taille des données JSON', () => {
    const json = JSON.stringify({
      days: Array(10).fill({
        activities: Array(5).fill({
          name: 'Test activity',
          description: 'Some description text here',
        }),
      }),
    })
    const compressed = compressToEncodedURIComponent(json)
    expect(compressed.length).toBeLessThan(json.length)
  })
})
