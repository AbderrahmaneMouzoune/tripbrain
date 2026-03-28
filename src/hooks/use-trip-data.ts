'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  itinerary as mockItinerary,
  tripStartDate as mockStartDate,
  tripEndDate as mockEndDate,
} from '@/lib/itinerary-data'

const DB_NAME = 'tripbrain'
const DB_VERSION = 1
const STORE_NAME = 'tripData'
const DATA_KEY = 'current'

export interface TripData {
  itinerary: DayItinerary[]
  tripStartDate: string
  tripEndDate: string
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
  const [tripStartDate, setTripStartDate] = useState<Date>(new Date())
  const [tripEndDate, setTripEndDate] = useState<Date>(new Date())

  const loadData = useCallback(async () => {
    try {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(DATA_KEY)

      return new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const data = request.result as TripData | undefined
          if (data && data.itinerary?.length > 0) {
            setItinerary(data.itinerary)
            setTripStartDate(new Date(data.tripStartDate))
            setTripEndDate(new Date(data.tripEndDate))
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
    const data: TripData = {
      itinerary: mockItinerary,
      tripStartDate: mockStartDate.toISOString().split('T')[0],
      tripEndDate: mockEndDate.toISOString().split('T')[0],
    }
    await saveData(data)
    setItinerary(mockItinerary)
    setTripStartDate(mockStartDate)
    setTripEndDate(mockEndDate)
    setHasData(true)
  }, [saveData])

  const importData = useCallback(
    async (file: File) => {
      const text = await file.text()
      const parsed = JSON.parse(text) as TripData
      if (!parsed.itinerary || !Array.isArray(parsed.itinerary)) {
        throw new Error('Format invalide : tableau itinerary manquant')
      }
      if (!parsed.tripStartDate || !parsed.tripEndDate) {
        throw new Error('Format invalide : dates du voyage manquantes')
      }
      await saveData(parsed)
      setItinerary(parsed.itinerary)
      setTripStartDate(new Date(parsed.tripStartDate))
      setTripEndDate(new Date(parsed.tripEndDate))
      setHasData(true)
    },
    [saveData],
  )

  const exportData = useCallback(() => {
    const data: TripData = {
      itinerary,
      tripStartDate: tripStartDate.toISOString().split('T')[0],
      tripEndDate: tripEndDate.toISOString().split('T')[0],
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tripbrain-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [itinerary, tripStartDate, tripEndDate])

  const clearData = useCallback(async () => {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(DATA_KEY)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    setItinerary([])
    setHasData(false)
  }, [])

  const saveItinerary = useCallback(
    async (newItinerary: DayItinerary[]) => {
      const data: TripData = {
        itinerary: newItinerary,
        tripStartDate: tripStartDate.toISOString().split('T')[0],
        tripEndDate: tripEndDate.toISOString().split('T')[0],
      }
      await saveData(data)
      setItinerary(newItinerary)
    },
    [tripStartDate, tripEndDate, saveData],
  )

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
    itinerary,
    tripStartDate,
    tripEndDate,
    loadMockData,
    importData,
    exportData,
    clearData,
    saveItinerary,
    getCurrentDayIndex,
  }
}
