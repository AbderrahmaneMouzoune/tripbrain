'use client'

import { forwardRef, useEffect, useRef } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import {
  dayOfMonth,
  dayTiming,
  longDate,
  weekdayShort,
} from '@/components/day/day-logic'
import { ActivityDots } from '@/components/day/day-overview'

/**
 * Bande des jours : cinq visibles autour de la journée choisie, les autres à
 * portée d'un défilement horizontal. La journée réelle d'aujourd'hui pulse
 * doucement ; la journée affichée est pleine.
 */
export const DayStrip = forwardRef<
  HTMLElement,
  {
    itinerary: DayItinerary[]
    selected: number
    onSelect: (index: number) => void
  }
>(function DayStrip({ itinerary, selected, onSelect }, ref) {
  const scroller = useRef<HTMLDivElement>(null)

  // Centre la journée choisie sans faire défiler la page.
  useEffect(() => {
    const container = scroller.current
    const item = container?.querySelector<HTMLElement>(
      `[data-index="${selected}"]`,
    )
    if (!container || !item) return
    const target =
      item.offsetLeft - container.clientWidth / 2 + item.offsetWidth / 2
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [selected])

  return (
    <nav aria-label="Jours" ref={ref} data-swipe-ignore className="mt-3.5">
      <div
        ref={scroller}
        className="flex snap-x gap-2 overflow-x-auto px-5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {itinerary.map((day, index) => {
          const isSelected = index === selected
          const isToday = dayTiming(day.date) === 'today'
          return (
            <button
              key={day.id}
              type="button"
              data-index={index}
              onClick={() => onSelect(index)}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${longDate(day.date)}, jour ${index + 1}, ${day.city}, ${day.activities.length} activité${day.activities.length > 1 ? 's' : ''}${isToday ? ", aujourd'hui" : ''}`}
              className={cn(
                'pressable flex h-[66px] shrink-0 basis-[calc((100%-2rem)/5)] snap-center flex-col items-center justify-center rounded-[14px] outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                isSelected
                  ? 'bg-ink text-ink-foreground'
                  : 'border-border bg-card text-muted-foreground border',
                isToday && 'animate-halo',
              )}
            >
              <span
                className={cn(
                  'text-[11px] font-extrabold',
                  isSelected && 'opacity-75',
                )}
              >
                {weekdayShort(day.date)}
              </span>
              <span
                className={cn(
                  'text-lg leading-tight font-black',
                  !isSelected && 'text-foreground',
                )}
              >
                {dayOfMonth(day.date)}
              </span>
              <ActivityDots
                count={day.activities.length}
                inverted={isSelected}
                className="mt-1 h-[10px]"
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
})
