'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { trackEvent } from '@/lib/analytics/client'
import { syncGroupTrip, type GroupSyncApi } from '@/lib/group-sync-engine'
import { cleanAuthor, fetchGroup, pushGroup } from '@/lib/group-sync'
import { readPreferences } from '@/lib/preferences'
import { compressItinerary, decompressItinerary } from '@/lib/share'
import { deepEqual, mergeThreeWay } from '@/lib/trip-merge'
import type { StoredTrip } from '@/lib/trips'

/** Intervalle de vérification tant que l'application est à l'écran. */
const POLL_INTERVAL_MS = 30_000
/** Délai entre une modification et son envoi : on regroupe les rafales. */
const PUSH_DELAY_MS = 1_500

const api: GroupSyncApi = {
  fetch: fetchGroup,
  push: pushGroup,
  compress: compressItinerary,
  decompress: decompressItinerary,
}

export interface GroupSyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  /** Dernière vérification réussie (ms), modifications reçues ou non. */
  checkedAt: number | null
  message?: string
}

/** Modifications reçues d'un autre voyageur, à signaler une fois. */
export interface RemoteChange {
  tripId: string
  author: string | null
  at: number
}

function isOffline(error: unknown): boolean {
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    error instanceof TypeError
  )
}

/**
 * Fait vivre la synchronisation des voyages de groupe : au chargement, au
 * retour au premier plan et du réseau, toutes les 30 secondes à l'écran, et
 * peu après chaque modification locale. Un seul tour à la fois ; une demande
 * pendant un tour en relance un autre juste après.
 */
export function useGroupSync({
  tripsRef,
  activeTripId,
  persistTrip,
}: {
  tripsRef: MutableRefObject<StoredTrip[]>
  activeTripId: string | null
  persistTrip: (trip: StoredTrip) => Promise<void>
}) {
  const [status, setStatus] = useState<GroupSyncStatus>({
    state: 'idle',
    checkedAt: null,
  })
  const [remoteChange, setRemoteChange] = useState<RemoteChange | null>(null)
  const runningRef = useRef(false)
  const pendingRef = useRef(false)
  const activeRef = useRef(activeTripId)
  activeRef.current = activeTripId

  const syncOne = useCallback(
    async (before: StoredTrip) => {
      const author = cleanAuthor(readPreferences().travelerName)
      const outcome = await syncGroupTrip(before, api, author)

      const latest = tripsRef.current.find((trip) => trip.id === before.id)
      if (!latest) return // supprimé pendant le tour
      if (outcome.kind === 'unchanged' && latest === before) return

      let next = outcome.trip
      if (latest !== before) {
        // Modifié ici pendant le tour : on rejoue ces retouches par-dessus.
        const merged = mergeThreeWay(
          { title: before.title, itinerary: before.itinerary },
          { title: latest.title, itinerary: latest.itinerary },
          { title: next.title, itinerary: next.itinerary },
        )
        next = {
          ...latest,
          ...merged.value,
          group: next.group ? { ...next.group, dirty: true } : undefined,
        }
        pendingRef.current = true
      }
      await persistTrip(next)

      if (outcome.kind === 'gone') {
        trackEvent('group_sync_failed', { reason: 'gone' })
      }
      // On ne prévient que si le programme a vraiment changé sous les yeux :
      // une version du serveur identique à la copie locale (ses propres
      // modifications qui reviennent, un simple changement de version)
      // n'est pas une nouvelle.
      const contentChanged = !deepEqual(
        { title: before.title, itinerary: before.itinerary },
        { title: outcome.trip.title, itinerary: outcome.trip.itinerary },
      )
      const received =
        contentChanged &&
        (outcome.kind === 'received' ||
          (outcome.kind === 'sent' && outcome.receivedFrom !== undefined))
      if (received) {
        setRemoteChange({
          tripId: before.id,
          author:
            outcome.kind === 'received'
              ? outcome.author
              : outcome.receivedFrom!,
          at: Date.now(),
        })
      }
    },
    [persistTrip, tripsRef],
  )

  const run = useCallback(async () => {
    if (runningRef.current) {
      pendingRef.current = true
      return
    }
    runningRef.current = true
    try {
      do {
        pendingRef.current = false
        // Le voyage consulté, et tout voyage qui attend d'envoyer quelque chose.
        const targets = tripsRef.current.filter(
          (trip) =>
            trip.group && (trip.id === activeRef.current || trip.group.dirty),
        )
        if (targets.length === 0) return
        setStatus((current) => ({ ...current, state: 'syncing' }))
        try {
          for (const trip of targets) await syncOne(trip)
          setStatus({ state: 'idle', checkedAt: Date.now() })
        } catch (error) {
          const offline = isOffline(error)
          if (!offline) {
            console.error('Synchronisation du groupe impossible', error)
            trackEvent('group_sync_failed', { reason: 'error' })
          }
          setStatus((current) => ({
            state: offline ? 'offline' : 'error',
            checkedAt: current.checkedAt,
            message:
              offline || !(error instanceof Error) ? undefined : error.message,
          }))
          return
        }
      } while (pendingRef.current)
    } finally {
      runningRef.current = false
    }
  }, [syncOne, tripsRef])

  // Envoi peu après une modification locale.
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSync = useCallback(
    (delay = PUSH_DELAY_MS) => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(() => void run(), delay)
    },
    [run],
  )

  const activeIsGroup = Boolean(
    tripsRef.current.find((trip) => trip.id === activeTripId)?.group,
  )

  useEffect(() => {
    if (!activeIsGroup) return
    void run()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    const onOnline = () => void run()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run()
    }, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [activeIsGroup, activeTripId, run])

  useEffect(
    () => () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
    },
    [],
  )

  return {
    groupSyncStatus: status,
    remoteChange,
    dismissRemoteChange: useCallback(() => setRemoteChange(null), []),
    requestGroupSync: requestSync,
  }
}
