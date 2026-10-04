'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Hand,
  Hotel,
  MoreHorizontal,
  MoveHorizontal,
  Navigation,
  PartyPopper,
  Plus,
  Share,
  Ticket,
} from 'lucide-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { tripStatus } from '@/lib/trips'
import { cn } from '@/lib/utils'
import { useSwipe } from '@/hooks/use-swipe'
import { usePreferences } from '@/hooks/use-preferences'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { Button } from '@/components/ui/button'
import { QuickActionsTarget } from '@/components/quick-actions'
import { useDayEditor } from '@/components/day/use-day-editor'
import {
  ACTIVITY_TYPE_LABELS,
  dayEyebrow,
  directionsUrl,
  findNextActivity,
  formatDuration,
  splitPlace,
} from '@/components/day/day-logic'
import {
  ACTIVITY_ICONS,
  ActivityNumber,
  Pill,
  TRANSPORT_ICONS,
  trackDirections,
  useApplePlatform,
} from '@/components/day/day-ui'
import { DayStrip } from '@/components/today/day-strip'
import { BeforeTrip, AfterTrip } from '@/components/today/trip-bookends'
import {
  ContextualTip,
  canShowSpontaneousTip,
  noteSpontaneousTip,
  tipAvailable,
  type TipId,
} from '@/components/today/contextual-tip'

/** L'heure qui passe : la prochaine étape change quand un lieu ferme. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Onglet Aujourd'hui : avant le départ, pendant le voyage, ou après. */
export function TodayView(_props: {}) {
  const { itinerary } = useTrip()
  const now = useNow()
  if (itinerary.length === 0) return null
  const phase = tripStatus(itinerary, now)
  if (phase === 'upcoming') return <BeforeTrip now={now} />
  if (phase === 'past') return <AfterTrip />
  return <TodayDay now={now} />
}

/** Activité « prochaine étape » : le lien et l'adresse, à portée du pouce. */
function NextStepCard({
  day,
  dayIndex,
  now,
  onCopy,
}: {
  day: DayItinerary
  dayIndex: number
  now: Date
  onCopy: (text: string, confirmation: string) => void
}) {
  const { push } = useAppNav()
  const apple = useApplePlatform()
  const next = findNextActivity(day, now)

  if (!next) {
    const decided =
      day.activities.length > 0 &&
      day.activities.every((a) => (a.status ?? 'planned') !== 'planned')
    if (!decided) return null
    return (
      <section className="bg-success-soft text-success mx-5 mt-4 flex items-center gap-3 rounded-[22px] p-4">
        <PartyPopper className="size-6 shrink-0" aria-hidden />
        <p className="text-[15px] font-extrabold">
          Tout le programme de la journée est passé en revue.
        </p>
      </section>
    )
  }

  const { activity } = next
  const url = directionsUrl(activity, apple)
  const detail = [formatDuration(activity.duration), activity.address]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      aria-labelledby="next-step-title"
      className="bg-primary text-primary-foreground mx-5 mt-4 flex flex-col gap-1 rounded-[22px] p-4"
    >
      <p className="text-[11px] font-black tracking-[0.1em] opacity-80">
        PROCHAINE ÉTAPE
      </p>
      <button
        type="button"
        id="next-step-title"
        onClick={() =>
          push({ kind: 'activity', dayIndex, activityId: activity.id })
        }
        className="text-left text-[22px] leading-tight font-black outline-none focus-visible:underline"
      >
        {activity.name || 'Activité sans nom'}
      </button>
      {detail && (
        <p className="line-clamp-2 text-sm font-bold opacity-90">{detail}</p>
      )}
      {(url || activity.address) && (
        <div className="mt-2.5 flex gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackDirections('activity', 'today')}
              className="bg-card text-primary-strong pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-extrabold"
            >
              <Navigation className="size-[18px]" aria-hidden />Y aller
            </a>
          )}
          {activity.address && (
            <button
              type="button"
              onClick={() =>
                onCopy(activity.address ?? '', 'Adresse copiée')
              }
              className="border-primary-foreground/50 pressable h-11 flex-1 rounded-xl border-[1.5px] text-[15px] font-extrabold"
            >
              Copier l’adresse
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function TodayDay({ now }: { now: Date }) {
  const { itinerary } = useTrip()
  const { selectedDay, selectDay, dayDirection, push } = useAppNav()
  const { markTipSeen, update } = usePreferences()
  const index = Math.min(Math.max(selectedDay, 0), itinerary.length - 1)
  const editor = useDayEditor(index)
  const day = itinerary[index]
  const stay = editor.stay

  const stripRef = useRef<HTMLElement>(null)
  const activityRef = useRef<HTMLLIElement>(null)
  const transportRef = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState<TipId | null>(null)

  const goTo = useCallback(
    (target: number, method: 'swipe' | 'timeline') => {
      if (target < 0 || target >= itinerary.length) return
      selectDay(target, method)
    },
    [itinerary.length, selectDay],
  )

  const swipe = useSwipe({
    onSwipeLeft: () => {
      // Le geste est trouvé : l'astuce qui l'annonce devient inutile.
      markTipSeen('swipe-days')
      goTo(index + 1, 'swipe')
    },
    onSwipeRight: () => {
      markTipSeen('swipe-days')
      goTo(index - 1, 'swipe')
    },
  })

  const next = findNextActivity(day, now)
  const highlightIndex = next?.index ?? 0

  // Astuce 1 : l'appui long, dès qu'il y a des activités sous les yeux.
  // Astuce 3 : les documents, sur une journée de trajet, une fois la première
  // apprise. Jamais deux astuces spontanées dans la même visite.
  useEffect(() => {
    if (tip || !canShowSpontaneousTip()) return
    const timer = setTimeout(() => {
      if (!canShowSpontaneousTip()) return
      if (day.activities.length > 0 && tipAvailable('long-press')) {
        noteSpontaneousTip()
        setTip('long-press')
      } else if (
        day.transport &&
        !tipAvailable('long-press') &&
        tipAvailable('documents')
      ) {
        noteSpontaneousTip()
        setTip('documents')
      }
    }, 900)
    return () => clearTimeout(timer)
  }, [day.activities.length, day.transport, tip])

  const selectFromStrip = (target: number) => {
    goTo(target, 'timeline')
    // Astuce 2 : on change de jour en touchant la bande ; le balayage irait
    // plus vite. On le dit à ce moment-là, une fois l'astuce 1 apprise.
    if (!tip && !tipAvailable('long-press') && tipAvailable('swipe-days')) {
      setTimeout(() => setTip('swipe-days'), 450)
    }
  }

  const closeTip = (skipAll: boolean) => {
    if (!tip) return
    if (skipAll) update({ tipsDismissed: true })
    else markTipSeen(tip)
    setTip(null)
  }

  const slideClass =
    dayDirection === 'next'
      ? 'animate-[slide-in-from-right_0.3s_ease-out_backwards]'
      : dayDirection === 'previous'
        ? 'animate-[slide-in-from-left_0.3s_ease-out_backwards]'
        : 'animate-fade'

  const transport = day.transport
  const TransportIcon = transport ? TRANSPORT_ICONS[transport.type] : null

  return (
    <div
      className="mx-auto w-full max-w-xl pb-6"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <header className="flex items-start gap-3 px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
        <div className="min-w-0 flex-1">
          <p className="text-secondary-strong text-xs font-black tracking-[0.08em]">
            {dayEyebrow(day, index, itinerary.length)}
          </p>
          <h1 className="font-display mt-0.5 text-[32px] leading-[1.1]">
            {day.city}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-base font-extrabold">
            {day.title}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Partager le voyage"
          onClick={() => push({ kind: 'share' })}
          className="border-border bg-card shrink-0 shadow-none"
        >
          <Share />
        </Button>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Voyage et réglages"
          onClick={() => push({ kind: 'menu' })}
          className="border-border bg-card shrink-0 shadow-none"
        >
          <MoreHorizontal />
        </Button>
      </header>

      <DayStrip
        ref={stripRef}
        itinerary={itinerary}
        selected={index}
        onSelect={selectFromStrip}
      />

      <div key={day.id} className={slideClass}>
        <NextStepCard
          day={day}
          dayIndex={index}
          now={now}
          onCopy={(text, confirmation) =>
            void editor.copyText(text, confirmation)
          }
        />

        {transport && TransportIcon && (
          <button
            ref={transportRef}
            type="button"
            onClick={() => push({ kind: 'transport', dayIndex: index })}
            className="bg-card border-border pressable mx-5 mt-3 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[20px] border px-4 py-3.5 text-left"
          >
            <span
              aria-hidden
              className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
            >
              <TransportIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground block text-xs font-extrabold">
                TRAJET DU JOUR
                {transport.departureTime
                  ? ` · ${transport.departureTime}`
                  : ''}
              </span>
              <span className="block truncate text-[15px] font-extrabold">
                {[splitPlace(transport.from).name, splitPlace(transport.to).name]
                  .filter(Boolean)
                  .join(' → ') ||
                  transport.details ||
                  'Trajet'}
              </span>
            </span>
            <ChevronRight
              className="text-muted-foreground size-5 shrink-0"
              aria-hidden
            />
          </button>
        )}

        <div className="mx-5 mt-5 mb-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => push({ kind: 'day', dayIndex: index })}
            className="flex min-h-11 items-center gap-1 text-left"
          >
            <h2 className="text-[17px] font-black">Au programme</h2>
            <ChevronRight className="size-5" aria-hidden />
          </button>
          {day.walkingDistance && (
            <Pill>{day.walkingDistance} à pied</Pill>
          )}
        </div>

        {day.activities.length > 0 ? (
          <ol className="bg-card border-border mx-5 flex flex-col rounded-[20px] border p-1.5">
            {day.activities.map((activity, activityIndex) => {
              const status = activity.status ?? 'planned'
              const meta = activity.openAt
                ? [formatDuration(activity.duration), activity.openAt]
                : [
                    ACTIVITY_TYPE_LABELS[activity.type],
                    formatDuration(activity.duration),
                  ]
              if (status === 'done') meta.unshift('Fait')
              if (status === 'skipped') meta.unshift('Annulé')
              return (
                <QuickActionsTarget
                  key={activity.id}
                  asChild
                  entity="activity"
                  title={activity.name || 'Activité'}
                  description={[
                    ACTIVITY_TYPE_LABELS[activity.type],
                    formatDuration(activity.duration),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon={ACTIVITY_ICONS[activity.type]}
                  actions={editor.activityActions(activity, activityIndex)}
                >
                  <li
                    ref={
                      activityIndex === highlightIndex ? activityRef : undefined
                    }
                    className="rounded-[14px]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        push({
                          kind: 'activity',
                          dayIndex: index,
                          activityId: activity.id,
                        })
                      }
                      className="pressable flex min-h-14 w-full items-center gap-3 rounded-[14px] p-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <ActivityNumber
                        index={activityIndex}
                        activity={activity}
                        isNext={next?.index === activityIndex}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-[15px] font-extrabold',
                            status === 'skipped' &&
                              'text-muted-foreground line-through',
                          )}
                        >
                          {activity.name || 'Activité sans nom'}
                        </span>
                        <span className="text-muted-foreground block text-[13px]">
                          {meta.filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {activity.reservationRequired && (
                        <Pill tone="secondary" className="text-[11px]">
                          Réservation
                        </Pill>
                      )}
                    </button>
                  </li>
                </QuickActionsTarget>
              )
            })}
          </ol>
        ) : (
          <div className="border-border-strong text-muted-foreground mx-5 flex items-center gap-3 rounded-[20px] border-[1.5px] border-dashed px-4 py-3">
            <span className="flex-1 text-sm font-bold">
              Rien de prévu pour l’instant
            </span>
            <button
              type="button"
              onClick={editor.addActivity}
              className="text-primary flex min-h-11 items-center gap-1 text-sm font-extrabold"
            >
              <Plus className="size-4" aria-hidden />
              Ajouter
            </button>
          </div>
        )}

        {stay && (
          <button
            type="button"
            onClick={() => push({ kind: 'accommodation', dayIndex: index })}
            className="bg-card border-border pressable mx-5 mt-3 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[20px] border px-4 py-3.5 text-left"
          >
            <span
              aria-hidden
              className="bg-secondary-soft text-secondary-strong flex size-10 shrink-0 items-center justify-center rounded-xl"
            >
              <Hotel className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground block text-xs font-extrabold">
                CE SOIR
                {stay.night && stay.nights
                  ? ` · NUIT ${stay.night} SUR ${stay.nights}`
                  : ''}
              </span>
              <span className="block truncate text-[15px] font-extrabold">
                {stay.accommodation.name || 'Hébergement'}
              </span>
            </span>
            <ChevronRight
              className="text-muted-foreground size-5 shrink-0"
              aria-hidden
            />
          </button>
        )}

      </div>

      {editor.sheets}

      {tip === 'long-press' && (
        <ContextualTip
          id="long-press"
          target={activityRef}
          step={1}
          icon={Hand}
          title="Gardez le doigt appuyé"
          body="sur une activité pour la cocher, copier son adresse ou la chercher sur Google."
          onAcknowledge={() => closeTip(false)}
          onSkipAll={() => closeTip(true)}
        />
      )}
      {tip === 'swipe-days' && (
        <ContextualTip
          id="swipe-days"
          target={stripRef}
          step={2}
          icon={MoveHorizontal}
          title="Balayez pour changer de jour"
          body="Glissez le doigt vers la gauche ou la droite sur l’écran : la journée suivante ou précédente arrive aussitôt."
          onAcknowledge={() => closeTip(false)}
          onSkipAll={() => closeTip(true)}
        />
      )}
      {tip === 'documents' && transport && (
        <ContextualTip
          id="documents"
          target={transportRef}
          step={3}
          icon={Ticket}
          title="Vos billets, même hors ligne"
          body="Rangez le billet de ce trajet dans l’onglet Documents : il s’ouvrira d’un geste depuis la fiche du trajet."
          onAcknowledge={() => closeTip(false)}
          onSkipAll={() => closeTip(true)}
        />
      )}
    </div>
  )
}
