'use client'

import type { ReactNode } from 'react'
import {
  CalendarCheck,
  Car,
  ChevronRight,
  Hotel,
  Lightbulb,
  Navigation,
  Plus,
  Star,
} from 'lucide-react'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'
import { nextActivityStatus } from '@/lib/itinerary-edit'
import { cn } from '@/lib/utils'
import { useAppNav } from '@/components/app/navigation'
import { QuickActionsTarget } from '@/components/quick-actions'
import type { DayEditor } from '@/components/day/use-day-editor'
import {
  ACTIVITY_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  directionsUrl,
  formatDuration,
  formatPrice,
  parseFood,
  splitPlace,
  transportNumber,
  TRANSPORT_TYPE_LABELS,
} from '@/components/day/day-logic'
import {
  ACTIVITY_ICONS,
  ACTIVITY_STATUS_LABELS,
  ActivityNumber,
  Pill,
  TRANSPORT_ICONS,
  trackDirections,
  useApplePlatform,
} from '@/components/day/day-ui'

/** Titre de section du roadbook. */
export function SectionHeading({
  children,
  aside,
}: {
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-[17px] leading-[22px] font-black">{children}</h2>
      {aside}
    </div>
  )
}

/** Bouton en pointillés : ce qui manque, et de quoi l'ajouter. */
export function DashedAdd({
  icon: Icon = Plus,
  empty,
  label,
  onClick,
  className,
}: {
  icon?: typeof Plus
  empty?: string
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-border-strong text-muted-foreground pressable flex min-h-[52px] w-full items-center gap-3 rounded-[20px] border-[1.5px] border-dashed px-4 text-left',
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <Icon className="size-4" />
      </span>
      {empty && <span className="flex-1 text-sm font-bold">{empty}</span>}
      <span
        className={cn(
          'text-primary text-sm font-extrabold',
          !empty && 'flex-1',
        )}
      >
        {label}
      </span>
    </button>
  )
}

function shortAddress(address: string | undefined): string | undefined {
  if (!address) return undefined
  return address.split(',').slice(0, 2).join(',').trim()
}

/** Carte riche d'une activité : de quoi décider sans ouvrir la fiche. */
export function ActivityCard({
  activity,
  index,
  dayIndex,
  isNext,
  editor,
}: {
  activity: Activity
  index: number
  dayIndex: number
  isNext: boolean
  editor: DayEditor
}) {
  const { push } = useAppNav()
  const status = activity.status ?? 'planned'
  const next = nextActivityStatus(status)
  const name = activity.name || 'Activité sans nom'

  const meta = [
    ACTIVITY_TYPE_LABELS[activity.type],
    formatDuration(activity.duration),
    activity.openAt,
    formatPrice(activity.price, activity.currency),
  ].filter(Boolean)
  if (meta.length <= 2 && activity.address) meta.push(shortAddress(activity.address))

  const firstTag = activity.tags?.[0]

  return (
    <QuickActionsTarget
      asChild
      entity="activity"
      title={name}
      description={[
        ACTIVITY_TYPE_LABELS[activity.type],
        formatDuration(activity.duration),
      ]
        .filter(Boolean)
        .join(' · ')}
      icon={ACTIVITY_ICONS[activity.type]}
      actions={editor.activityActions(activity, index)}
    >
      <li className="bg-card border-border relative flex gap-3 rounded-[20px] border p-3.5">
        <ActivityNumber index={index} activity={activity} isNext={isNext} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                push({ kind: 'activity', dayIndex, activityId: activity.id })
              }
              className={cn(
                'flex-1 text-left text-base leading-[22px] font-black outline-none',
                // Toute la carte ouvre la fiche ; le statut reste un bouton à part.
                'after:absolute after:inset-0 after:rounded-[20px] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50',
                status === 'skipped' && 'text-muted-foreground line-through',
              )}
            >
              {name}
            </button>
            {activity.rating !== undefined && (
              <span className="text-secondary-strong flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold">
                <Star className="size-3.5 fill-current" aria-hidden />
                <span className="sr-only">Note </span>
                {activity.rating}
              </span>
            )}
          </div>
          {meta.length > 0 && (
            <p className="text-muted-foreground text-[13px] leading-[18px]">
              {meta.join(' · ')}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activity.reservationRequired === true && (
              <Pill tone="secondary">
                <CalendarCheck className="size-3.5" aria-hidden />
                Réservation requise
              </Pill>
            )}
            {activity.reservationRequired === false && (
              <Pill tone="success">Sans réservation</Pill>
            )}
            {firstTag && <Pill tone="accent">{firstTag}</Pill>}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => editor.setStatus(activity.id, next)}
              aria-label={`Statut : ${ACTIVITY_STATUS_LABELS[status]}. Toucher pour marquer « ${ACTIVITY_STATUS_LABELS[next]} »`}
              className={cn(
                'pressable relative z-10 inline-flex min-h-8 items-center rounded-full px-3 text-xs font-extrabold',
                status === 'done'
                  ? 'bg-success-soft text-success'
                  : status === 'skipped'
                    ? 'bg-muted text-muted-foreground'
                    : 'border-border-strong text-muted-foreground border',
              )}
            >
              {ACTIVITY_STATUS_LABELS[status]}
            </button>
          </div>
        </div>
      </li>
    </QuickActionsTarget>
  )
}

/** Trajet du jour, résumé : l'heure, le parcours, le numéro. */
export function TransportSummary({
  day,
  dayIndex,
  editor,
}: {
  day: DayItinerary
  dayIndex: number
  editor: DayEditor
}) {
  const { push } = useAppNav()
  const transport = day.transport
  if (!transport) return null
  const Icon = TRANSPORT_ICONS[transport.type]
  const route =
    [splitPlace(transport.from).name, splitPlace(transport.to).name]
      .filter(Boolean)
      .join(' → ') ||
    transport.details ||
    'Trajet'
  const times = [transport.departureTime, transport.arrivalTime]
    .filter(Boolean)
    .join(' → ')
  const sub = [transport.provider, transportNumber(transport)]
    .filter(Boolean)
    .join(' · ')

  return (
    <QuickActionsTarget
      asChild
      entity="transport"
      title={route}
      description="Transport de la journée"
      icon={Icon}
      actions={editor.transportActions()}
    >
      <button
        type="button"
        onClick={() => push({ kind: 'transport', dayIndex })}
        className="bg-card border-border pressable flex w-full items-center gap-3 rounded-[20px] border p-3.5 text-left"
      >
        <span
          aria-hidden
          className="bg-primary-soft text-primary flex size-11 shrink-0 items-center justify-center rounded-[14px]"
        >
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-secondary-strong text-[11px] font-black tracking-[0.08em] uppercase">
            {TRANSPORT_TYPE_LABELS[transport.type]}
            {times ? ` · ${times}` : ''}
          </span>
          <span className="truncate text-[15px] leading-5 font-black">
            {route}
          </span>
          {sub && (
            <span className="text-muted-foreground truncate text-[13px]">
              {sub}
            </span>
          )}
        </span>
        <ChevronRight
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      </button>
    </QuickActionsTarget>
  )
}

/** Hébergement du soir, avec l'itinéraire et le mode chauffeur. */
export function StayCard({
  dayIndex,
  editor,
  surface,
}: {
  dayIndex: number
  editor: DayEditor
  surface: 'day'
}) {
  const { push } = useAppNav()
  const apple = useApplePlatform()
  const stay = editor.stay
  if (!stay) return null
  const { accommodation } = stay
  const status = accommodation.status
  const url = directionsUrl(
    { address: [accommodation.name, accommodation.address].filter(Boolean).join(' ') },
    apple,
  )

  return (
    <div className="bg-card border-border overflow-hidden rounded-[20px] border">
      <QuickActionsTarget
        asChild
        entity="accommodation"
        title={accommodation.name || 'Hébergement'}
        description="Hébergement du soir"
        icon={Hotel}
        actions={editor.accommodationActions()}
      >
        <button
          type="button"
          onClick={() => push({ kind: 'accommodation', dayIndex })}
          className="pressable flex w-full items-start gap-3 p-3.5 pb-3 text-left"
        >
          <span
            aria-hidden
            className="bg-secondary-soft text-secondary-strong flex size-11 shrink-0 items-center justify-center rounded-[14px]"
          >
            <Hotel className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="text-secondary-strong text-[11px] font-black tracking-[0.08em]">
                {stay.night && stay.nights
                  ? `NUIT ${stay.night} SUR ${stay.nights}`
                  : 'CE SOIR'}
              </span>
              {status && status !== 'planned' && (
                <Pill tone="success" className="px-2 py-px text-[11px]">
                  {BOOKING_STATUS_LABELS[status]}
                </Pill>
              )}
            </span>
            <span className="line-clamp-2 text-[15px] leading-5 font-black">
              {accommodation.name || 'Hébergement'}
            </span>
            {accommodation.address && (
              <span className="text-muted-foreground truncate text-[13px] leading-[18px]">
                {accommodation.address}
              </span>
            )}
          </span>
          <ChevronRight
            className="text-muted-foreground mt-3 size-5 shrink-0"
            aria-hidden
          />
        </button>
      </QuickActionsTarget>
      <div className="flex gap-2 px-3.5 pb-3.5">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackDirections('accommodation', surface)}
            className="border-border-strong bg-card pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] text-sm font-extrabold"
          >
            <Navigation className="size-4" aria-hidden />
            Itinéraire
          </a>
        )}
        {accommodation.address && (
          <button
            type="button"
            onClick={() => push({ kind: 'driver', dayIndex })}
            className="bg-ink text-ink-foreground pressable flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold"
          >
            <Car className="size-4" aria-hidden />
            Montrer au chauffeur
          </button>
        )}
      </div>
    </div>
  )
}

/** À goûter : le nom, l'écriture locale à montrer, la précision. */
export function FoodList({
  day,
  editor,
}: {
  day: DayItinerary
  editor: DayEditor
}) {
  const items = day.foodRecommendations ?? []
  if (items.length === 0) return null
  return (
    <section className="mt-[18px]">
      <h2 className="mx-5 mb-2 text-[17px] leading-[22px] font-black">
        À goûter
      </h2>
      <ul
        data-swipe-ignore
        className="flex snap-x gap-2.5 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, index) => {
          const food = parseFood(item)
          return (
            <QuickActionsTarget
              key={`${item}-${index}`}
              asChild
              entity="day"
              title={food.name}
              description="À goûter dans la journée"
              actions={editor.listItemActions('foodRecommendations', item, index)}
            >
              <li className="bg-card border-border flex w-[150px] shrink-0 snap-start flex-col gap-0.5 rounded-[18px] border p-3">
                {food.native && (
                  <span
                    lang="zh"
                    className="text-secondary-strong text-xl leading-[26px] font-black"
                  >
                    {food.native}
                  </span>
                )}
                <span className="text-sm leading-[19px] font-black">
                  {food.name}
                </span>
                {food.detail && (
                  <span className="text-muted-foreground text-xs leading-4 first-letter:uppercase">
                    {food.detail}
                  </span>
                )}
              </li>
            </QuickActionsTarget>
          )
        })}
      </ul>
    </section>
  )
}

/** Conseils du jour, sur fond cyan. */
export function TipsList({
  day,
  editor,
}: {
  day: DayItinerary
  editor: DayEditor
}) {
  const tips = day.tips ?? []
  if (tips.length === 0) return null
  return (
    <section className="mx-5 mt-[18px]">
      <SectionHeading>Conseils</SectionHeading>
      <ul className="bg-accent-soft divide-accent/20 divide-y rounded-[18px] px-3.5 py-1">
        {tips.map((tip, index) => (
          <QuickActionsTarget
            key={`${tip}-${index}`}
            asChild
            entity="day"
            title={tip}
            description="Conseil de la journée"
            actions={editor.listItemActions('tips', tip, index)}
          >
            <li className="flex min-h-[38px] items-center gap-2.5 py-2 text-sm font-bold">
              <Lightbulb className="text-accent size-4 shrink-0" aria-hidden />
              {tip}
            </li>
          </QuickActionsTarget>
        ))}
      </ul>
    </section>
  )
}
