'use client'

import { useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconChecks,
  IconChevronDown,
  IconCircleCheck,
  IconInfoCircle,
  IconRefresh,
  IconWand,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { RefineSheet } from '@/components/generator/refine-sheet'
import type { GenerationState } from '@/lib/generator/generation-store'
import { analyzeItinerary } from '@/lib/generator/itinerary-quality'
import {
  toDayItineraries,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import {
  confidenceBars,
  dayOfMonth,
  dayRangeLabel,
  formatTripRange,
  groupByCity,
  reviewPoints,
  type ReviewPoint,
} from '@/lib/generator/review'
import {
  BUDGETS,
  PACES,
  TRAVELER_GROUPS,
  labelOf,
} from '@/lib/generator/trip-brief'
import { tripCities } from '@/lib/trips'
import { cn } from '@/lib/utils'

/** Couleur du point de chaque étape, dans l'ordre du voyage. */
const STOP_DOTS = [
  'bg-primary',
  'bg-accent',
  'bg-secondary',
  'bg-success',
  'bg-ink',
]

/**
 * « Votre itinéraire est prêt » : en-tête, points à vérifier tirés du rapport
 * de qualité, puis les journées regroupées par ville. Deux sorties : affiner
 * par une demande en langage naturel, ou enregistrer le voyage.
 */
export function GenerationResult({
  state,
  itinerary,
  onBack,
  onRegenerate,
  onSave,
  saving,
  saveError,
}: {
  state: GenerationState
  itinerary: GeneratedItinerary
  onBack: () => void
  onRegenerate: () => void
  onSave: () => void
  saving: boolean
  saveError: string | null
}) {
  const [refineOpen, setRefineOpen] = useState(false)
  const days = useMemo(() => toDayItineraries(itinerary), [itinerary])
  const report = useMemo(() => analyzeItinerary(days), [days])
  const points = useMemo(
    () =>
      reviewPoints(report, days, {
        truncated: state.truncated,
        droppedDays: state.droppedDays,
        expectedDays: state.expectedDays,
      }),
    [report, days, state.truncated, state.droppedDays, state.expectedDays],
  )
  const stops = groupByCity(days)
  const startDate = days[0]?.date ?? state.request?.startDate ?? ''
  const cityCount = tripCities(days).length
  const activityCount = report.stats.activities
  const flaggedDays = new Set(
    report.issues
      .filter((issue) => issue.blocking && issue.dayNumber !== undefined)
      .map((issue) => issue.dayNumber),
  )

  const request = state.request
  const chips: string[] = []
  if (request?.mode === 'brief') {
    const { brief } = request
    const group = labelOf(TRAVELER_GROUPS, brief.group)
    const pace = labelOf(PACES, brief.pace)
    const budget = labelOf(BUDGETS, brief.budget)
    if (group) chips.push(group)
    if (pace) chips.push(`Rythme ${pace.toLowerCase()}`)
    if (budget) chips.push(budget)
  }
  const transfers = days.filter((day) => day.transport).length
  if (transfers > 0) {
    chips.push(`${transfers} trajet${transfers > 1 ? 's' : ''} entre villes`)
  }

  return (
    <MobileScreen
      onBack={onBack}
      backLabel="Retour à la génération"
      progress={{ step: 3, total: 4 }}
      footer={
        <>
          {saveError && (
            <p
              role="alert"
              className="text-destructive text-center text-sm font-bold"
            >
              {saveError}
            </p>
          )}
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              size="xl"
              className="w-[124px] shrink-0 border-[1.5px]"
              onClick={() => setRefineOpen(true)}
            >
              <IconWand aria-hidden />
              Affiner
            </Button>
            <Button
              size="xl"
              className="flex-1"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le voyage'}
            </Button>
          </div>
        </>
      }
    >
      <header className="flex flex-col gap-1.5">
        <p className="text-secondary-strong text-xs font-black tracking-[0.08em] uppercase">
          {state.status === 'stopped'
            ? 'Itinéraire partiel'
            : 'Votre itinéraire est prêt'}
        </p>
        <h1 className="font-display text-[32px] leading-[1.1]">
          {itinerary.tripTitle.trim() || 'Voyage sans titre'}
        </h1>
        <p className="text-muted-foreground text-[15px] font-extrabold">
          {[
            formatTripRange(startDate, days.length),
            `${days.length} jour${days.length > 1 ? 's' : ''}`,
            `${cityCount} ville${cityCount > 1 ? 's' : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="bg-primary-soft text-primary-strong rounded-full px-2.5 py-1 text-xs font-extrabold"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {itinerary.summary && (
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {itinerary.summary}
          </p>
        )}
      </header>

      <QualityCard
        points={points}
        confidence={report.confidence}
        startDate={startDate}
      />

      <div className="mt-[22px] mb-2.5 flex items-center justify-between">
        <h2 className="text-[17px] font-black">Jour par jour</h2>
        <span className="text-muted-foreground text-xs font-extrabold">
          {days.length} jour{days.length > 1 ? 's' : ''} · {activityCount}{' '}
          activité{activityCount > 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {stops.map((stop, stopIndex) => (
          <section
            key={`${stop.city}-${stop.dayIndexes[0]}`}
            aria-label={stop.city}
            className="bg-card border-border overflow-hidden rounded-[20px] border"
          >
            <div className="border-border/60 flex items-center gap-2.5 border-b px-3.5 py-3">
              <span
                aria-hidden
                className={cn(
                  'size-2.5 rounded-full',
                  STOP_DOTS[stopIndex % STOP_DOTS.length],
                )}
              />
              <span className="flex-1 text-base font-black">{stop.city}</span>
              <span className="text-muted-foreground text-xs font-extrabold">
                {dayRangeLabel(stop.dayIndexes)} · {stop.dayIndexes.length} jour
                {stop.dayIndexes.length > 1 ? 's' : ''}
              </span>
            </div>
            <ol className="divide-border/60 divide-y py-1">
              {stop.dayIndexes.map((index) => {
                const day = days[index]
                const flagged = flaggedDays.has(index + 1)
                return (
                  <li
                    key={day.id}
                    className="flex min-h-11 items-center gap-3 px-3.5"
                  >
                    <span className="text-muted-foreground w-[52px] shrink-0 font-mono text-xs font-semibold">
                      J{index + 1} · {dayOfMonth(day.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
                      {day.title}
                    </span>
                    {flagged ? (
                      <span className="bg-secondary-soft text-secondary-strong rounded-full px-2 py-0.5 text-[11px] font-extrabold">
                        À vérifier
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {day.activities.length} act.
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>

      <div className="flex justify-center pt-2.5">
        <button
          type="button"
          onClick={onRegenerate}
          className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm font-extrabold"
        >
          <IconRefresh className="size-[18px]" aria-hidden />
          Tout régénérer
        </button>
      </div>

      <RefineSheet
        open={refineOpen}
        onOpenChange={setRefineOpen}
        itinerary={itinerary}
        startDate={startDate}
      />
    </MobileScreen>
  )
}

function QualityCard({
  points,
  confidence,
  startDate,
}: {
  points: ReviewPoint[]
  confidence: number
  startDate: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const bars = confidenceBars(confidence)

  if (points.length === 0) {
    return (
      <section className="bg-success-soft text-success mt-[18px] flex items-center gap-3 rounded-[22px] p-4">
        <IconCircleCheck className="size-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black">Aucun point à vérifier</h2>
          <p className="text-[13px] font-bold">
            Dates, villes, activités et coordonnées sont renseignées.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="generator-quality-title"
      className="bg-secondary-soft border-secondary/40 mt-[18px] flex flex-col gap-3 rounded-[22px] border p-4"
    >
      <div className="flex items-center gap-3">
        <span className="bg-secondary text-secondary-foreground flex size-11 shrink-0 items-center justify-center rounded-[14px]">
          <IconAlertTriangle className="size-[22px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-secondary-strong text-[11px] font-black tracking-[0.08em] uppercase">
            Indicateur de confiance
          </p>
          <h2
            id="generator-quality-title"
            className="text-secondary-strong text-lg font-black"
          >
            {points.length} point{points.length > 1 ? 's' : ''} à vérifier
          </h2>
        </div>
        <span
          role="img"
          aria-label={`Confiance ${bars} sur 5`}
          className="flex gap-[3px]"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-[18px] w-1.5 rounded-[3px]',
                index < bars ? 'bg-secondary' : 'bg-secondary/30',
              )}
            />
          ))}
        </span>
      </div>

      {points.map((point) => {
        const expanded = open === point.id
        const detailId = `generator-point-${point.id}`
        return (
          <div
            key={point.id}
            className="bg-card overflow-hidden rounded-[14px]"
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setOpen(expanded ? null : point.id)}
              className="pressable focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 p-3 text-left outline-none focus-visible:ring-[3px]"
            >
              <span className="bg-secondary-soft text-secondary-strong flex size-8 shrink-0 items-center justify-center rounded-[10px]">
                <IconInfoCircle className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm leading-snug">
                <span className="font-black">{point.heading}</span>{' '}
                {point.summary}
              </span>
              <IconChevronDown
                aria-hidden
                className={cn(
                  'text-secondary-strong size-5 shrink-0 transition-transform',
                  expanded && 'rotate-180',
                )}
              />
            </button>
            {expanded && (
              <ul
                id={detailId}
                className="text-muted-foreground animate-fade flex flex-col gap-1 px-3 pb-3 pl-14 text-[13px] leading-snug"
              >
                {point.details.slice(0, 12).map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
                {point.details.length > 12 && (
                  <li>et {point.details.length - 12} autres.</li>
                )}
              </ul>
            )}
          </div>
        )
      })}

      {startDate && (
        <p className="text-secondary-strong flex items-center gap-1.5 text-xs font-bold">
          <IconChecks className="size-4 shrink-0" aria-hidden />
          Dates consécutives à partir du départ choisi
        </p>
      )}
    </section>
  )
}
