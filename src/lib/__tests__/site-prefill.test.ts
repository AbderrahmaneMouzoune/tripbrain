import { SITE_PREFILL_KEY, toSitePrefill } from '@/lib/generator/site-prefill'
import { EMPTY_BRIEF, SAMPLE_BRIEF } from '@/lib/generator/trip-brief'
import { getGeneratorUrl } from '@/lib/site-links'

/** Décodage tel que le site le fait (`tripbrain-landing/src/lib/app-prefill.ts`). */
function decode(url: string): unknown {
  const fragment = new URL(url).hash.slice(1)
  const value = new URLSearchParams(fragment).get(SITE_PREFILL_KEY) ?? ''
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('site-prefill', () => {
  it('transmet une demande express, accents compris', () => {
    const url = getGeneratorUrl('generator_fallback', {
      mode: 'express',
      description: 'Une semaine à Séville en août, à deux — budget serré',
      startDate: '2027-08-02',
      durationDays: 7,
    })
    expect(url).toContain('utm_medium=generator_fallback#brouillon=')
    expect(decode(url)).toEqual({
      v: 1,
      mode: 'express',
      description: 'Une semaine à Séville en août, à deux — budget serré',
      startDate: '2027-08-02',
      durationDays: 7,
    })
  })

  it('ne garde du questionnaire que les réponses données', () => {
    const prefill = toSitePrefill({
      mode: 'brief',
      brief: { ...EMPTY_BRIEF, destination: 'Lisbonne', interests: ['food'] },
      startDate: '2027-05-10',
    })
    expect(prefill.brief).toEqual({
      destination: 'Lisbonne',
      interests: ['food'],
    })
  })

  it('transmet un questionnaire complet sans perte', () => {
    const url = getGeneratorUrl('generator_fallback', {
      mode: 'brief',
      brief: SAMPLE_BRIEF,
      startDate: '2027-05-10',
    })
    const decoded = decode(url) as { brief: object }
    expect({ ...EMPTY_BRIEF, ...decoded.brief }).toEqual(SAMPLE_BRIEF)
  })

  it('reste sans fragment quand il n’y a pas de demande', () => {
    expect(getGeneratorUrl('onboarding')).not.toContain('#')
  })
})
