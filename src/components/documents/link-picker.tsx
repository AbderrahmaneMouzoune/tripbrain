'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import {
  BedDouble,
  Bus,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  Luggage,
  Plane,
  TrainFront,
} from 'lucide-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  normalizeLink,
  sameLink,
  transportLabel,
  type DocumentLink,
} from '@/lib/document-organize'
import { parseDayDate } from '@/lib/trips'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { cn } from '@/lib/utils'

const dayDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** « mer. 13 mai » */
export function formatDayDate(iso: string): string {
  return dayDate.format(parseDayDate(iso))
}

const TRANSPORT_ICONS: Record<
  NonNullable<DayItinerary['transport']>['type'],
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  plane: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
}

export interface LinkOption {
  key: string
  link: DocumentLink
  icon: ComponentType<SVGProps<SVGSVGElement>>
  tone: BadgeTone
  title: string
  subtitle: string
}

/** Tout ce à quoi un document peut être rattaché, dans l'ordre du voyage. */
export function linkOptions(itinerary: DayItinerary[]): LinkOption[] {
  const options: LinkOption[] = [
    {
      key: 'trip',
      link: {},
      icon: Luggage,
      tone: 'muted',
      title: 'Tout le voyage',
      subtitle: 'Passeport, visa, assurance…',
    },
  ]
  itinerary.forEach((day, index) => {
    const label = `Jour ${index + 1}`
    const date = day.date ? formatDayDate(day.date) : ''
    if (day.transport) {
      const transport = day.transport
      const time = transport.departureTime
        ? ` · ${transport.departureTime}`
        : ''
      options.push({
        key: `${day.id}-transport`,
        link: { dayId: day.id, linkedTo: 'transport' },
        icon: TRANSPORT_ICONS[transport.type] ?? Plane,
        tone: 'primary',
        title: `${label} · ${transportLabel(transport)}`,
        subtitle: `${date}${time}`,
      })
    }
    if (day.accommodation) {
      options.push({
        key: `${day.id}-accommodation`,
        link: { dayId: day.id, linkedTo: 'accommodation' },
        icon: BedDouble,
        tone: 'secondary',
        title: `${label} · ${day.accommodation.name}`,
        subtitle: `${date} · hébergement`,
      })
    }
    options.push({
      key: `${day.id}-day`,
      link: { dayId: day.id },
      icon: CalendarDays,
      tone: 'accent',
      title: `${label} · ${day.title || day.city}`,
      subtitle: [date, day.city].filter(Boolean).join(' · '),
    })
  })
  return options
}

/** Option correspondant à un rattachement (journée seule à défaut). */
export function findLinkOption(
  options: LinkOption[],
  link: DocumentLink,
  itinerary: DayItinerary[],
): LinkOption {
  const normalized = normalizeLink(link, itinerary)
  return (
    options.find((option) => sameLink(option.link, normalized)) ?? options[0]
  )
}

/**
 * Choix du rattachement : le choix en cours dans un grand bouton, qui déplie
 * la liste de toutes les journées, trajets et hébergements du voyage.
 */
export function LinkPicker({
  itinerary,
  value,
  onChange,
  defaultOpen = false,
}: {
  itinerary: DayItinerary[]
  value: DocumentLink
  onChange: (link: DocumentLink) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()
  const options = useMemo(() => linkOptions(itinerary), [itinerary])
  const selected = findLinkOption(options, value, itinerary)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // À l'ouverture, la liste se place sur le choix en cours.
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className="pressable border-primary bg-card focus-visible:ring-ring/50 flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 py-2 pr-3.5 pl-2 text-left outline-none focus-visible:ring-[3px]"
      >
        <IconBadge icon={selected.icon} tone={selected.tone} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-extrabold">
            {selected.title}
          </span>
          <span className="text-muted-foreground truncate text-xs font-bold">
            {selected.subtitle}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted-foreground size-5 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div
          id={listId}
          role="radiogroup"
          aria-label="Associer le document à"
          className="bg-card border-border animate-fade max-h-72 overflow-y-auto overscroll-contain rounded-2xl border p-1"
        >
          {options.map((option) => {
            const active = option.key === selected.key
            return (
              <button
                key={option.key}
                ref={active ? selectedRef : undefined}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.link)
                  setOpen(false)
                }}
                className={cn(
                  'focus-visible:ring-ring/50 flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]',
                  active && 'bg-primary-soft',
                )}
              >
                <IconBadge icon={option.icon} tone={option.tone} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-extrabold">
                    {option.title}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {option.subtitle}
                  </span>
                </span>
                {active && (
                  <Check aria-hidden className="text-primary size-4 shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
