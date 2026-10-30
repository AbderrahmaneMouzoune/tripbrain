'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import {
  ReceiveFlow,
  type ReceiveStart,
} from '@/components/receive/receive-flow'
import { isNativeApp, onNativeEvent } from '@/lib/native-app'
import type { IncomingShare } from '@/lib/share'
import { onAppResume } from './app-resume'
import { NativeReminderSync } from './native-reminder-sync'
import { parseNativePath, readTripTarget, type TripTarget } from './native-path'

/** Au-delà de cette absence, on demande au service worker s'il a mieux. */
const UPDATE_CHECK_AFTER_MS = 30 * 60 * 1000

/**
 * Liens, rappels et retour au premier plan venus du natif.
 *
 * - Toucher un rappel ouvre `/?trip=…&day=…&open=…` : le bon voyage, la bonne
 *   journée et l'écran du rappel. À froid, ces paramètres arrivent dans l'URL
 *   d'ouverture ; app déjà lancée, un natif v2 envoie `app/navigate` au lieu
 *   de recharger la page.
 * - `app/navigate` vers un partage (`/s/<code>`, `?code=`) ouvre l'aperçu du
 *   partage, comme `IncomingShareGate` à l'ouverture ; vers `/`, referme les
 *   écrans ; vers une autre page du site, la charge.
 * - Au retour dans l'app après une longue absence, le service worker vérifie
 *   s'il existe une version plus récente (prise au prochain chargement).
 */
export function NativeNavigationHost() {
  const { storedTrips, activeTripId, tripRevision, switchTrip } = useTrip()
  const { tab, setTab, selectDay, push, closeAll } = useAppNav()
  const [incoming, setIncoming] = useState<IncomingShare | null>(null)

  // Les gestionnaires d'événements lisent toujours l'état à jour.
  const latest = useRef({ storedTrips, activeTripId, tab })
  useEffect(() => {
    latest.current = { storedTrips, activeTripId, tab }
  })

  const pendingRef = useRef<TripTarget | null>(null)
  const [pendingTick, setPendingTick] = useState(0)

  /** Bascule sur le voyage demandé ; journée et écran suivent (effet plus bas). */
  const openTarget = useCallback(
    (target: TripTarget) => {
      const trip = latest.current.storedTrips.find(
        (item) => item.id === target.tripId,
      )
      // Voyage supprimé depuis la programmation du rappel : rien à ouvrir.
      if (!trip) return
      pendingRef.current = target
      if (latest.current.activeTripId !== trip.id) switchTrip(trip.id)
      setPendingTick((tick) => tick + 1)
    },
    [switchTrip],
  )

  // Une fois le voyage actif, on se place sur la journée et on ouvre l'écran.
  // Après une image : la page se place d'abord d'elle-même sur la journée du
  // jour à chaque voyage ouvert (effet parent, qui passe après celui-ci).
  useEffect(() => {
    const target = pendingRef.current
    if (!target || activeTripId !== target.tripId) return
    pendingRef.current = null
    requestAnimationFrame(() => {
      const trip = latest.current.storedTrips.find(
        (item) => item.id === target.tripId,
      )
      const day =
        target.dayIndex !== null ? trip?.itinerary[target.dayIndex] : undefined
      closeAll()
      if (!day || target.dayIndex === null) return
      const dayIndex = target.dayIndex
      if (target.open === 'morning' && latest.current.tab !== 'today') {
        setTab('today')
      }
      selectDay(dayIndex)
      if (target.open === 'transport-eve' && day.transport) {
        push({ kind: 'transport', dayIndex })
      } else if (target.open === 'check-in' && day.accommodation) {
        push({ kind: 'accommodation', dayIndex })
      }
    })
  }, [
    pendingTick,
    activeTripId,
    tripRevision,
    closeAll,
    push,
    selectDay,
    setTab,
  ])

  // À froid : l'URL d'ouverture désigne peut-être un voyage (rappel touché).
  // Elle est nettoyée aussitôt, pour qu'un rechargement ne la rejoue pas. Les
  // partages (`?code=`, `?import=`) restent à `IncomingShareGate`.
  useEffect(() => {
    const target = readTripTarget(new URLSearchParams(window.location.search))
    if (!target) return
    window.history.replaceState(window.history.state, '', '/')
    openTarget(target)
  }, [openTarget])

  // App déjà lancée : chemin envoyé par le natif (rappel, lien universel).
  useEffect(() => {
    return onNativeEvent('app/navigate', (payload) => {
      const path = (payload as { path?: unknown } | null)?.path
      if (typeof path !== 'string') return
      const intent = parseNativePath(path, window.location.origin)
      if (!intent) return
      switch (intent.kind) {
        case 'trip':
          openTarget(intent.target)
          return
        case 'share':
          closeAll()
          setIncoming(intent.share)
          return
        case 'home':
          closeAll()
          return
        case 'page':
          window.location.assign(intent.href)
      }
    })
  }, [openTarget, closeAll])

  // Version plus récente de la webapp : vérifiée au retour après une longue
  // absence, sans recharger (elle servira au prochain lancement).
  useEffect(() => {
    if (!isNativeApp() || !('serviceWorker' in navigator)) return
    let lastCheck = Date.now()
    return onAppResume(() => {
      if (Date.now() - lastCheck < UPDATE_CHECK_AFTER_MS) return
      lastCheck = Date.now()
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => {})
    })
  }, [])

  return (
    <>
      <NativeReminderSync />
      {incoming && (
        <IncomingShareOverlay
          incoming={incoming}
          onExit={() => setIncoming(null)}
          onSaved={() => {
            setIncoming(null)
            push({ kind: 'trip-ready' })
          }}
        />
      )}
    </>
  )
}

/** Aperçu d'un partage ouvert par le natif : le même que `IncomingShareGate`. */
function IncomingShareOverlay({
  incoming,
  onExit,
  onSaved,
}: {
  incoming: IncomingShare
  onExit: () => void
  onSaved: () => void
}) {
  const start = useMemo<ReceiveStart>(
    () => ({
      incoming,
      via: incoming.origin === 'generator' ? 'generator' : 'link',
    }),
    [incoming],
  )

  // La page dessous ne défile pas pendant l'aperçu.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        incoming.origin === 'generator'
          ? 'Récupérer votre itinéraire'
          : 'Importer un partage'
      }
      className="bg-background animate-screen fixed inset-0 z-50 overflow-y-auto overscroll-contain"
    >
      <ReceiveFlow
        // Un nouveau partage repart de zéro.
        key={JSON.stringify(incoming)}
        start={start}
        presentation="overlay"
        onExit={onExit}
        onSaved={onSaved}
      />
    </div>
  )
}
