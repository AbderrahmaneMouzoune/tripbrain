'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { itinerary as mockItinerary } from '@/lib/itinerary-data'
import { demoItineraryFor } from '@/lib/demo-trip'
import { removeDemoDocuments, seedDemoDocuments } from '@/lib/demo-documents'
import { replaceDay } from '@/lib/itinerary-edit'
import { useGroupSync } from '@/hooks/use-group-sync'
import {
  cleanAuthor,
  createGroup,
  type GroupState,
  type TripGroup,
} from '@/lib/group-sync'
import { readPreferences } from '@/lib/preferences'
import { compressItinerary } from '@/lib/share'
import { trackEvent } from '@/lib/analytics/client'
import { importFailureReason, itineraryVolume } from '@/lib/analytics/metrics'
import {
  createTripId,
  currentDayIndex,
  deriveTripTitle,
  msUntilNextMidnight,
  pickDefaultTrip,
  sortTripSummaries,
  summarizeTrip,
  type StoredTrip,
  type TripSource,
  type TripSummary,
} from '@/lib/trips'
import {
  deleteAllTrips,
  deleteTripRecord,
  readActiveTripId,
  readAllTrips,
  writeActiveTripId,
  writeTrip,
} from '@/lib/trips-db'
import { saveFile } from '@/lib/save-file'

/** Titre du voyage d'exemple, qui couvre la Chine et Taïwan. */
export const DEMO_TRIP_TITLE = 'Chine & Taïwan'

export interface TripData {
  itinerary: DayItinerary[]
}

export interface AddTripOptions {
  title?: string
  source: TripSource
  /** Ouvre le voyage aussitôt enregistré (par défaut). */
  activate?: boolean
  /** Voyage de groupe rejoint par invitation. */
  group?: TripGroup
}

/** Remplacer le voyage consulté plutôt que d'en ajouter un : choix offert à la réception d'un partage. */
export type ImportMode = 'add' | 'replace'

/** Un voyage modifié ici : s'il est partagé en groupe, il est à envoyer. */
function touched(trip: StoredTrip, patch: Partial<StoredTrip>): StoredTrip {
  return {
    ...trip,
    ...patch,
    updatedAt: Date.now(),
    ...(trip.group ? { group: { ...trip.group, dirty: true } } : {}),
  }
}

export interface ImportSharedOptions {
  mode?: ImportMode
  title?: string
  source?: TripSource
}

/** La date du jour, renouvelée à minuit et quand l'application revient au premier plan. */
function useToday(): Date {
  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      setToday((current) =>
        current.toDateString() === new Date().toDateString()
          ? current
          : new Date(),
      )
    }
    const arm = () => {
      clearTimeout(timer)
      // Une seconde de marge : le minuteur peut partir un peu en avance.
      timer = setTimeout(() => {
        refresh()
        arm()
      }, msUntilNextMidnight() + 1000)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refresh()
      arm()
    }
    arm()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return today
}

export function useTripData() {
  const [isLoading, setIsLoading] = useState(true)
  const [trips, setTrips] = useState<StoredTrip[]>([])
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  /**
   * Compte les voyages ouverts, pas les modifications : il n'avance qu'à
   * l'ouverture, aux imports et aux changements de voyage, jamais quand une
   * journée est retouchée. C'est ce qui permet à l'interface de se placer sur
   * la bonne journée sans y revenir à chaque case cochée.
   */
  const [tripRevision, setTripRevision] = useState(0)

  // Toujours la dernière liste, pour les écritures enchaînées sans attendre un
  // rendu. Mise à jour en même temps que l'état (`commitTrips`), jamais au
  // rendu : la synchronisation enchaîne plusieurs tours sans rendu entre eux,
  // et une liste en retard d'un tour lui faisait renvoyer une copie déjà
  // envoyée, en boucle.
  const tripsRef = useRef<StoredTrip[]>([])
  const commitTrips = useCallback(
    (update: (list: StoredTrip[]) => StoredTrip[]) => {
      tripsRef.current = update(tripsRef.current)
      setTrips(tripsRef.current)
    },
    [],
  )

  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === activeTripId) ?? null,
    [trips, activeTripId],
  )
  const itinerary = useMemo(() => activeTrip?.itinerary ?? [], [activeTrip])
  const hasData = itinerary.length > 0
  const isDemo = Boolean(activeTrip?.isDemo)

  // En cours, à venir ou passé dépend du jour : la liste se recalcule à
  // minuit et au retour au premier plan, l'application pouvant rester
  // ouverte (ou suspendue) d'un jour à l'autre.
  const today = useToday()
  const summaries = useMemo<TripSummary[]>(
    () => sortTripSummaries(trips.map((trip) => summarizeTrip(trip, today))),
    [trips, today],
  )

  const tripStartDate = useMemo(
    () => (itinerary.length > 0 ? new Date(itinerary[0].date) : new Date()),
    [itinerary],
  )
  const tripEndDate = useMemo(
    () =>
      itinerary.length > 0
        ? new Date(itinerary[itinerary.length - 1].date)
        : new Date(),
    [itinerary],
  )

  const activate = useCallback((id: string | null) => {
    setActiveTripId(id)
    writeActiveTripId(id)
    setTripRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    readAllTrips()
      .then((stored) => {
        if (cancelled) return
        commitTrips(() => stored)
        const remembered = readActiveTripId()
        const id =
          remembered && stored.some((trip) => trip.id === remembered)
            ? remembered
            : pickDefaultTrip(stored.map((trip) => summarizeTrip(trip)))
        setActiveTripId(id)
        if (id) setTripRevision((revision) => revision + 1)
      })
      .catch((error) => {
        console.error('Lecture des voyages impossible', error)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Écrit un voyage et l'insère (ou le remplace) dans la liste en mémoire. */
  const persistTrip = useCallback(
    async (trip: StoredTrip) => {
      await writeTrip(trip)
      commitTrips((current) => {
        const exists = current.some((item) => item.id === trip.id)
        return exists
          ? current.map((item) => (item.id === trip.id ? trip : item))
          : [...current, trip]
      })
    },
    [commitTrips],
  )

  // Synchronisation à la demande : modifier un voyage de groupe le marque
  // seulement « à envoyer » ; rien ne part ni n'arrive sans `syncGroupNow`.
  const { groupSyncStatus, remoteApplied, syncGroupNow, checkGroupVersion } =
    useGroupSync({ tripsRef, trips, activeTripId, persistTrip })

  /** Retire un voyage ; s'il s'agit de la démo, ses documents d'exemple partent avec. */
  const removeTrip = useCallback(
    async (trip: StoredTrip) => {
      await deleteTripRecord(trip.id)
      if (trip.isDemo) {
        try {
          await removeDemoDocuments()
        } catch {
          // Bonus : ne jamais bloquer la suppression sur les documents
        }
      }
      commitTrips((current) => current.filter((item) => item.id !== trip.id))
    },
    [commitTrips],
  )

  /**
   * Enregistre un nouveau voyage. Ajouter un vrai voyage pendant la démo fait
   * quitter la démo : le voyage d'exemple n'a plus rien à faire dans la liste.
   */
  const addTrip = useCallback(
    async (days: DayItinerary[], options: AddTripOptions): Promise<string> => {
      if (days.length === 0) {
        throw new Error('Le voyage ne contient aucune journée.')
      }
      const now = Date.now()
      const trip: StoredTrip = {
        id: createTripId(),
        title: options.title?.trim() || deriveTripTitle(days),
        itinerary: days,
        source: options.source,
        createdAt: now,
        updatedAt: now,
        isDemo: options.source === 'demo',
        ...(options.group ? { group: options.group } : {}),
      }
      await persistTrip(trip)

      if (options.source !== 'demo') {
        for (const demo of tripsRef.current.filter((item) => item.isDemo)) {
          await removeTrip(demo)
        }
      }

      if (options.activate !== false) activate(trip.id)
      return trip.id
    },
    [activate, persistTrip, removeTrip],
  )

  const loadMockData = useCallback(async () => {
    const existing = tripsRef.current.find((trip) => trip.isDemo)
    if (existing) {
      activate(existing.id)
      return
    }
    try {
      // Des documents d'exemple pour que l'onglet Documents ne soit pas vide
      await seedDemoDocuments()
    } catch {
      // Les documents sont un bonus : la démo s'ouvre sans eux
    }
    // Recalé sur aujourd'hui : la démo montre un voyage en cours, pas fini.
    const demo = demoItineraryFor(mockItinerary)
    await addTrip(demo, { source: 'demo', title: DEMO_TRIP_TITLE })
    trackEvent('trip_imported', {
      source: 'demo',
      ...itineraryVolume(demo),
    })
  }, [activate, addTrip])

  const importData = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as TripData & { title?: string }
        if (!parsed.itinerary || !Array.isArray(parsed.itinerary)) {
          throw new Error('Format invalide : tableau itinerary manquant')
        }
        await addTrip(parsed.itinerary, { source: 'json', title: parsed.title })
        trackEvent('trip_imported', {
          source: 'json',
          ...itineraryVolume(parsed.itinerary),
        })
      } catch (error) {
        // Seule la nature de l'échec est remontée : ni le fichier, ni son nom.
        trackEvent('trip_import_failed', {
          source: 'json',
          reason: importFailureReason(error),
        })
        throw error
      }
    },
    [addTrip],
  )

  const importXlsxData = useCallback(
    async (file: File) => {
      try {
        const { importFromXlsx } = await import('@/lib/importItinerary')
        const result = await importFromXlsx(file)
        await addTrip(result.itinerary, { source: 'xlsx' })
        trackEvent('trip_imported', {
          source: 'xlsx',
          ...itineraryVolume(result.itinerary),
        })
      } catch (error) {
        trackEvent('trip_import_failed', {
          source: 'xlsx',
          reason: importFailureReason(error),
        })
        throw error
      }
    },
    [addTrip],
  )

  const importCsvData = useCallback(
    async (files: File[]) => {
      try {
        const { importFromCsv } = await import('@/lib/importItinerary')
        const result = await importFromCsv(files)
        await addTrip(result.itinerary, { source: 'csv' })
        trackEvent('trip_imported', {
          source: 'csv',
          ...itineraryVolume(result.itinerary),
        })
      } catch (error) {
        trackEvent('trip_import_failed', {
          source: 'csv',
          reason: importFailureReason(error),
        })
        throw error
      }
    },
    [addTrip],
  )

  /**
   * Enregistre un itinéraire reçu par partage, par le générateur ou par le
   * site. Par défaut il s'ajoute aux voyages et s'ouvre ; en mode `replace`, il
   * prend la place du voyage consulté (même identifiant, même position).
   */
  const importSharedItinerary = useCallback(
    async (days: DayItinerary[], options: ImportSharedOptions = {}) => {
      if (days.length === 0) {
        throw new Error('Le partage ne contient aucune journée.')
      }
      const source = options.source ?? 'share'
      const current = tripsRef.current.find((trip) => trip.id === activeTripId)

      // Un voyage synchronisé n'est jamais remplacé : ce serait écraser le
      // programme de tout le groupe. Le voyage reçu s'ajoute à côté.
      if (
        options.mode === 'replace' &&
        current &&
        !current.isDemo &&
        !current.group
      ) {
        await persistTrip(
          touched(current, {
            itinerary: days,
            title: options.title?.trim() || deriveTripTitle(days),
            source,
          }),
        )
        setTripRevision((revision) => revision + 1)
        return
      }

      await addTrip(days, { source, title: options.title })
    },
    [activeTripId, addTrip, persistTrip],
  )

  /**
   * Remplace l'itinéraire du voyage consulté puis le persiste. Sert l'édition
   * et son retour arrière. La mise à jour est optimiste : en cas d'échec
   * d'écriture, l'état précédent est restauré et l'erreur remonte.
   */
  const replaceItinerary = useCallback(
    async (next: DayItinerary[]) => {
      const current = tripsRef.current.find((trip) => trip.id === activeTripId)
      if (!current) return
      const updated = touched(current, { itinerary: next })
      commitTrips((list) =>
        list.map((trip) => (trip.id === updated.id ? updated : trip)),
      )
      try {
        await writeTrip(updated)
      } catch (error) {
        commitTrips((list) =>
          list.map((trip) => (trip.id === current.id ? current : trip)),
        )
        throw error
      }
    },
    [activeTripId, commitTrips],
  )

  /** Remplace un jour édité depuis l'interface, puis persiste l'itinéraire. */
  const updateDay = useCallback(
    async (day: DayItinerary) => {
      // La liste à jour, pas celle du dernier rendu : une version reçue du
      // groupe entre-temps ne doit pas être écrasée par une copie en retard.
      const current = tripsRef.current.find((trip) => trip.id === activeTripId)
      await replaceItinerary(replaceDay(current?.itinerary ?? itinerary, day))
    },
    [activeTripId, itinerary, replaceItinerary],
  )

  const switchTrip = useCallback(
    (id: string) => {
      if (!tripsRef.current.some((trip) => trip.id === id)) return
      if (id !== activeTripId) trackEvent('trip_switched')
      activate(id)
    },
    [activate, activeTripId],
  )

  const renameTrip = useCallback(
    async (id: string, title: string) => {
      const trip = tripsRef.current.find((item) => item.id === id)
      const next = title.trim()
      if (!trip || !next) return
      await persistTrip(touched(trip, { title: next }))
    },
    [persistTrip],
  )

  /**
   * Partage le voyage avec d'autres voyageurs : il est déposé sur le serveur
   * et sera désormais tenu à jour sur chaque téléphone qui le rejoint.
   */
  const enableGroup = useCallback(
    async (id: string) => {
      const trip = tripsRef.current.find((item) => item.id === id)
      if (!trip || trip.group) return
      const created = await createGroup({
        data: await compressItinerary(trip.itinerary),
        title: trip.title,
        author: cleanAuthor(readPreferences().travelerName),
      })
      // Relu après l'appel réseau : une retouche faite entre-temps partira au
      // prochain tour, puisque la base est ce qui a été envoyé.
      const latest = tripsRef.current.find((item) => item.id === id) ?? trip
      const group: TripGroup = {
        id: created.id,
        etag: created.etag,
        base: { title: trip.title, itinerary: trip.itinerary },
        dirty: latest !== trip,
        syncedAt: Date.now(),
        lastAuthor: created.author,
        remoteUpdatedAt: Date.parse(created.updatedAt) || Date.now(),
      }
      await persistTrip({ ...latest, group })
      trackEvent('group_created', { days_count: trip.itinerary.length })
    },
    [persistTrip],
  )

  /**
   * Rejoint un voyage de groupe reçu par invitation. Déjà présent sur ce
   * téléphone, il est simplement ouvert (et mis à jour) au lieu d'être doublé.
   */
  const joinGroupTrip = useCallback(
    async (
      days: DayItinerary[],
      groupId: string,
      state: GroupState,
    ): Promise<string> => {
      const title = state.title.trim() || deriveTripTitle(days)
      const group: TripGroup = {
        id: groupId,
        etag: state.etag,
        base: { title, itinerary: days },
        dirty: false,
        syncedAt: Date.now(),
        lastAuthor: state.author,
        remoteUpdatedAt: Date.parse(state.updatedAt) || Date.now(),
      }
      const existing = tripsRef.current.find(
        (trip) => trip.group?.id === groupId,
      )
      if (existing) {
        if (!existing.group?.dirty) {
          await persistTrip({ ...existing, title, itinerary: days, group })
        }
        activate(existing.id)
        return existing.id
      }
      const id = await addTrip(days, { source: 'share', title, group })
      trackEvent('group_joined', { days_count: days.length })
      return id
    },
    [activate, addTrip, persistTrip],
  )

  /**
   * Arrête la synchronisation sur ce téléphone : le voyage reste tel quel,
   * les autres voyageurs gardent le leur et continuent sans lui.
   */
  const leaveGroup = useCallback(
    async (id: string) => {
      const trip = tripsRef.current.find((item) => item.id === id)
      if (!trip?.group) return
      await persistTrip({ ...trip, group: undefined })
      trackEvent('group_left')
    },
    [persistTrip],
  )

  /** Copie d'un voyage, utile avant de le retoucher en profondeur. */
  const duplicateTrip = useCallback(
    async (id: string) => {
      const trip = tripsRef.current.find((item) => item.id === id)
      if (!trip) return null
      return addTrip(trip.itinerary, {
        source: trip.source === 'demo' ? 'share' : trip.source,
        title: `${trip.title} (copie)`,
        activate: false,
      })
    },
    [addTrip],
  )

  /** Supprime un voyage ; si c'était celui consulté, on bascule sur le suivant. */
  const deleteTrip = useCallback(
    async (id: string) => {
      const trip = tripsRef.current.find((item) => item.id === id)
      if (!trip) return
      await removeTrip(trip)
      if (id === activeTripId) {
        const rest = tripsRef.current.filter((item) => item.id !== id)
        activate(pickDefaultTrip(rest.map((item) => summarizeTrip(item))))
      }
    },
    [activate, activeTripId, removeTrip],
  )

  const exportData = useCallback(() => {
    const data = { title: activeTrip?.title, itinerary }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    saveFile(blob, 'tripbrain-data.json')
  }, [activeTrip, itinerary])

  /** Supprime le voyage consulté (ancien « Réinitialiser » à un seul voyage). */
  const clearData = useCallback(async () => {
    if (activeTripId) await deleteTrip(activeTripId)
  }, [activeTripId, deleteTrip])

  /** Efface tous les voyages de l'appareil. Les documents se gèrent à part. */
  const clearAllData = useCallback(async () => {
    await deleteAllTrips()
    try {
      await removeDemoDocuments()
    } catch {
      // Ignorer : l'essentiel est d'effacer les voyages
    }
    commitTrips(() => [])
    activate(null)
  }, [activate, commitTrips])

  const getCurrentDayIndex = useCallback(
    (): number => currentDayIndex(itinerary),
    [itinerary],
  )

  return {
    isLoading,
    hasData,
    isDemo,
    itinerary,
    tripRevision,
    tripStartDate,
    tripEndDate,
    trips: summaries,
    groupSyncStatus,
    remoteApplied,
    syncGroupNow,
    checkGroupVersion,
    enableGroup,
    joinGroupTrip,
    leaveGroup,
    /** Voyages complets (itinéraires compris), pour ce qui les sert tous : les rappels. */
    storedTrips: trips,
    activeTrip,
    activeTripId,
    loadMockData,
    importData,
    importXlsxData,
    importCsvData,
    importSharedItinerary,
    addTrip,
    switchTrip,
    renameTrip,
    duplicateTrip,
    deleteTrip,
    updateDay,
    replaceItinerary,
    exportData,
    clearData,
    clearAllData,
    getCurrentDayIndex,
  }
}

export type TripDataApi = ReturnType<typeof useTripData>
