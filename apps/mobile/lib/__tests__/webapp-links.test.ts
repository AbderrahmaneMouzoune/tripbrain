import { describe, expect, it } from 'vitest'
import { isWebappRequest, resolveWebappUrl } from '../webapp-links'

const PROD = 'https://app.tripbrain.fr'
const DEV = 'http://192.168.1.20:3000'

describe('resolveWebappUrl', () => {
  it('garde un lien de partage universel tel quel en production', () => {
    expect(resolveWebappUrl(`${PROD}/s/48205137`, PROD)).toBe(
      `${PROD}/s/48205137`,
    )
  })

  it('rejoue un lien de production sur la webapp configurée', () => {
    expect(resolveWebappUrl(`${PROD}/s/48205137`, DEV)).toBe(
      `${DEV}/s/48205137`,
    )
  })

  it('conserve la requête et le fragment', () => {
    expect(resolveWebappUrl(`${PROD}/?code=48205137#x`, PROD)).toBe(
      `${PROD}/?code=48205137#x`,
    )
  })

  it('traduit le schéma maison, avec ou sans barre oblique', () => {
    expect(resolveWebappUrl('tripbrain://s/48205137', PROD)).toBe(
      `${PROD}/s/48205137`,
    )
    expect(resolveWebappUrl('tripbrain:///?code=48205137', PROD)).toBe(
      `${PROD}/?code=48205137`,
    )
    expect(resolveWebappUrl('tripbrain://?code=48205137', PROD)).toBe(
      `${PROD}/?code=48205137`,
    )
  })

  it('ouvre la racine pour un schéma nu', () => {
    expect(resolveWebappUrl('tripbrain://', PROD)).toBe(`${PROD}/`)
  })

  it('ignore les URL internes du dev client Expo', () => {
    expect(
      resolveWebappUrl('tripbrain://expo-development-client/?url=x', PROD),
    ).toBeNull()
    expect(resolveWebappUrl('exp://192.168.1.20:8081', PROD)).toBeNull()
  })

  it('refuse un autre domaine, même en https', () => {
    expect(resolveWebappUrl('https://example.com/s/48205137', PROD)).toBeNull()
  })

  it('accepte le domaine de la webapp configurée', () => {
    expect(resolveWebappUrl(`${DEV}/guide`, DEV)).toBe(`${DEV}/guide`)
  })

  it('tolère une entrée vide ou invalide', () => {
    expect(resolveWebappUrl(null, PROD)).toBeNull()
    expect(resolveWebappUrl('', PROD)).toBeNull()
    expect(resolveWebappUrl('pas une url', PROD)).toBeNull()
  })
})

describe('isWebappRequest', () => {
  it('laisse la webapp naviguer chez elle', () => {
    expect(isWebappRequest(`${PROD}/mentions-legales`, PROD)).toBe(true)
    expect(isWebappRequest('about:blank', PROD)).toBe(true)
    expect(isWebappRequest('blob:https://app.tripbrain.fr/abc', PROD)).toBe(
      true,
    )
  })

  it('envoie le reste vers le système', () => {
    expect(
      isWebappRequest('https://www.google.com/maps/search/?api=1', PROD),
    ).toBe(false)
    expect(isWebappRequest('mailto:contact@tripbrain.fr', PROD)).toBe(false)
    expect(isWebappRequest('https://tripbrain.fr', PROD)).toBe(false)
  })
})
