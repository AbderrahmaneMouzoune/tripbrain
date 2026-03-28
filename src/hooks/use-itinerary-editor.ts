'use client'

import { useCallback, useRef } from 'react'
import type { DayItinerary, Activity } from '@/lib/itinerary-data'

interface UseItineraryEditorOptions {
  itinerary: DayItinerary[]
  updateItinerary: (newItinerary: DayItinerary[]) => Promise<void>
  saveSnapshot: (label: string) => Promise<void>
}

export function useItineraryEditor({
  itinerary,
  updateItinerary,
  saveSnapshot,
}: UseItineraryEditorOptions) {
  const snapshotSavedRef = useRef(false)

  const ensureSnapshot = useCallback(async () => {
    if (!snapshotSavedRef.current) {
      snapshotSavedRef.current = true
      await saveSnapshot('Avant modifications')
    }
  }, [saveSnapshot])

  const updateDay = useCallback(
    async (dayIndex: number, updates: Partial<DayItinerary>) => {
      await ensureSnapshot()
      const next = itinerary.map((d, i) =>
        i === dayIndex ? { ...d, ...updates } : d,
      )
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const addDay = useCallback(
    async (day: DayItinerary) => {
      await ensureSnapshot()
      const next = [...itinerary, day]
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const deleteDay = useCallback(
    async (dayIndex: number) => {
      await ensureSnapshot()
      const next = itinerary
        .filter((_, i) => i !== dayIndex)
        .map((d, i) => ({ ...d, dayNumber: i + 1 }))
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const moveDayUp = useCallback(
    async (dayIndex: number) => {
      if (dayIndex === 0) return
      await ensureSnapshot()
      const next = [...itinerary]
      ;[next[dayIndex - 1], next[dayIndex]] = [next[dayIndex], next[dayIndex - 1]]
      const reindexed = next.map((d, i) => ({ ...d, dayNumber: i + 1 }))
      await updateItinerary(reindexed)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const moveDayDown = useCallback(
    async (dayIndex: number) => {
      if (dayIndex >= itinerary.length - 1) return
      await ensureSnapshot()
      const next = [...itinerary]
      ;[next[dayIndex], next[dayIndex + 1]] = [next[dayIndex + 1], next[dayIndex]]
      const reindexed = next.map((d, i) => ({ ...d, dayNumber: i + 1 }))
      await updateItinerary(reindexed)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const addActivity = useCallback(
    async (dayIndex: number, activity: Activity) => {
      await ensureSnapshot()
      const next = itinerary.map((d, i) =>
        i === dayIndex
          ? { ...d, activities: [...d.activities, activity] }
          : d,
      )
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const updateActivity = useCallback(
    async (dayIndex: number, actIndex: number, activity: Activity) => {
      await ensureSnapshot()
      const next = itinerary.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              activities: d.activities.map((a, j) =>
                j === actIndex ? activity : a,
              ),
            }
          : d,
      )
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const deleteActivity = useCallback(
    async (dayIndex: number, actIndex: number) => {
      await ensureSnapshot()
      const next = itinerary.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              activities: d.activities.filter((_, j) => j !== actIndex),
            }
          : d,
      )
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const duplicateActivity = useCallback(
    async (dayIndex: number, actIndex: number) => {
      await ensureSnapshot()
      const activity = itinerary[dayIndex]?.activities[actIndex]
      if (!activity) return
      const copy: Activity = { ...activity }
      const next = itinerary.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              activities: [
                ...d.activities.slice(0, actIndex + 1),
                copy,
                ...d.activities.slice(actIndex + 1),
              ],
            }
          : d,
      )
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const moveActivityUp = useCallback(
    async (dayIndex: number, actIndex: number) => {
      if (actIndex === 0) return
      await ensureSnapshot()
      const next = itinerary.map((d, i) => {
        if (i !== dayIndex) return d
        const acts = [...d.activities]
        ;[acts[actIndex - 1], acts[actIndex]] = [acts[actIndex], acts[actIndex - 1]]
        return { ...d, activities: acts }
      })
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const moveActivityDown = useCallback(
    async (dayIndex: number, actIndex: number) => {
      const day = itinerary[dayIndex]
      if (!day || actIndex >= day.activities.length - 1) return
      await ensureSnapshot()
      const next = itinerary.map((d, i) => {
        if (i !== dayIndex) return d
        const acts = [...d.activities]
        ;[acts[actIndex], acts[actIndex + 1]] = [acts[actIndex + 1], acts[actIndex]]
        return { ...d, activities: acts }
      })
      await updateItinerary(next)
    },
    [itinerary, updateItinerary, ensureSnapshot],
  )

  const resetSession = useCallback(() => {
    snapshotSavedRef.current = false
  }, [])

  return {
    updateDay,
    addDay,
    deleteDay,
    moveDayUp,
    moveDayDown,
    addActivity,
    updateActivity,
    deleteActivity,
    duplicateActivity,
    moveActivityUp,
    moveActivityDown,
    resetSession,
  }
}
