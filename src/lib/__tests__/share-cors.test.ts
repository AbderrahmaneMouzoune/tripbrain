import { afterEach, describe, expect, it } from 'vitest'
import {
  corsHeaders,
  isAllowedOrigin,
  preflightResponse,
} from '@/lib/share-cors'

const ORIGINAL = process.env.SHARE_ALLOWED_ORIGINS

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SHARE_ALLOWED_ORIGINS
  else process.env.SHARE_ALLOWED_ORIGINS = ORIGINAL
})

function preflight(origin?: string): Response {
  return preflightResponse(
    new Request('https://app.tripbrain.fr/api/share', {
      method: 'OPTIONS',
      headers: origin ? { origin } : {},
    }),
  )
}

describe('isAllowedOrigin', () => {
  it('accepte le site vitrine, avec ou sans www', () => {
    expect(isAllowedOrigin('https://tripbrain.fr')).toBe(true)
    expect(isAllowedOrigin('https://www.tripbrain.fr')).toBe(true)
  })

  it('refuse une origine inconnue, et l’absence d’origine', () => {
    expect(isAllowedOrigin('https://tripbrain.fr.attaquant.example')).toBe(
      false,
    )
    expect(isAllowedOrigin('http://tripbrain.fr')).toBe(false)
    expect(isAllowedOrigin(null)).toBe(false)
  })

  it('accepte les origines ajoutées par l’environnement', () => {
    process.env.SHARE_ALLOWED_ORIGINS =
      'https://tripbrain-landing.vercel.app, https://autre.example'
    expect(isAllowedOrigin('https://tripbrain-landing.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://autre.example')).toBe(true)
  })
})

describe('corsHeaders', () => {
  it('ouvre la réponse à une origine autorisée', () => {
    const headers = corsHeaders('https://tripbrain.fr')
    expect(headers['Access-Control-Allow-Origin']).toBe('https://tripbrain.fr')
    expect(headers['Access-Control-Allow-Methods']).toContain('POST')
    expect(headers.Vary).toBe('Origin')
  })

  it('n’ouvre rien pour une origine inconnue, mais reste variable', () => {
    const headers = corsHeaders('https://ailleurs.example')
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers.Vary).toBe('Origin')
  })
})

describe('preflightResponse', () => {
  it('répond 204 à une origine autorisée', () => {
    const response = preflight('https://tripbrain.fr')
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://tripbrain.fr',
    )
  })

  it('répond 403 à une origine inconnue', () => {
    expect(preflight('https://ailleurs.example').status).toBe(403)
    expect(preflight().status).toBe(403)
  })
})
