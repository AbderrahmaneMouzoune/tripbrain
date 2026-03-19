'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  getDayStatus,
  type DayItinerary,
} from '@/lib/itinerary-data'
import { Train, Car, Plane, MapPin, Tent } from 'lucide-react'

interface TimelineProps {
  itinerary: DayItinerary[]
  selectedDay: number
  onSelectDay: (index: number) => void
}

function getCityIcon(city: string, transport?: DayItinerary['transport']) {
  if (transport?.type === 'train') return Train
  if (transport?.type === 'plane') return Plane
  if (transport?.type === 'car') return Car
  if (city.includes('Desert')) return Tent
  return MapPin
}

export function Timeline({ itinerary, selectedDay, onSelectDay }: TimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const dayRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const selectedElement = dayRefs.current[selectedDay]
    const container = scrollContainerRef.current

    if (selectedElement && container) {
      const containerRect = container.getBoundingClientRect()
      const elementRect = selectedElement.getBoundingClientRect()

      const elementCenter = elementRect.left + elementRect.width / 2
      const containerCenter = containerRect.left + containerRect.width / 2
      const scrollOffset = elementCenter - containerCenter

      container.scrollBy({
        left: scrollOffset,
        behavior: 'smooth',
      })
    }
  }, [selectedDay])

  return (
    <div
      ref={scrollContainerRef}
      className="w-full overflow-x-auto scroll-smooth pb-4"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="flex min-w-max items-center gap-0 px-4 py-5">
        {itinerary.map((day, index) => {
          const status = getDayStatus(day.date)
          const isSelected = selectedDay === index
          const Icon = getCityIcon(day.city, day.transport)

          return (
            <div key={day.date} className="flex items-center">
              {/* Day node */}
              <button
                ref={(el) => {
                  dayRefs.current[index] = el
                }}
                onClick={() => onSelectDay(index)}
                className={cn(
                  'group relative flex flex-col items-center transition-all duration-300',
                  'focus-visible:ring-primary rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                )}
              >
                {/* Dot */}
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all duration-300',
                    status === 'past' && 'bg-muted border-border',
                    status === 'current' &&
                      'bg-primary border-primary animate-pulse-dot',
                    status === 'future' && 'bg-card border-border',
                    isSelected &&
                      'ring-primary/40 scale-110 ring-2 ring-offset-2',
                    isSelected &&
                      status !== 'current' &&
                      'border-primary bg-primary/10',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      status === 'past' && 'text-muted-foreground',
                      status === 'current' && 'text-primary-foreground',
                      status === 'future' && 'text-muted-foreground',
                      isSelected && status !== 'current' && 'text-primary',
                    )}
                    strokeWidth={1.75}
                  />
                </div>

                {/* Day number badge */}
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                    isSelected
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {day.dayNumber}
                </span>

                {/* City label */}
                <span
                  className={cn(
                    'mt-2 max-w-16 truncate text-[11px] font-medium tracking-wide whitespace-nowrap transition-colors',
                    isSelected ? 'text-primary' : 'text-muted-foreground',
                    'group-hover:text-foreground',
                  )}
                >
                  {day.city}
                </span>

                {/* Date */}
                <span className="text-muted-foreground/60 text-[9px] tracking-wider uppercase">
                  {new Date(day.date).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </button>

              {/* Connector line */}
              {index < itinerary.length - 1 && (
                <div
                  className={cn(
                    'h-px w-6 transition-colors',
                    status === 'past' ? 'bg-border' : 'bg-border/50',
                    isSelected && 'bg-primary/30',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
