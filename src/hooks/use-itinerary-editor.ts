'use client'

import { useState, useCallback } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'

const MAX_VERSIONS = 10

export interface VersionEntry {
  value: unknown
  timestamp: string
}

// Key format: "${dayIndex}|${fieldKey}"
type VersionKey = string

export function useItineraryEditor(
  itinerary: DayItinerary[],
  onPersist: (newItinerary: DayItinerary[]) => Promise<void>,
) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [versionHistory, setVersionHistory] = useState<
    Record<VersionKey, VersionEntry[]>
  >({})

  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev)
  }, [])

  const pushVersion = useCallback(
    (dayIndex: number, fieldKey: string, previousValue: unknown) => {
      const key: VersionKey = `${dayIndex}|${fieldKey}`
      setVersionHistory((prev) => ({
        ...prev,
        [key]: [
          { value: previousValue, timestamp: new Date().toISOString() },
          ...(prev[key] ?? []),
        ].slice(0, MAX_VERSIONS),
      }))
    },
    [],
  )

  const saveField = useCallback(
    async (
      dayIndex: number,
      fieldKey: string,
      previousValue: unknown,
      updatedDay: DayItinerary,
    ) => {
      pushVersion(dayIndex, fieldKey, previousValue)
      const newItinerary = itinerary.map((d, i) =>
        i === dayIndex ? updatedDay : d,
      )
      await onPersist(newItinerary)
    },
    [itinerary, onPersist, pushVersion],
  )

  const restoreVersion = useCallback(
    async (
      dayIndex: number,
      fieldKey: string,
      versionIndex: number,
      currentValue: unknown,
      applyFn: (day: DayItinerary, restored: unknown) => DayItinerary,
    ) => {
      const key: VersionKey = `${dayIndex}|${fieldKey}`
      const history = versionHistory[key] ?? []
      if (versionIndex >= history.length) return

      const restoredEntry = history[versionIndex]

      // Push current value to history so user can re-restore
      pushVersion(dayIndex, fieldKey, currentValue)

      // Remove the entry we are restoring from history
      setVersionHistory((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).filter((_, i) => i !== versionIndex),
      }))

      const updatedDay = applyFn(itinerary[dayIndex], restoredEntry.value)
      const newItinerary = itinerary.map((d, i) =>
        i === dayIndex ? updatedDay : d,
      )
      await onPersist(newItinerary)
    },
    [itinerary, versionHistory, onPersist, pushVersion],
  )

  const getVersionHistory = useCallback(
    (dayIndex: number, fieldKey: string): VersionEntry[] => {
      return versionHistory[`${dayIndex}|${fieldKey}`] ?? []
    },
    [versionHistory],
  )

  return {
    isEditMode,
    toggleEditMode,
    saveField,
    restoreVersion,
    getVersionHistory,
  }
}
