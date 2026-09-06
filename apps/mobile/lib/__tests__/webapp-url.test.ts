import { describe, expect, it } from 'vitest'
import { devWebappUrl } from '../webapp-url'

describe('devWebappUrl', () => {
  it('remplace localhost par la machine qui sert le bundle', () => {
    expect(devWebappUrl('http://localhost:3000', '192.168.1.20:8081')).toBe(
      'http://192.168.1.20:3000/',
    )
    expect(devWebappUrl('http://127.0.0.1:3000', '192.168.1.20:8081')).toBe(
      'http://192.168.1.20:3000/',
    )
  })

  it('garde le port et le chemin de la webapp', () => {
    expect(
      devWebappUrl('http://localhost:3001/app', '10.0.0.5:8081/some/path'),
    ).toBe('http://10.0.0.5:3001/app')
  })

  it('ne touche pas à une adresse déjà joignable', () => {
    expect(devWebappUrl('https://app.tripbrain.fr', '192.168.1.20:8081')).toBe(
      'https://app.tripbrain.fr',
    )
    expect(devWebappUrl('http://192.168.1.30:3000', '192.168.1.20:8081')).toBe(
      'http://192.168.1.30:3000',
    )
  })

  it('laisse localhost quand Expo ne connaît pas de machine (build, simulateur)', () => {
    expect(devWebappUrl('http://localhost:3000', undefined)).toBe(
      'http://localhost:3000',
    )
    expect(devWebappUrl('http://localhost:3000', 'localhost:8081')).toBe(
      'http://localhost:3000',
    )
  })

  it('tolère une valeur invalide', () => {
    expect(devWebappUrl('pas une url', '192.168.1.20:8081')).toBe('pas une url')
  })
})
