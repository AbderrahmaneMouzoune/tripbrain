'use client'

import { useState } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { useTrip } from '@/components/app/trip-provider'
import { TripJourney } from '@/components/generator/journey/trip-journey'
import { Button } from '@/components/ui/button'
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
import { buildBriefPrompt } from '@/lib/generator/itinerary-prompt'
import {
  isPastDate,
  isValidIsoDate,
  todayIso,
} from '@/lib/generator/itinerary-quality'
import { toDayItineraries } from '@/lib/generator/itinerary-schema'
import {
  MAX_DURATION_DAYS,
  type GenerateRequest,
} from '@/lib/generator/requests'
import type { TripBrief } from '@/lib/generator/trip-brief'

/**
 * Où en est le parcours, côté écran. La génération, elle, vit dans le
 * magasin. `recap` rouvre le parcours sur le billet, pour corriger une
 * demande déjà envoyée.
 */
type View = 'journey' | 'recap' | 'generation'

/**
 * Rouvrir le générateur ramène là où l'on en était : la génération en cours
 * ou son résultat, sinon le parcours.
 */
function initialView(state: GenerationState): View {
  return state.status === 'idle' ? 'journey' : 'generation'
}

/** La date choisie est-elle exploitable : lisible, et pas dans le passé ? */
function isUsableStartDate(value: string): boolean {
  return isValidIsoDate(value) && !isPastDate(value)
}

/**
 * Générateur d'itinéraire dans l'app : décrire (le parcours, question par
 * question, ou une phrase), suivre la génération en direct, relire, affiner,
 * puis enregistrer le voyage.
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
  const [copied, setCopied] = useState(false)

  /** Le brief porte sa durée ; le brouillon la garde à part, pour la génération. */
  const brief: TripBrief = { ...draft.brief, durationDays: draft.durationDays }

  const launch = (request: GenerateRequest) => {
    setShowPartial(false)
    setView('generation')
    void startGeneration(request)
  }

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
  const editRequest = () => setView('recap')

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
      return (
        <GeneratorUnavailable
          request={state.request}
          onBack={editRequest}
          onClose={onClose}
        />
      )
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

  const prompt = buildBriefPrompt(brief, draft.startDate)
  const copyPrompt = () => {
    navigator.clipboard
      ?.writeText(prompt)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  const dateOk = isUsableStartDate(draft.startDate)

  return (
    <TripJourney
      key={view}
      variant="screen"
      startOn={view === 'recap' ? 'recap' : 'question'}
      brief={brief}
      onBriefChange={(next) =>
        updateGeneratorDraft({ brief: next, durationDays: next.durationDays })
      }
      startDate={draft.startDate}
      onStartDateChange={(startDate) => updateGeneratorDraft({ startDate })}
      minDate={todayIso()}
      maxDays={MAX_DURATION_DAYS}
      prompt={prompt}
      copied={copied}
      onCopyPrompt={copyPrompt}
      onExit={onClose}
      renderFinish={(ready) => (
        <div className="flex flex-col gap-2">
          {ready && !dateOk && (
            <p className="bg-destructive-soft text-destructive rounded-2xl px-3.5 py-3 text-sm font-extrabold">
              Cette date de départ est déjà passée : choisissez un jour à venir.
            </p>
          )}
          <Button
            size="xl"
            className="w-full"
            disabled={!ready || !dateOk}
            onClick={generateBrief}
          >
            <IconSparkles aria-hidden />
            Générer mon itinéraire
          </Button>
          <p className="text-muted-foreground text-center text-[13px] font-bold">
            Les questions passées ne figurent pas dans la demande : l’IA choisit
            pour vous.
          </p>
        </div>
      )}
    />
  )
}
