'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check, TriangleAlert } from 'lucide-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { useTrip } from '@/components/app/trip-provider'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { Button } from '@/components/ui/button'
import { swapDayPlans, swapLeavesBookingsBehind } from '@/lib/itinerary-edit'
import { trackEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'
import { dayOfMonth, shortDate, weekdayShort } from '@/components/day/day-logic'

/** Au-delà, les points deviennent illisibles : on écrit le nombre. */
const MAX_DOTS = 5

/**
 * Jauge du nombre d'activités : un point par activité, plafonnée. Elle se lit
 * d'un coup d'œil pour repérer la journée chargée et la journée légère.
 */
export function ActivityDots({
  count,
  inverted,
  className,
}: {
  count: number
  inverted?: boolean
  className?: string
}) {
  if (count === 0) {
    return (
      <span
        className={cn(
          'text-[11px] font-extrabold',
          inverted ? 'text-ink-foreground/70' : 'text-muted-foreground',
          className,
        )}
      >
        Libre
      </span>
    )
  }
  return (
    <span className={cn('flex items-center gap-[3px]', className)} aria-hidden>
      {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, index) => (
        <span
          key={index}
          className={cn(
            'size-[5px] rounded-full',
            inverted ? 'bg-secondary' : 'bg-primary',
          )}
        />
      ))}
      {count > MAX_DOTS && (
        <span
          className={cn(
            'ml-0.5 text-[10px] leading-none font-black',
            inverted ? 'text-ink-foreground' : 'text-primary-strong',
          )}
        >
          +{count - MAX_DOTS}
        </span>
      )}
    </span>
  )
}

function activityLabel(count: number): string {
  if (count === 0) return 'aucune activité'
  return `${count} activité${count > 1 ? 's' : ''}`
}

/**
 * Les journées du voyage d'un coup d'œil, depuis le roadbook : ville et
 * charge de chaque jour, pour sauter de l'un à l'autre ou décider d'en
 * échanger deux.
 */
export function DayOverviewStrip({
  itinerary,
  current,
  onSelect,
  onSwap,
}: {
  itinerary: DayItinerary[]
  current: number
  onSelect: (index: number) => void
  onSwap: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)

  // Garde la journée affichée en tête de bande, la suite à sa droite.
  useEffect(() => {
    const container = scroller.current
    const item = container?.querySelector<HTMLElement>(
      `[data-index="${current}"]`,
    )
    if (!container || !item) return
    // Position relative à la bande (offsetLeft dépend du parent positionné).
    const offset =
      item.getBoundingClientRect().left -
      container.getBoundingClientRect().left +
      container.scrollLeft
    container.scrollTo({ left: Math.max(0, offset - 20), behavior: 'smooth' })
  }, [current])

  return (
    <section aria-labelledby="day-overview-title" className="mt-5">
      <div className="flex items-center justify-between px-5">
        <h2
          id="day-overview-title"
          className="text-muted-foreground text-xs font-black tracking-[0.08em] uppercase"
        >
          Les jours du voyage
        </h2>
        <button
          type="button"
          onClick={onSwap}
          className="pressable text-primary-strong focus-visible:ring-ring/50 -mr-2 flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[13px] font-extrabold outline-none focus-visible:ring-[3px]"
        >
          <ArrowLeftRight className="size-4" aria-hidden />
          Échanger ce jour
        </button>
      </div>
      <div
        ref={scroller}
        data-swipe-ignore
        className="flex snap-x scroll-pl-5 gap-2 overflow-x-auto px-5 pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {itinerary.map((day, index) => {
          const isCurrent = index === current
          const isPast = index < current
          const count = day.activities.length
          return (
            <button
              key={day.id}
              type="button"
              data-index={index}
              onClick={() => onSelect(index)}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={`Jour ${index + 1}, ${shortDate(day.date)}, ${day.city}, ${activityLabel(count)}`}
              className={cn(
                'pressable focus-visible:ring-ring/50 flex w-[104px] shrink-0 snap-start flex-col items-start gap-1 rounded-2xl px-3 py-2.5 text-left outline-none focus-visible:ring-[3px]',
                isCurrent
                  ? 'bg-ink text-ink-foreground'
                  : 'bg-card border-border border',
                isPast && !isCurrent && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'text-[11px] font-extrabold uppercase',
                  isCurrent
                    ? 'text-ink-foreground/75'
                    : 'text-muted-foreground',
                )}
              >
                {weekdayShort(day.date)} {dayOfMonth(day.date)} · J{index + 1}
              </span>
              <span className="w-full truncate text-sm leading-tight font-black">
                {day.city}
              </span>
              <ActivityDots count={count} inverted={isCurrent} />
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Échanger le programme de la journée affichée avec une autre. Les dates,
 * trajets et hébergements restent au calendrier ; un avertissement prévient
 * quand une réservation ne suivra pas un changement de ville.
 */
export function SwapDaySheet({
  open,
  onOpenChange,
  dayIndex,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayIndex: number
}) {
  const { itinerary, replaceItinerary } = useTrip()
  const [target, setTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const current = itinerary[dayIndex]

  useEffect(() => {
    if (!open) setTarget(null)
  }, [open])

  if (!current) return null

  const warns =
    target !== null && swapLeavesBookingsBehind(itinerary, dayIndex, target)

  const confirm = async () => {
    if (target === null) return
    setBusy(true)
    try {
      await replaceItinerary(swapDayPlans(itinerary, dayIndex, target))
      trackEvent('days_swapped', {
        same_city: itinerary[target]?.city === current.city,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Échange des journées impossible', error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Échanger ce jour avec…"
      description={`Le programme du ${shortDate(current.date)} (${current.city}) prendra la place de celui choisi, et inversement. Les dates, trajets et hébergements restent où ils sont.`}
      footer={
        <div className="flex flex-col gap-2">
          {warns && (
            <p
              role="status"
              className="bg-secondary-soft text-secondary-strong flex gap-2 rounded-2xl p-3 text-[13px] leading-snug font-bold"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Les villes diffèrent : le trajet ou l’hébergement réservé ces
              jours-là ne suit pas l’échange. Pensez à le vérifier.
            </p>
          )}
          <Button
            size="xl"
            className="w-full"
            disabled={target === null || busy}
            onClick={() => void confirm()}
          >
            <ArrowLeftRight />
            {target === null
              ? 'Choisissez une journée'
              : `Échanger avec le ${shortDate(itinerary[target].date)}`}
          </Button>
        </div>
      }
    >
      <ul
        role="radiogroup"
        aria-label="Journée à échanger"
        className="flex flex-col gap-2"
      >
        {itinerary.map((day, index) => {
          if (index === dayIndex) return null
          const selected = index === target
          const sameCity = day.city === current.city
          return (
            <li key={day.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTarget(index)}
                className={cn(
                  'pressable bg-card focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-2xl p-3 text-left outline-none focus-visible:ring-[3px]',
                  selected
                    ? 'border-primary border-2 p-[11px]'
                    : 'border-border border',
                )}
              >
                <span className="bg-muted flex size-11 shrink-0 flex-col items-center justify-center rounded-xl">
                  <span className="text-muted-foreground text-[10px] font-extrabold uppercase">
                    {weekdayShort(day.date)}
                  </span>
                  <span className="text-base leading-tight font-black">
                    {dayOfMonth(day.date)}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-black">
                      {day.city}
                    </span>
                    {sameCity && (
                      <span className="bg-success-soft text-success shrink-0 rounded-full px-2 py-px text-[11px] font-extrabold">
                        Même ville
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground truncate text-[13px]">
                    {day.title}
                  </span>
                  <ActivityDots count={day.activities.length} />
                </span>
                {selected && (
                  <Check className="text-primary size-5 shrink-0" aria-hidden />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </BottomSheet>
  )
}
