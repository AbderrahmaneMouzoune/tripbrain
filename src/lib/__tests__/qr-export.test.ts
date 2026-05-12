import { compressToEncodedURIComponent } from 'lz-string'

const QR_MAX_BYTES = 2900

describe('compression QR', () => {
  it('un itinéraire vide reste sous la limite de 2900 octets', () => {
    const json = JSON.stringify({ itinerary: [] })
    const compressed = compressToEncodedURIComponent(json)
    const byteCount = new TextEncoder().encode(compressed).length
    expect(byteCount).toBeLessThan(QR_MAX_BYTES)
  })

  it('un payload volumineux dépasse la limite de 2900 octets et isTooLarge serait vrai', () => {
    // Génère un JSON suffisamment grand pour dépasser la limite
    const bigData = { days: Array(100).fill({ activities: Array(20).fill({ name: 'x'.repeat(50), description: 'y'.repeat(200) }) }) }
    const json = JSON.stringify(bigData)
    const compressed = compressToEncodedURIComponent(json)
    const byteCount = new TextEncoder().encode(compressed).length
    expect(byteCount).toBeGreaterThan(2900)
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
