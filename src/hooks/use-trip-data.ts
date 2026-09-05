'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { itinerary as mockItinerary } from '@/lib/itinerary-data'
import { removeDemoDocuments, seedDemoDocuments } from '@/lib/demo-documents'
import { replaceDay } from '@/lib/itinerary-edit'
import { trackEvent } from '@/lib/analytics/client'
import { importFailureReason, itineraryVolume } from '@/lib/analytics/metrics'

const DB_NAME = 'tripbrain'
const DB_VERSION = 1
const STORE_NAME = 'tripData'
const DATA_KEY = 'current'
const DEMO_KEY = 'tripbrain-demo'

export interface TripData {
  itinerary: DayItinerary[]
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function useTripData() {
  const [isLoading, setIsLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [itinerary, setItinerary] = useState<DayItinerary[]>([])

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
  const [isDemo, setIsDemo] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setIsDemo(localStorage.getItem(DEMO_KEY) === 'true')

      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(DATA_KEY)

      return new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const data = request.result as TripData | undefined
          if (data && data.itinerary?.length > 0) {
            setItinerary(data.itinerary)
            setHasData(true)
          }
          setIsLoading(false)
          resolve()
        }
        request.onerror = () => {
          setIsLoading(false)
          resolve()
        }
      })
    } catch {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const saveData = useCallback(async (data: TripData) => {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(data, DATA_KEY)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }, [])

  const loadMockData = useCallback(async () => {
    const data: TripData = { itinerary: mockItinerary }
    await saveData(data)
    try {
      // Sample travel paperwork so the Documents tab isn't empty in demo mode
      await seedDemoDocuments()
    } catch {
      // Documents are a bonus — never block the demo itinerary on them
    }
    localStorage.setItem(DEMO_KEY, 'true')
    setItinerary(mockItinerary)
    setHasData(true)
    setIsDemo(true)
    trackEvent('trip_imported', {
      source: 'demo',
      ...itineraryVolume(mockItinerary),
    })
  }, [saveData])

  const importData = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as TripData
        if (!parsed.itinerary || !Array.isArray(parsed.itinerary)) {
          throw new Error('Format invalide : tableau itinerary manquant')
        }
        await saveData({ itinerary: parsed.itinerary })
        setItinerary(parsed.itinerary)
        setHasData(true)
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
    [saveData],
  )

  const importXlsxData = useCallback(
    async (file: File) => {
      try {
        const { importFromXlsx } = await import('@/lib/importItinerary')
        const result = await importFromXlsx(file)
        await saveData({ itinerary: result.itinerary })
        setItinerary(result.itinerary)
        setHasData(true)
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
    [saveData],
  )

  const importCsvData = useCallback(
    async (files: File[]) => {
      try {
        const { importFromCsv } = await import('@/lib/importItinerary')
        const result = await importFromCsv(files)
        await saveData({ itinerary: result.itinerary })
        setItinerary(result.itinerary)
        setHasData(true)
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
    [saveData],
  )

  /**
   * Enregistre un itinéraire reçu par partage (QR code ou code de partage) et
   * bascule l'application dessus. Il remplace intégralement les données locales,
   * démo comprise : l'appel se fait donc derrière une confirmation.
   */
  const importSharedItinerary = useCallback(
    async (days: DayItinerary[]) => {
      if (days.length === 0) {
        throw new Error('Le partage ne contient aucune journée.')
      }

      await saveData({ itinerary: days })

      if (localStorage.getItem(DEMO_KEY) === 'true') {
        try {
          // Les documents de démo n'ont plus rien à voir avec le voyage importé
          await removeDemoDocuments()
        } catch {
          // Bonus : ne jamais bloquer l'import sur les documents
        }
        localStorage.removeItem(DEMO_KEY)
      }

      setItinerary(days)
      setHasData(true)
      setIsDemo(false)
    },
    [saveData],
  )

  /**
   * Remplace l'itinéraire entier puis le persiste. Sert au retour arrière du
   * mode édition, qui restaure une photo prise avant les modifications.
   * La mise à jour est optimiste : en cas d'échec d'écriture, l'état précédent
   * est restauré et l'erreur remonte à l'appelant.
   */
  const replaceItinerary = useCallback(
    async (next: DayItinerary[]) => {
      const previous = itinerary
      setItinerary(next)

      try {
        await saveData({ itinerary: next })
      } catch (error) {
        setItinerary(previous)
        throw error
      }
    },
    [itinerary, saveData],
  )

  /** Remplace un jour édité depuis l'interface, puis persiste l'itinéraire. */
  const updateDay = useCallback(
    async (day: DayItinerary) => {
      await replaceItinerary(replaceDay(itinerary, day))
    },
    [itinerary, replaceItinerary],
  )

  const exportData = useCallback(() => {
    const data: TripData = { itinerary }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tripbrain-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [itinerary])

  const clearData = useCallback(async () => {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(DATA_KEY)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    try {
      // Only removes the seeded demo files, never the user's own documents
      await removeDemoDocuments()
    } catch {
      // Ignore — clearing the itinerary is what matters here
    }

    localStorage.removeItem(DEMO_KEY)
    setItinerary([])
    setHasData(false)
    setIsDemo(false)
  }, [])

  const getCurrentDayIndex = useCallback((): number => {
    if (itinerary.length === 0) return 0

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < itinerary.length; i++) {
      const dayDate = new Date(itinerary[i].date)
      dayDate.setHours(0, 0, 0, 0)
      if (dayDate.getTime() === today.getTime()) return i
    }

    const start = new Date(tripStartDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(tripEndDate)
    end.setHours(0, 0, 0, 0)

    if (today < start) return 0
    if (today > end) return itinerary.length - 1
    return 0
  }, [itinerary, tripStartDate, tripEndDate])

  return {
    isLoading,
    hasData,
    isDemo,
    itinerary,
    tripStartDate,
    tripEndDate,
    loadMockData,
    importData,
    importXlsxData,
    importCsvData,
    importSharedItinerary,
    updateDay,
    replaceItinerary,
    exportData,
    clearData,
    getCurrentDayIndex,
  }
}
