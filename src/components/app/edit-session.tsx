'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  countChanges,
  summarizeItineraryChanges,
  type DayChangeSummary,
} from '@/lib/itinerary-diff'
import { trackEvent } from '@/lib/analytics/client'
import { useTrip } from '@/components/app/trip-provider'

export type EditReviewIntent = 'save' | 'discard'

interface EditSessionValue {
  isEditing: boolean
  startEditing: () => void
  /**
   * Sortie du mode édition par le bouton « Terminer » : avec des modifications
   * en attente, on passe par le récapitulatif plutôt que de clore en silence.
   */
  finishEditing: () => void
  /** Clôt la session sans rien annuler : la photo de départ est oubliée. */
  stopEditing: () => void
  /** Remet le voyage tel qu'il était à l'entrée en mode édition. */
  discardEdits: () => Promise<void>
  /** Valide la session après le récapitulatif. */
  saveEdits: () => void
  reviewOpen: boolean
  reviewIntent: EditReviewIntent
  openReview: (intent: EditReviewIntent) => void
  setReviewOpen: (open: boolean) => void
  changeSummaries: DayChangeSummary[]
  pendingChanges: number
  /** Enregistre une journée modifiée (édition ou action rapide). */
  saveDay: (day: DayItinerary) => void
}

const EditSessionContext = createContext<EditSessionValue | null>(null)

export function EditSessionProvider({ children }: { children: ReactNode }) {
  const { itinerary, replaceItinerary, updateDay } = useTrip()
  const [isEditing, setIsEditing] = useState(false)
  // Photo de l'itinéraire prise à l'entrée en mode édition : elle permet de
  // tout remettre en place d'un geste tant que la session d'édition dure.
  const [baseline, setBaseline] = useState<DayItinerary[] | null>(null)
  // `reviewIntent` survit à la fermeture pour que le récapitulatif garde son
  // titre pendant l'animation de sortie.
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewIntent, setReviewIntent] = useState<EditReviewIntent>('save')

  const changeSummaries = useMemo(
    () => (baseline ? summarizeItineraryChanges(baseline, itinerary) : []),
    [baseline, itinerary],
  )
  const pendingChanges = countChanges(changeSummaries)

  const startEditing = useCallback(() => {
    setBaseline(itinerary)
    setIsEditing(true)
    trackEvent('edit_mode_started')
  }, [itinerary])

  const stopEditing = useCallback(() => {
    setReviewOpen(false)
    setIsEditing(false)
    setBaseline(null)
  }, [])

  const openReview = useCallback((intent: EditReviewIntent) => {
    setReviewIntent(intent)
    setReviewOpen(true)
  }, [])

  const finishEditing = useCallback(() => {
    if (pendingChanges > 0) {
      openReview('save')
      return
    }
    stopEditing()
  }, [openReview, pendingChanges, stopEditing])

  const saveEdits = useCallback(() => {
    trackEvent('edit_changes_saved', { changes_count: pendingChanges })
    stopEditing()
  }, [pendingChanges, stopEditing])

  const discardEdits = useCallback(async () => {
    if (!baseline) {
      stopEditing()
      return
    }
    const discarded = pendingChanges
    try {
      await replaceItinerary(baseline)
      trackEvent('edit_changes_discarded', { changes_count: discarded })
      stopEditing()
    } catch (error) {
      console.error('Annulation des modifications impossible', error)
    }
  }, [baseline, pendingChanges, replaceItinerary, stopEditing])

  const saveDay = useCallback(
    (day: DayItinerary) => {
      updateDay(day).catch((error) => {
        console.error('Enregistrement de la journée impossible', error)
      })
    },
    [updateDay],
  )

  const value = useMemo<EditSessionValue>(
    () => ({
      isEditing,
      startEditing,
      finishEditing,
      stopEditing,
      discardEdits,
      saveEdits,
      reviewOpen,
      reviewIntent,
      openReview,
      setReviewOpen,
      changeSummaries,
      pendingChanges,
      saveDay,
    }),
    [
      isEditing,
      startEditing,
      finishEditing,
      stopEditing,
      discardEdits,
      saveEdits,
      reviewOpen,
      reviewIntent,
      openReview,
      changeSummaries,
      pendingChanges,
      saveDay,
    ],
  )

  return (
    <EditSessionContext.Provider value={value}>
      {children}
    </EditSessionContext.Provider>
  )
}

export function useEditSession(): EditSessionValue {
  const value = useContext(EditSessionContext)
  if (!value) {
    throw new Error(
      'useEditSession doit être appelé sous <EditSessionProvider>.',
    )
  }
  return value
}
