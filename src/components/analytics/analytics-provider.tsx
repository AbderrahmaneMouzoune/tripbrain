'use client'

/**
 * Branche la mesure d'audience sur l'application.
 *
 * Le fournisseur porte trois choses : l'initialisation du SDK, l'état du
 * consentement, et la bannière qui permet de le donner ou de le retirer. Les
 * composants n'appellent jamais PostHog directement, ils passent par
 * `useAnalytics().track`.
 */

import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyConsent,
  initAnalytics,
  isAnalyticsConfigured,
  trackEvent,
} from '@/lib/analytics/client'
import {
  readConsent,
  subscribeToConsent,
  writeConsent,
  type ConsentRecord,
  type ConsentStatus,
} from '@/lib/analytics/consent'
import type { AnalyticsEventName, TrackArgs } from '@/lib/analytics/events'
import { ConsentBanner } from '@/components/analytics/consent-banner'

/** D'où vient le choix : utile pour savoir si le réglage est trouvé. */
export type ConsentSurface = 'banner' | 'settings' | 'privacy_page'

export interface AnalyticsContextValue {
  /** `false` quand aucune clé n'est configurée : la mesure n'existe pas. */
  isConfigured: boolean
  consent: ConsentRecord | null
  decide: (status: ConsentStatus, surface?: ConsentSurface) => void
  /** Rouvre la bannière pour revenir sur un choix déjà fait. */
  openPreferences: () => void
  track: <N extends AnalyticsEventName>(name: N, ...args: TrackArgs<N>) => void
}

/**
 * Valeur par défaut sans effet : un composant utilisé hors du fournisseur
 * (un test, une page isolée) continue de fonctionner sans rien envoyer.
 */
export const AnalyticsContext = createContext<AnalyticsContextValue>({
  isConfigured: false,
  consent: null,
  decide: () => {},
  openPreferences: () => {},
  track: () => {},
})

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentRecord | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const configured = isAnalyticsConfigured()

  useEffect(() => {
    if (!configured) {
      setIsReady(true)
      return
    }

    // Le choix est lu côté client uniquement : le rendu serveur ne connaît pas
    // le stockage local, et afficher la bannière avant de savoir la ferait
    // clignoter à chaque visite.
    setConsent(readConsent())
    setIsReady(true)
    initAnalytics()

    // Point de passage unique des changements d'avis, y compris ceux de cet
    // onglet : `writeConsent` prévient tout le monde par le même canal.
    return subscribeToConsent((record) => {
      setConsent(record)
      if (record) applyConsent(record.status)
    })
  }, [configured])

  const decide = useCallback(
    (status: ConsentStatus, surface: ConsentSurface = 'banner') => {
      // Un choix conservé d'une visite précédente est déjà appliqué par
      // `initAnalytics` : seul un vrai changement passe par `applyConsent`,
      // qui remet l'identifiant à zéro. Le rejouer à chaque chargement
      // fabriquerait un nouveau visiteur à chaque ouverture.
      writeConsent(status)
      setPreferencesOpen(false)

      // Envoyé après l'acceptation seulement : un refus ne déclenche aucune
      // requête, c'est tout l'intérêt du refus.
      if (status === 'granted') {
        trackEvent('analytics_consent_updated', { status, surface })
      }
    },
    [],
  )

  const openPreferences = useCallback(() => setPreferencesOpen(true), [])

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      isConfigured: configured,
      consent,
      decide,
      openPreferences,
      track: trackEvent,
    }),
    [configured, consent, decide, openPreferences],
  )

  const showBanner = configured && isReady && (preferencesOpen || !consent)

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {showBanner && (
        <ConsentBanner
          currentStatus={consent?.status ?? null}
          onDecide={(status) =>
            decide(status, preferencesOpen ? 'settings' : 'banner')
          }
          onDismiss={
            preferencesOpen ? () => setPreferencesOpen(false) : undefined
          }
        />
      )}
    </AnalyticsContext.Provider>
  )
}
