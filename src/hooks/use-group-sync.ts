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
import {
  GroupNotFoundError,
  checkGroupVersion,
  cleanAuthor,
  fetchGroup,
  groupVersionState,
  pushGroup,
  type GroupVersionState,
} from '@/lib/group-sync'
import { readPreferences } from '@/lib/preferences'
import { compressItinerary, decompressItinerary } from '@/lib/share'
import { deepEqual, mergeThreeWay } from '@/lib/trip-merge'
import type { DayItinerary } from '@/lib/itinerary-data'
import type { StoredTrip } from '@/lib/trips'

/** Vérification de version (légère) tant que l'application est à l'écran. */
const CHECK_INTERVAL_MS = 60_000

const api: GroupSyncApi = {
  fetch: fetchGroup,
  push: pushGroup,
  compress: compressItinerary,
  decompress: decompressItinerary,
}

/** Ce qu'a donné la dernière synchronisation demandée. */
export interface SyncResult {
  tripId: string
  /** Rien n'a bougé, ni ici ni chez les autres. */
  upToDate: boolean
  /** Des modifications des autres sont arrivées (et de qui, si connu). */
  received: boolean
  author: string | null
  /** Des modifications d'ici sont parties. */
  sent: boolean
  /** Valeurs modifiées des deux côtés, tranchées en faveur du groupe. */
  conflicts: number
  at: number
}

export interface GroupSyncStatus {
  /** Où en est le voyage consulté par rapport au groupe. */
  version: GroupVersionState
  /** Une synchronisation demandée est en cours. */
  syncing: boolean
  /** Dernière vérification de version réussie (ms). */
  checkedAt: number | null
  offline: boolean
  /** Échec de la dernière synchronisation demandée. */
  error: string | null
  lastResult: SyncResult | null
}

/**
 * Contenu d'un voyage remplacé par une version venue du groupe : avant et
 * après. Ce qui garde une copie du programme (le brouillon du mode édition)
 * s'en sert pour intégrer ces changements au lieu de les écraser.
 */
export interface RemoteApplied {
  tripId: string
  before: DayItinerary[]
  after: DayItinerary[]
  at: number
}

function isOffline(error: unknown): boolean {
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    error instanceof TypeError
  )
}

/**
 * Synchronisation des voyages de groupe, **à la demande**.
 *
 * Rien n'est envoyé ni reçu tout seul : le programme ne change jamais sous
 * les yeux, et une modification n'arrive chez les autres que quand on l'a
 * décidé. En arrière-plan, l'application se contente de comparer sa version
 * à celle du serveur (sans rien télécharger) pour dire « à jour » ou
 * « nouvelle version » ; `syncNow` fait l'échange quand on le demande.
 */
export function useGroupSync({
  tripsRef,
  trips,
  activeTripId,
  persistTrip,
}: {
  tripsRef: MutableRefObject<StoredTrip[]>
  /** La liste à l'état du rendu, pour recalculer l'état affiché. */
  trips: StoredTrip[]
  activeTripId: string | null
  persistTrip: (trip: StoredTrip) => Promise<void>
}) {
  /** Dernière version du serveur connue, par voyage. */
  const [remoteVersions, setRemoteVersions] = useState<Record<string, string>>(
    {},
  )
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [remoteApplied, setRemoteApplied] = useState<RemoteApplied | null>(null)
  const syncingRef = useRef(false)

  const activeTrip = trips.find((trip) => trip.id === activeTripId)
  const activeGroupId = activeTrip?.group?.id ?? null

  // ── Vérification légère ────────────────────────────────────────────────
  const check = useCallback(async () => {
    const trip = tripsRef.current.find((item) => item.id === activeTripId)
    if (!trip?.group || syncingRef.current) return
    try {
      const version = await checkGroupVersion(trip.group.id)
      setRemoteVersions((current) => ({ ...current, [trip.id]: version }))
      setCheckedAt(Date.now())
      setOffline(false)
    } catch (err) {
      if (err instanceof GroupNotFoundError) {
        // Le groupe a disparu du serveur : le voyage redevient un voyage
        // ordinaire, intact, sur ce téléphone.
        await persistTrip({ ...trip, group: undefined })
        trackEvent('group_sync_failed', { reason: 'gone' })
        return
      }
      setOffline(isOffline(err))
    }
  }, [activeTripId, persistTrip, tripsRef])

  useEffect(() => {
    if (!activeGroupId) return
    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onOnline = () => void check()
    const onOffline = () => setOffline(true)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void check()
    }, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [activeGroupId, check])

  // ── Synchronisation demandée ───────────────────────────────────────────
  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    const before = tripsRef.current.find((trip) => trip.id === activeTripId)
    if (!before?.group || syncingRef.current) return null
    syncingRef.current = true
    setSyncing(true)
    setError(null)
    try {
      const author = cleanAuthor(readPreferences().travelerName)
      const outcome = await syncGroupTrip(before, api, author)

      const latest = tripsRef.current.find((trip) => trip.id === before.id)
      if (!latest) return null // supprimé pendant l'échange

      let next = outcome.trip
      if (latest !== before) {
        // Modifié ici pendant l'échange : ces retouches restent, à envoyer
        // à la prochaine synchronisation.
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
      }
      if (next !== latest) await persistTrip(next)
      if (!deepEqual(latest.itinerary, next.itinerary)) {
        setRemoteApplied({
          tripId: before.id,
          before: latest.itinerary,
          after: next.itinerary,
          at: Date.now(),
        })
      }

      if (outcome.kind === 'gone') {
        trackEvent('group_sync_failed', { reason: 'gone' })
        setError(
          'Ce voyage n’est plus partagé : il reste sur ce téléphone, sans synchronisation.',
        )
        return null
      }

      if (next.group?.etag) {
        setRemoteVersions((current) => ({
          ...current,
          [before.id]: next.group!.etag!,
        }))
      }
      setCheckedAt(Date.now())
      setOffline(false)

      const contentChanged = !deepEqual(
        { title: before.title, itinerary: before.itinerary },
        { title: outcome.trip.title, itinerary: outcome.trip.itinerary },
      )
      const received =
        contentChanged &&
        (outcome.kind === 'received' ||
          (outcome.kind === 'sent' && outcome.receivedFrom !== undefined))
      const result: SyncResult = {
        tripId: before.id,
        upToDate: outcome.kind === 'unchanged',
        received,
        author:
          outcome.kind === 'received'
            ? outcome.author
            : outcome.kind === 'sent'
              ? (outcome.receivedFrom ?? null)
              : null,
        sent: outcome.kind === 'sent',
        conflicts:
          outcome.kind === 'sent' || outcome.kind === 'received'
            ? outcome.conflicts
            : 0,
        at: Date.now(),
      }
      setLastResult(result)
      trackEvent('group_synced', {
        received: result.received,
        sent: result.sent,
      })
      return result
    } catch (err) {
      const isOff = isOffline(err)
      setOffline(isOff)
      if (!isOff) {
        console.error('Synchronisation du groupe impossible', err)
        trackEvent('group_sync_failed', { reason: 'error' })
      }
      setError(
        isOff
          ? 'Pas de connexion : réessayez une fois en ligne. Rien n’est perdu.'
          : err instanceof Error
            ? err.message
            : 'La synchronisation a échoué.',
      )
      return null
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [activeTripId, persistTrip, tripsRef])

  const status: GroupSyncStatus = {
    version: activeTrip?.group
      ? groupVersionState(
          activeTrip.group,
          remoteVersions[activeTrip.id] ?? null,
        )
      : 'unknown',
    syncing,
    checkedAt,
    offline,
    error,
    lastResult: lastResult?.tripId === activeTripId ? lastResult : null,
  }

  return {
    groupSyncStatus: status,
    remoteApplied,
    syncGroupNow: syncNow,
    checkGroupVersion: check,
  }
}
