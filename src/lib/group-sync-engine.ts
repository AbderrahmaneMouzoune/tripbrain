/**
 * Un tour de synchronisation pour un voyage de groupe : envoyer ce qui a
 * changé ici, récupérer ce qui a changé ailleurs, fusionner si les deux ont
 * bougé. Sans React ni IndexedDB : on lui donne le voyage, il rend le voyage
 * à jour, ce qui le rend testable avec un faux serveur.
 */

import {
  GroupNotFoundError,
  type FetchGroupResult,
  type GroupState,
  type PushGroupResult,
} from '@/lib/group-sync'
import type { DayItinerary } from '@/lib/itinerary-data'
import { deepEqual, mergeThreeWay } from '@/lib/trip-merge'
import type { StoredTrip } from '@/lib/trips'

export interface GroupSyncApi {
  fetch(id: string, etag: string | null): Promise<FetchGroupResult>
  push(
    id: string,
    body: { data: string; title: string; author: string | null },
    ifMatch: string | null,
  ): Promise<PushGroupResult>
  compress(itinerary: DayItinerary[]): Promise<string>
  decompress(data: string): DayItinerary[]
}

export type SyncOutcome =
  /** Rien de neuf, ni ici ni ailleurs. */
  | { kind: 'unchanged'; trip: StoredTrip }
  /** Les modifications des autres sont arrivées. */
  | {
      kind: 'received'
      trip: StoredTrip
      author: string | null
      conflicts: number
    }
  /** Les modifications d'ici sont parties (après fusion éventuelle). */
  | {
      kind: 'sent'
      trip: StoredTrip
      receivedFrom: string | null | undefined
      conflicts: number
    }
  /** Le groupe n'existe plus côté serveur. */
  | { kind: 'gone'; trip: StoredTrip }

/** Tentatives d'envoi quand d'autres écrivent en même temps. */
const MAX_PUSH_ATTEMPTS = 4

interface Content {
  title: string
  itinerary: DayItinerary[]
}

/**
 * Range dans le voyage une version reçue du serveur : `content` devient la
 * copie locale, `base` l'ancêtre de la prochaine fusion. `dirty` dit s'il
 * reste des modifications d'ici à envoyer par-dessus.
 */
function adopt(
  trip: StoredTrip,
  content: Content,
  base: Content,
  state: GroupState,
  now: number,
  dirty: boolean,
): StoredTrip {
  return {
    ...trip,
    title: content.title || trip.title,
    itinerary: content.itinerary,
    group: {
      ...trip.group!,
      etag: state.etag,
      base,
      dirty,
      syncedAt: now,
      lastAuthor: state.author,
      remoteUpdatedAt: Date.parse(state.updatedAt) || now,
    },
  }
}

/** Fusionne la copie locale avec une version du serveur. */
function mergeWith(
  trip: StoredTrip,
  state: GroupState,
  api: GroupSyncApi,
): { content: Content; remote: Content; conflicts: number } {
  const remote: Content = {
    title: state.title || trip.title,
    itinerary: api.decompress(state.data),
  }
  const base = trip.group?.base ?? null
  const merged = mergeThreeWay<Content>(
    base,
    { title: trip.title, itinerary: trip.itinerary },
    remote,
  )
  return { content: merged.value, remote, conflicts: merged.conflicts }
}

export async function syncGroupTrip(
  trip: StoredTrip,
  api: GroupSyncApi,
  author: string | null,
  now: () => number = Date.now,
): Promise<SyncOutcome> {
  const group = trip.group
  if (!group) return { kind: 'unchanged', trip }

  try {
    // ── Rien à envoyer : on regarde seulement si les autres ont avancé.
    if (!group.dirty) {
      const result = await api.fetch(group.id, group.etag)
      if (result.status === 'unchanged') {
        return {
          kind: 'unchanged',
          trip: { ...trip, group: { ...group, syncedAt: now() } },
        }
      }
      const state = result.state
      const remote: Content = {
        title: state.title || trip.title,
        itinerary: api.decompress(state.data),
      }
      return {
        kind: 'received',
        trip: adopt(trip, remote, remote, state, now(), false),
        author: state.author,
        conflicts: 0,
      }
    }

    // ── Des modifications attendent : on les envoie depuis la version
    // connue ; si quelqu'un est passé entre-temps, on fusionne et on recommence.
    let current = trip
    let conflicts = 0
    let receivedFrom: string | null | undefined
    for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
      const g = current.group!
      const data = await api.compress(current.itinerary)
      const result = await api.push(
        g.id,
        { data, title: current.title, author },
        g.etag,
      )
      if (result.status === 'saved') {
        const at = Date.parse(result.updatedAt) || now()
        return {
          kind: 'sent',
          receivedFrom,
          conflicts,
          trip: {
            ...current,
            group: {
              ...g,
              etag: result.etag,
              base: { title: current.title, itinerary: current.itinerary },
              dirty: false,
              syncedAt: now(),
              lastAuthor: author,
              remoteUpdatedAt: at,
            },
          },
        }
      }

      const state = result.current
      const merged = mergeWith(current, state, api)
      conflicts += merged.conflicts
      receivedFrom = state.author
      // Si la fusion ne garde rien d'ici que le serveur n'ait déjà, il n'y a
      // plus rien à envoyer : on s'aligne sur sa version.
      const nothingLeft = deepEqual(merged.content, merged.remote)
      current = adopt(
        current,
        merged.content,
        merged.remote,
        state,
        now(),
        !nothingLeft,
      )
      if (nothingLeft) {
        return {
          kind: 'received',
          trip: current,
          author: state.author,
          conflicts,
        }
      }
    }
    throw new Error('Trop de modifications simultanées. Réessayez.')
  } catch (error) {
    if (error instanceof GroupNotFoundError) {
      return {
        kind: 'gone',
        trip: { ...trip, group: undefined },
      }
    }
    throw error
  }
}
