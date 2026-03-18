'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  itinerary as defaultItinerary,
  tripStartDate as defaultTripStartDate,
  tripEndDate as defaultTripEndDate,
  type DayItinerary,
} from '@/lib/itinerary-data'

const STORAGE_KEY_ITINERARY = 'tripbrain:itinerary'
const STORAGE_KEY_START_DATE = 'tripbrain:start-date'
const STORAGE_KEY_END_DATE = 'tripbrain:end-date'

export interface TripData {
  itinerary: DayItinerary[]
  tripStartDate: Date
  tripEndDate: Date
  isLoading: boolean
  updateItinerary: (itinerary: DayItinerary[]) => void
  updateDates: (startDate: Date, endDate: Date) => void
  resetToDefaults: () => void
}

function computeCurrentDayIndex(
  days: DayItinerary[],
  startDate: Date,
  endDate: Date,
): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < days.length; i++) {
    const dayDate = new Date(days[i].date)
    dayDate.setHours(0, 0, 0, 0)
    if (dayDate.getTime() === today.getTime()) return i
  }

  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)

  if (today < start) return 0
  if (today > end) return days.length - 1
  return 0
}

export function useTripData(): TripData & { currentDayIndex: number } {
  const [itinerary, setItinerary] = useState<DayItinerary[]>(defaultItinerary)
  const [tripStartDate, setTripStartDate] =
    useState<Date>(defaultTripStartDate)
  const [tripEndDate, setTripEndDate] = useState<Date>(defaultTripEndDate)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const savedItinerary = localStorage.getItem(STORAGE_KEY_ITINERARY)
      const savedStartDate = localStorage.getItem(STORAGE_KEY_START_DATE)
      const savedEndDate = localStorage.getItem(STORAGE_KEY_END_DATE)

      if (savedItinerary) {
        setItinerary(JSON.parse(savedItinerary) as DayItinerary[])
      } else {
        localStorage.setItem(
          STORAGE_KEY_ITINERARY,
          JSON.stringify(defaultItinerary),
        )
      }

      if (savedStartDate) {
        setTripStartDate(new Date(savedStartDate))
      } else {
        localStorage.setItem(
          STORAGE_KEY_START_DATE,
          defaultTripStartDate.toISOString().split('T')[0],
        )
      }

      if (savedEndDate) {
        setTripEndDate(new Date(savedEndDate))
      } else {
        localStorage.setItem(
          STORAGE_KEY_END_DATE,
          defaultTripEndDate.toISOString().split('T')[0],
        )
      }
    } catch (err) {
      console.error('[useTripData] Failed to load data from localStorage:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateItinerary = useCallback((newItinerary: DayItinerary[]) => {
    setItinerary(newItinerary)
    try {
      localStorage.setItem(
        STORAGE_KEY_ITINERARY,
        JSON.stringify(newItinerary),
      )
    } catch (err) {
      console.error(
        '[useTripData] Failed to write itinerary to localStorage:',
        err,
      )
    }
  }, [])

  const updateDates = useCallback((startDate: Date, endDate: Date) => {
    setTripStartDate(startDate)
    setTripEndDate(endDate)
    try {
      localStorage.setItem(
        STORAGE_KEY_START_DATE,
        startDate.toISOString().split('T')[0],
      )
      localStorage.setItem(
        STORAGE_KEY_END_DATE,
        endDate.toISOString().split('T')[0],
      )
    } catch (err) {
      console.error(
        '[useTripData] Failed to write trip dates to localStorage:',
        err,
      )
    }
  }, [])

  const resetToDefaults = useCallback(() => {
    setItinerary(defaultItinerary)
    setTripStartDate(defaultTripStartDate)
    setTripEndDate(defaultTripEndDate)
    try {
      localStorage.setItem(
        STORAGE_KEY_ITINERARY,
        JSON.stringify(defaultItinerary),
      )
      localStorage.setItem(
        STORAGE_KEY_START_DATE,
        defaultTripStartDate.toISOString().split('T')[0],
      )
      localStorage.setItem(
        STORAGE_KEY_END_DATE,
        defaultTripEndDate.toISOString().split('T')[0],
      )
    } catch (err) {
      console.error(
        '[useTripData] Failed to reset data in localStorage:',
        err,
      )
    }
  }, [])

  const currentDayIndex = useMemo(
    () => computeCurrentDayIndex(itinerary, tripStartDate, tripEndDate),
    [itinerary, tripStartDate, tripEndDate],
  )

  return {
    itinerary,
    tripStartDate,
    tripEndDate,
    isLoading,
    currentDayIndex,
    updateItinerary,
    updateDates,
    resetToDefaults,
  }
}
