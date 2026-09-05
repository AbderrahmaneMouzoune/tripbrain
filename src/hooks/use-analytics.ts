'use client'

import { useContext } from 'react'
import {
  AnalyticsContext,
  type AnalyticsContextValue,
} from '@/components/analytics/analytics-provider'

/**
 * Accès à la mesure d'audience depuis un composant.
 *
 * Hors fournisseur, `track` ne fait rien : un composant reste testable et
 * réutilisable sans avoir à simuler PostHog.
 */
export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext)
}
