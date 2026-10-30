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
import { isInsideNativeApp } from '@/lib/native-app'

/**
 * Fin de l'arrivée d'un premier voyage (écran « Voyage prêt » refermé) : dans
 * l'app native, la première demande de consentement attend ce moment.
 */
export const FIRST_TRIP_OPENED_EVENT = 'tb:first-trip-opened'

/** L'app native a déjà été lancée une fois sur cet appareil. */
const NATIVE_LAUNCHED_KEY = 'tripbrain-native-launched'

/**
 * Dans l'app native, la toute première demande n'arrive pas par-dessus le
 * premier écran : seulement une fois un voyage ouvert, ou au lancement
 * suivant. Rien n'est mesuré sans accord, le report ne change donc rien à la
 * mesure. Le navigateur garde la bannière immédiate.
 */
function shouldDeferFirstAsk(): boolean {
  // Décision prise une fois par chargement de page : le drapeau est écrit au
  // premier appel, un remontage (StrictMode en dev) doit retrouver la même
  // réponse au lieu de lire son propre drapeau.
  if (deferDecision !== null) return deferDecision
  deferDecision = computeDeferFirstAsk()
  return deferDecision
}

let deferDecision: boolean | null = null

function computeDeferFirstAsk(): boolean {
  if (!isInsideNativeApp()) return false
  try {
    if (localStorage.getItem(NATIVE_LAUNCHED_KEY)) return false
    localStorage.setItem(NATIVE_LAUNCHED_KEY, '1')
    return true
  } catch {
    // Stockage indisponible : on ne saurait jamais qu'un lancement a eu lieu.
    return false
  }
}

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
  const [deferred, setDeferred] = useState(false)
  const configured = isAnalyticsConfigured()

  useEffect(() => {
    if (!configured || readConsent() || !shouldDeferFirstAsk()) return
    setDeferred(true)
    const resume = () => {
      // Le voyage est ouvert : un remontage ultérieur ne reporte plus.
      deferDecision = false
      setDeferred(false)
    }
    window.addEventListener(FIRST_TRIP_OPENED_EVENT, resume)
    return () => window.removeEventListener(FIRST_TRIP_OPENED_EVENT, resume)
  }, [configured])

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
    // Sans accord déjà donné, cet appel ne fait rien : le SDK n'est pas chargé
    // et PostHog n'est pas contacté.
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

  const showBanner =
    configured && isReady && (preferencesOpen || (!consent && !deferred))

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
