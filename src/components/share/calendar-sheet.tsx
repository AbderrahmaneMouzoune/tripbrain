'use client'

import { useMemo, useState } from 'react'
import {
  Bus,
  CalendarPlus,
  Car,
  FileText,
  Plane,
  TrainFront,
  X,
} from 'lucide-react'
import type { Transport } from '@/lib/itinerary-data'
import { useAppNav } from '@/components/app/navigation'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { SegmentedControl } from '@/components/mobile/segmented-control'
import { SectionTitle } from '@/components/mobile/section-title'
import { ToggleSwitch } from '@/components/mobile/toggle-switch'
import { Button } from '@/components/ui/button'
import { formatWeekdayShort, plural } from '@/components/trip-menu/trip-format'
import {
  countCalendarEvents,
  downloadICS,
  hasScheduledTransport,
  transportSummary,
  transportTimeRange,
} from '@/lib/calendar-export'
import { parseDayDate } from '@/lib/trips'
import { trackEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

/** Journées montrées dans l'aperçu : assez pour reconnaître le voyage. */
const PREVIEW_DAYS = 3

const longDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
})

type Scope = 'trip' | 'day'

const TRANSPORT_ICONS: Record<Transport['type'], typeof Plane> = {
  plane: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
}

/**
 * Ajouter au calendrier : tout le voyage ou une journée, en fichier .ics que
 * le téléphone ouvre dans son agenda. Les trajets horodatés peuvent s'ajouter
 * comme événements à part, aux heures prévues.
 */
export function CalendarSheet({ screen, onClose }: ScreenProps<'calendar'>) {
  const { itinerary } = useTrip()
  const { selectedDay } = useAppNav()

  const dayIndex = Math.min(
    Math.max(screen.dayIndex ?? selectedDay, 0),
    Math.max(itinerary.length - 1, 0),
  )
  const day = itinerary[dayIndex]
  const [scope, setScope] = useState<Scope>(
    screen.dayIndex !== undefined && day ? 'day' : 'trip',
  )

  const days = useMemo(
    () => (scope === 'day' && day ? [day] : itinerary),
    [scope, day, itinerary],
  )
  const scheduledTransports = days.filter(hasScheduledTransport).length
  const [includeTransports, setIncludeTransports] = useState(true)
  const withTransports = includeTransports && scheduledTransports > 0
  const eventCount = countCalendarEvents(days, {
    includeTransports: withTransports,
  })

  const filename =
    scope === 'day' && day
      ? `tripbrain-jour-${day.dayNumber}.ics`
      : 'tripbrain-voyage.ics'

  const handleExport = () => {
    trackEvent('calendar_exported', { scope })
    downloadICS(days, filename, { includeTransports: withTransports })
    onClose()
  }

  const preview = days.slice(0, PREVIEW_DAYS)
  const remaining = days.length - preview.length
  const lastDay = days[days.length - 1]

  return (
    <BottomSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="Ajouter au calendrier"
      hideHeader
      className="bg-background"
      footer={
        <>
          <Button
            size="xl"
            className="w-full"
            onClick={handleExport}
            disabled={days.length === 0}
          >
            <CalendarPlus aria-hidden />
            Ajouter {plural(eventCount, 'événement')}
          </Button>
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
            <FileText className="size-3.5" aria-hidden />
            <span>
              Fichier{' '}
              <span className="font-mono font-semibold">{filename}</span> pour
              Apple Calendrier, Google Agenda ou Outlook
            </span>
          </p>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <h2 className="font-display flex-1 text-[26px] leading-[1.15]">
          Ajouter au calendrier
        </h2>
        <Button
          variant="outline"
          size="icon-round"
          onClick={onClose}
          aria-label="Fermer"
          className="border-border bg-card shrink-0 shadow-none"
        >
          <X />
        </Button>
      </div>

      {day && itinerary.length > 1 && (
        <SegmentedControl
          label="Période"
          className="mt-3.5"
          value={scope}
          onChange={setScope}
          options={[
            {
              value: 'trip',
              label: `Tout le voyage (${plural(itinerary.length, 'jour')})`,
            },
            { value: 'day', label: `Jour ${day.dayNumber} seulement` },
          ]}
        />
      )}

      <SectionTitle className="mt-4 mb-2">
        Aperçu dans votre agenda
      </SectionTitle>
      <ol className="bg-card border-border rounded-[20px] border px-3.5 py-1">
        {preview.map((item, index) => {
          const time = item.transport
            ? transportTimeRange(item.transport)
            : null
          return (
            <li
              key={item.id}
              className={cn(
                'flex gap-3.5 py-2.5',
                index > 0 && 'border-border/70 border-t',
              )}
            >
              <span className="flex w-10 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'text-[11px] font-extrabold',
                    index === 0
                      ? 'text-secondary-strong'
                      : 'text-muted-foreground',
                  )}
                >
                  {formatWeekdayShort(item.date)}
                </span>
                <span className="text-xl leading-tight font-black">
                  {parseDayDate(item.date).getDate()}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="bg-primary-soft border-primary rounded-[10px] border-l-4 px-2.5 py-1.5">
                  <span className="block truncate text-sm font-extrabold">
                    Jour {item.dayNumber} – {item.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Toute la journée{item.city ? ` · ${item.city}` : ''}
                  </span>
                </span>
                {withTransports && item.transport && time && (
                  <span className="bg-secondary-soft border-secondary flex items-center gap-2 rounded-[10px] border-l-4 px-2.5 py-1.5">
                    <TransportIcon
                      type={item.transport.type}
                      className="text-secondary-strong size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">
                        {transportSummary(item.transport)}
                      </span>
                      <span className="text-secondary-strong block text-xs">
                        <span className="font-mono font-semibold">{time}</span>
                        {item.transport.bookingReference
                          ? ` · ${item.transport.bookingReference}`
                          : ''}
                      </span>
                    </span>
                  </span>
                )}
              </span>
            </li>
          )
        })}
        {remaining > 0 && lastDay && (
          <li className="border-border/70 text-muted-foreground border-t pt-2 pb-2.5 text-center text-[13px] font-extrabold">
            + {plural(remaining, 'autre journée', 'autres journées')}, jusqu’au{' '}
            {longDate.format(parseDayDate(lastDay.date))}
          </li>
        )}
      </ol>

      {scheduledTransports > 0 && (
        <div className="bg-card border-border mt-3 flex items-center gap-3 rounded-[18px] border px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span
              id="calendar-transports-label"
              className="block text-[15px] font-extrabold"
            >
              Inclure les trajets avec leurs horaires
            </span>
            <span className="text-muted-foreground block text-xs">
              {plural(scheduledTransports, 'trajet')}, dans la journée
              correspondante
            </span>
          </span>
          <ToggleSwitch
            checked={includeTransports}
            onCheckedChange={setIncludeTransports}
            labelledBy="calendar-transports-label"
          />
        </div>
      )}
    </BottomSheet>
  )
}

function TransportIcon({
  type,
  className,
}: {
  type: Transport['type']
  className?: string
}) {
  const Icon = TRANSPORT_ICONS[type] ?? Plane
  return <Icon className={className} aria-hidden />
}
