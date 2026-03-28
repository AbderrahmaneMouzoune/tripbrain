'use client'

import { useState, useCallback } from 'react'
import type { DayItinerary, Activity } from '@/lib/itinerary-data'

export interface ItineraryVersion {
  id: string
  timestamp: number
  label: string
  itinerary: DayItinerary[]
}

const MAX_VERSIONS = 10

export function useItineraryEditor(
  savedItinerary: DayItinerary[],
  onSave: (itinerary: DayItinerary[]) => Promise<void>,
) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftItinerary, setDraftItinerary] = useState<DayItinerary[]>([])
  const [dirtyDayIndices, setDirtyDayIndices] = useState<Set<number>>(new Set())
  const [versions, setVersions] = useState<ItineraryVersion[]>([])

  const enterEditMode = useCallback(() => {
    setDraftItinerary(JSON.parse(JSON.stringify(savedItinerary)))
    setDirtyDayIndices(new Set())
    setIsEditMode(true)
  }, [savedItinerary])

  const cancelEdit = useCallback(() => {
    setDraftItinerary([])
    setDirtyDayIndices(new Set())
    setIsEditMode(false)
  }, [])

  const validateEdit = useCallback(async () => {
    const newVersion: ItineraryVersion = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      label: `Version du ${new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      itinerary: JSON.parse(JSON.stringify(savedItinerary)),
    }
    setVersions((prev) => [newVersion, ...prev].slice(0, MAX_VERSIONS))
    await onSave(draftItinerary)
    setDirtyDayIndices(new Set())
    setIsEditMode(false)
  }, [savedItinerary, draftItinerary, onSave])

  const markDayDirty = useCallback((dayIndex: number) => {
    setDirtyDayIndices((prev) => new Set([...prev, dayIndex]))
  }, [])

  const updateDay = useCallback(
    (dayIndex: number, updates: Partial<DayItinerary>) => {
      setDraftItinerary((prev) => {
        const next = [...prev]
        next[dayIndex] = { ...next[dayIndex], ...updates }
        return next
      })
      markDayDirty(dayIndex)
    },
    [markDayDirty],
  )

  const updateActivity = useCallback(
    (dayIndex: number, activityIndex: number, updates: Partial<Activity>) => {
      setDraftItinerary((prev) => {
        const next = [...prev]
        const activities = [...next[dayIndex].activities]
        activities[activityIndex] = { ...activities[activityIndex], ...updates }
        next[dayIndex] = { ...next[dayIndex], activities }
        return next
      })
      markDayDirty(dayIndex)
    },
    [markDayDirty],
  )

  const addActivity = useCallback(
    (dayIndex: number) => {
      const newActivity: Activity = {
        name: 'Nouvelle activité',
        type: 'visit',
      }
      setDraftItinerary((prev) => {
        const next = [...prev]
        next[dayIndex] = {
          ...next[dayIndex],
          activities: [...next[dayIndex].activities, newActivity],
        }
        return next
      })
      markDayDirty(dayIndex)
    },
    [markDayDirty],
  )

  const removeActivity = useCallback(
    (dayIndex: number, activityIndex: number) => {
      setDraftItinerary((prev) => {
        const next = [...prev]
        const activities = next[dayIndex].activities.filter(
          (_, i) => i !== activityIndex,
        )
        next[dayIndex] = { ...next[dayIndex], activities }
        return next
      })
      markDayDirty(dayIndex)
    },
    [markDayDirty],
  )

  const duplicateActivity = useCallback(
    (dayIndex: number, activityIndex: number) => {
      setDraftItinerary((prev) => {
        const next = [...prev]
        const activities = [...next[dayIndex].activities]
        const copy = {
          ...activities[activityIndex],
          name: `${activities[activityIndex].name} (copie)`,
        }
        activities.splice(activityIndex + 1, 0, copy)
        next[dayIndex] = { ...next[dayIndex], activities }
        return next
      })
      markDayDirty(dayIndex)
    },
    [markDayDirty],
  )

  const moveActivity = useCallback(
    (dayIndex: number, fromIndex: number, toIndex: number) => {
      setDraftItinerary((prev) => {
        if (toIndex < 0 || toIndex >= prev[dayIndex].activities.length)
          return prev
        const next = [...prev]
        const activities = [...next[dayIndex].activities]
        const [moved] = activities.splice(fromIndex, 1)
        activities.splice(toIndex, 0, moved)
        next[dayIndex] = { ...next[dayIndex], activities }
        return next
      })
      markDayDirty(dayIndex)
    },
    [markDayDirty],
  )

  const restoreVersion = useCallback(
    async (versionId: string) => {
      const version = versions.find((v) => v.id === versionId)
      if (!version) return
      await onSave(version.itinerary)
    },
    [versions, onSave],
  )

  return {
    isEditMode,
    isDirty: dirtyDayIndices.size > 0,
    draftItinerary,
    dirtyDayIndices,
    versions,
    enterEditMode,
    cancelEdit,
    validateEdit,
    updateDay,
    updateActivity,
    addActivity,
    removeActivity,
    duplicateActivity,
    moveActivity,
    restoreVersion,
  }
}
