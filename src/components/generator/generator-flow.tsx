'use client'

import { useState } from 'react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { useTrip } from '@/components/app/trip-provider'
import { BriefQuestionnaire } from '@/components/generator/brief-questionnaire'
import { ExpressForm } from '@/components/generator/express-form'
import { GenerationResult } from '@/components/generator/generation-result'
import { GeneratorUnavailable } from '@/components/generator/generator-unavailable'
import { LiveGeneration } from '@/components/generator/live-generation'
import {
  useGeneration,
  useGeneratorDraft,
} from '@/components/generator/use-generator-store'
import { trackEvent } from '@/lib/analytics/client'
import {
  getGenerationState,
  resetGeneration,
  startGeneration,
  stopGeneration,
  updateGeneratorDraft,
  type GenerationState,
} from '@/lib/generator/generation-store'
import { toDayItineraries } from '@/lib/generator/itinerary-schema'
import type { GenerateRequest } from '@/lib/generator/requests'

/** Où en est le parcours, côté écran. La génération, elle, vit dans le magasin. */
type View = 'express' | 'brief' | 'generation'

/**
 * Rouvrir le générateur ramène là où l'on en était : la génération en cours
 * ou son résultat, sinon le formulaire.
 */
function initialView(state: GenerationState): View {
  return state.status === 'idle' ? 'express' : 'generation'
}

/**
 * Générateur d'itinéraire dans l'app : décrire (phrase libre ou
 * questionnaire), suivre la génération en direct, relire, affiner, puis
 * enregistrer le voyage.
 */
export function GeneratorScreen({ onClose }: ScreenProps<'generator'>) {
  const state = useGeneration()
  const draft = useGeneratorDraft()
  const { importSharedItinerary } = useTrip()
  const { replace } = useAppNav()
  const [view, setView] = useState<View>(() =>
    initialView(getGenerationState()),
  )
  /** Montrer le résultat partiel d'une génération arrêtée. */
  const [showPartial, setShowPartial] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const launch = (request: GenerateRequest) => {
    setShowPartial(false)
    setView('generation')
    void startGeneration(request)
  }

  const generateExpress = () =>
    launch({
      mode: 'express',
      description: draft.description.trim(),
      startDate: draft.startDate,
      durationDays: draft.durationDays,
    })

  const generateBrief = () =>
    launch({
      mode: 'brief',
      brief: { ...draft.brief, durationDays: draft.durationDays },
      startDate: draft.startDate,
    })

  const regenerate = () => {
    if (state.request) launch(state.request)
  }

  /**
   * Retour au formulaire d'où vient la demande, pour la reprendre. Le
   * résultat reste dans le magasin tant qu'aucune autre génération n'est
   * lancée : fermer puis rouvrir le générateur le retrouve.
   */
  const editRequest = () =>
    setView(state.request?.mode === 'brief' ? 'brief' : 'express')

  const save = async () => {
    const itinerary = state.itinerary
    if (!itinerary) return
    const days = toDayItineraries(itinerary)
    setSaving(true)
    setSaveError(null)
    try {
      await importSharedItinerary(days, {
        source: 'generator',
        title: itinerary.tripTitle,
      })
      trackEvent('trip_imported', {
        source: 'generator',
        days_count: days.length,
        activities_count: days.reduce(
          (sum, day) => sum + day.activities.length,
          0,
        ),
      })
      resetGeneration()
      replace({ kind: 'trip-ready' })
    } catch {
      setSaveError('L’enregistrement a échoué. Réessayez.')
      setSaving(false)
    }
  }

  if (view === 'generation' && state.status !== 'idle') {
    if (state.status === 'error' && state.error?.reason === 'not_configured') {
      return <GeneratorUnavailable onBack={editRequest} onClose={onClose} />
    }
    const showResult =
      state.itinerary &&
      (state.status === 'done' || (state.status === 'stopped' && showPartial))
    if (showResult && state.itinerary) {
      return (
        <GenerationResult
          state={state}
          itinerary={state.itinerary}
          onBack={
            state.status === 'stopped'
              ? () => setShowPartial(false)
              : editRequest
          }
          onRegenerate={regenerate}
          onSave={save}
          saving={saving}
          saveError={saveError}
        />
      )
    }
    return (
      <LiveGeneration
        state={state}
        onClose={onClose}
        onStop={stopGeneration}
        onSeeResult={() => setShowPartial(true)}
        onRetry={regenerate}
        onEdit={editRequest}
      />
    )
  }

  if (view === 'brief') {
    return (
      <BriefQuestionnaire
        onBack={() => setView('express')}
        onGenerate={generateBrief}
      />
    )
  }

  return (
    <ExpressForm
      onBack={onClose}
      onRefineWithQuestions={() => {
        // La phrase déjà écrite devient la destination du questionnaire :
        // le voyageur la précise plutôt que de tout réécrire.
        if (!draft.brief.destination.trim() && draft.description.trim()) {
          updateGeneratorDraft({
            brief: { ...draft.brief, destination: draft.description.trim() },
          })
        }
        setView('brief')
      }}
      onGenerate={generateExpress}
    />
  )
}
