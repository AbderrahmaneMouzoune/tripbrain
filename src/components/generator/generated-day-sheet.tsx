'use client'

import {
  IconChevronLeft,
  IconChevronRight,
  IconMapPin,
  IconWalk,
  IconX,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import {
  ACTIVITY_TYPE_LABELS,
  formatDuration,
  formatPrice,
  TRANSPORT_TYPE_LABELS,
} from '@/components/day/day-logic'
import { ActivityNumber, Pill } from '@/components/day/day-ui'
import { formatDayHeading } from '@/lib/generator/review'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'

/**
 * Détail d'une journée générée, en lecture seule : ce que le voyageur relit
 * avant d'enregistrer. L'édition reste dans l'app, une fois le voyage
 * enregistré ; ici, on parcourt les journées une à une.
 */
export function GeneratedDaySheet({
  days,
  index,
  onIndexChange,
  onClose,
}: {
  days: DayItinerary[]
  /** Journée affichée, ou `null` quand la feuille est fermée. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const day = index === null ? undefined : days[index]
  const open = day !== undefined && index !== null
  const position = index ?? 0
  const heading = day ? `Jour ${position + 1} · ${day.title}` : ''

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={heading}
      hideHeader
      footer={
        open && (
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              size="lg2"
              className="flex-1 border-[1.5px]"
              disabled={position === 0}
              haptic="selection"
              onClick={() => onIndexChange(position - 1)}
            >
              <IconChevronLeft aria-hidden />
              Jour {position}
            </Button>
            <Button
              variant="outline"
              size="lg2"
              className="flex-1 border-[1.5px]"
              disabled={position >= days.length - 1}
              haptic="selection"
              onClick={() => onIndexChange(position + 1)}
            >
              Jour {position + 2}
              <IconChevronRight aria-hidden />
            </Button>
          </div>
        )
      }
    >
      {day && <DayDetail day={day} heading={heading} onClose={onClose} />}
    </BottomSheet>
  )
}

function DayDetail({
  day,
  heading,
  onClose,
}: {
  day: DayItinerary
  heading: string
  onClose: () => void
}) {
  const subtitle = [formatDayHeading(day.date), day.city]
    .filter(Boolean)
    .join(' · ')
  const transport = day.transport
  const tips = day.tips ?? []
  const food = day.foodRecommendations ?? []

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-extrabold">
            {subtitle}
          </p>
          <h2 className="font-display mt-0.5 text-2xl leading-[1.2]">
            {heading}
          </h2>
        </div>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Fermer"
          onClick={onClose}
          className="bg-background border-border shrink-0 shadow-none"
        >
          <IconX />
        </Button>
      </div>

      {day.walkingDistance && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-bold">
          <IconWalk className="size-4" aria-hidden />
          {day.walkingDistance} à pied
        </p>
      )}

      {transport && (
        <section className="bg-accent-soft rounded-[18px] p-3.5">
          <p className="text-sm font-black">
            {TRANSPORT_TYPE_LABELS[transport.type]}
            {transport.from && transport.to
              ? ` · ${transport.from} → ${transport.to}`
              : ''}
          </p>
          <p className="text-muted-foreground text-[13px] font-bold">
            {[
              transport.departureTime && transport.arrivalTime
                ? `${transport.departureTime} – ${transport.arrivalTime}`
                : transport.departureTime,
              formatDuration(transport.duration),
              transport.details,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </section>
      )}

      {day.activities.length > 0 && (
        <section aria-label="Activités">
          <ol className="flex flex-col gap-3">
            {day.activities.map((activity, index) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                index={index}
              />
            ))}
          </ol>
        </section>
      )}

      {food.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[15px] font-black">À goûter</h3>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm">
            {food.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {tips.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[15px] font-black">Conseils</h3>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm">
            {tips.map((tip, index) => (
              <li key={`${tip}-${index}`}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {day.notes && (
        <p className="bg-muted text-foreground rounded-[14px] px-3.5 py-3 text-sm leading-relaxed select-text">
          {day.notes}
        </p>
      )}
    </div>
  )
}

function ActivityItem({
  activity,
  index,
}: {
  activity: Activity
  index: number
}) {
  const meta = [
    ACTIVITY_TYPE_LABELS[activity.type],
    formatDuration(activity.duration),
    activity.openAt,
    formatPrice(activity.price, activity.currency),
  ].filter(Boolean)

  return (
    <li className="flex gap-3">
      <ActivityNumber index={index} activity={activity} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[15px] leading-snug font-black select-text">
          {activity.name}
        </p>
        <p className="text-muted-foreground text-xs font-bold">
          {meta.join(' · ')}
        </p>
        {activity.description && (
          <p className="text-sm leading-snug">{activity.description}</p>
        )}
        {activity.address && (
          <p className="text-muted-foreground flex items-start gap-1 text-xs select-text">
            <IconMapPin className="mt-px size-3.5 shrink-0" aria-hidden />
            {activity.address}
          </p>
        )}
        {activity.tips && (
          <p className="text-muted-foreground text-xs leading-snug italic">
            {activity.tips}
          </p>
        )}
        {activity.reservationRequired && (
          <Pill tone="secondary" className="w-fit">
            Réservation conseillée
          </Pill>
        )}
      </div>
    </li>
  )
}
