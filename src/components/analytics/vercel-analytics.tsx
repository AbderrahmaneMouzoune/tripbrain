'use client'

/**
 * Vercel Analytics, soumis au même consentement que le reste.
 *
 * Le script n'est monté qu'après un accord explicite : avant, aucune requête
 * ne part vers Vercel non plus. Sans ce garde-fou, une seconde mesure
 * échapperait au choix exprimé dans la bannière.
 */

import { Analytics } from '@vercel/analytics/next'
import { useAnalytics } from '@/hooks/use-analytics'

export function ConsentedVercelAnalytics() {
  const { consent } = useAnalytics()

  if (consent?.status !== 'granted') return null

  return <Analytics />
}
