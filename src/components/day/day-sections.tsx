'use client'

import type { Ref } from 'react'
import { ChevronRight, Lightbulb, Plus } from 'lucide-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import { useAppNav } from '@/components/app/navigation'
import { QuickActionsTarget } from '@/components/quick-actions'
import type { DayEditor } from '@/components/day/use-day-editor'
import {
  parseFood,
  splitPlace,
  transportNumber,
  TRANSPORT_TYPE_LABELS,
} from '@/components/day/day-logic'
import { TRANSPORT_ICONS } from '@/components/day/day-ui'

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

/** Trajet du jour, résumé : l'heure, le parcours, le numéro. */
export function TransportSummary({
  day,
  dayIndex,
  editor,
  ref,
}: {
  day: DayItinerary
  dayIndex: number
  editor: DayEditor
  ref?: Ref<HTMLButtonElement>
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
        ref={ref}
        type="button"
        onClick={() => push({ kind: 'transport', dayIndex })}
        className="bg-card border-border pressable flex w-full items-center gap-3 rounded-[20px] border p-3.5 text-left"
      >
        <span
          aria-hidden
          className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-[14px]"
        >
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-extrabold">
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
    <section className="mt-4">
      <h3 className="mx-3.5 mb-2 text-[15px] font-black">À goûter</h3>
      <ul
        data-swipe-ignore
        className="flex snap-x scroll-px-3.5 gap-2 overflow-x-auto overscroll-x-contain px-3.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              actions={editor.listItemActions(
                'foodRecommendations',
                item,
                index,
              )}
            >
              <li className="bg-background flex w-[150px] shrink-0 snap-start flex-col gap-0.5 rounded-2xl p-3">
                {food.native && (
                  <span lang="zh" className="text-xl leading-[26px] font-black">
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

/** Conseils du jour, dans le bloc replié du fil. */
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
    <section className="mx-3.5 mt-4">
      <h3 className="mb-1 text-[15px] font-black">Conseils</h3>
      <ul>
        {tips.map((tip, index) => (
          <QuickActionsTarget
            key={`${tip}-${index}`}
            asChild
            entity="day"
            title={tip}
            description="Conseil de la journée"
            actions={editor.listItemActions('tips', tip, index)}
          >
            <li className="text-muted-foreground flex min-h-9 items-center gap-2.5 py-1.5 text-sm">
              <Lightbulb className="size-4 shrink-0" aria-hidden />
              {tip}
            </li>
          </QuickActionsTarget>
        ))}
      </ul>
    </section>
  )
}
