'use client'

import { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Hotel,
  Info,
  Navigation,
  X,
} from 'lucide-react'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import { useAppNav } from '@/components/app/navigation'
import { QuickActionsTarget } from '@/components/quick-actions'
import type { DayEditor } from '@/components/day/use-day-editor'
import {
  ACTIVITY_TYPE_LABELS,
  directionsUrl,
  formatDuration,
} from '@/components/day/day-logic'
import {
  ACTIVITY_ICONS,
  openDirections,
  useApplePlatform,
} from '@/components/day/day-ui'
import { FoodList, TipsList } from '@/components/day/day-sections'

function shortAddress(address: string | undefined): string | undefined {
  if (!address) return undefined
  return address.split(',').slice(0, 2).join(',').trim()
}

/** Pastille du fil : cochée, barrée, pleine (prochaine étape) ou creuse. */
function TimelineDot({
  status,
  isNext,
}: {
  status: Activity['status']
  isNext: boolean
}) {
  if (status === 'done' || status === 'skipped') {
    const Icon = status === 'done' ? Check : X
    return (
      <span
        aria-hidden
        className="bg-border-strong text-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
      >
        <Icon className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (isNext) {
    return (
      <span
        aria-hidden
        className="bg-primary ring-primary-soft mt-4 size-6 shrink-0 rounded-full ring-[5px]"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="border-border-strong bg-background mt-0.5 size-5 shrink-0 rounded-full border-2"
    />
  )
}

/**
 * Le fil de la journée : les étapes dans l'ordre, une seule couleur pour la
 * prochaine. Elle seule est dépliée, avec « Y aller » et « C'est fait » ; les
 * autres tiennent sur une ligne, le détail est dans la fiche.
 */
export function DayTimeline({
  day,
  dayIndex,
  nextIndex,
  editor,
}: {
  day: DayItinerary
  dayIndex: number
  nextIndex: number | null
  editor: DayEditor
}) {
  const { push } = useAppNav()
  const apple = useApplePlatform()
  const last = day.activities.length - 1

  return (
    <ol aria-label="Étapes de la journée" className="mx-5 flex flex-col">
      {day.activities.map((activity, position) => {
        const status = activity.status ?? 'planned'
        const isNext = position === nextIndex
        const name = activity.name || 'Activité sans nom'
        const open = () =>
          push({ kind: 'activity', dayIndex, activityId: activity.id })
        const settled = status !== 'planned'
        const url = isNext ? directionsUrl(activity, apple) : null
        const meta = [
          status === 'done' ? 'Fait' : status === 'skipped' ? 'Annulé' : null,
          formatDuration(activity.duration),
          activity.openAt,
          isNext ? shortAddress(activity.address) : null,
        ].filter(Boolean)

        return (
          <QuickActionsTarget
            key={activity.id}
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
            actions={editor.activityActions(activity, position)}
          >
            <li className="flex gap-3">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <TimelineDot status={status} isNext={isNext} />
                {position < last && (
                  <span aria-hidden className="bg-border mt-1 w-0.5 flex-1" />
                )}
              </div>

              {isNext ? (
                <div className="bg-card border-primary mb-3.5 flex min-w-0 flex-1 flex-col gap-0.5 rounded-[20px] border-[1.5px] px-4 pt-3.5 pb-4">
                  <p className="text-primary-strong text-xs font-black tracking-[0.08em]">
                    PROCHAINE ÉTAPE
                  </p>
                  <button
                    type="button"
                    onClick={open}
                    className="text-left text-xl leading-[26px] font-black outline-none focus-visible:underline"
                  >
                    {name}
                  </button>
                  {meta.length > 0 && (
                    <p className="text-muted-foreground text-sm leading-5">
                      {meta.join(' · ')}
                    </p>
                  )}
                  {activity.reservationRequired === true && (
                    <p className="text-secondary-strong text-sm leading-5 font-extrabold">
                      À réserver
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) =>
                          openDirections(event, 'activity', 'day', activity)
                        }
                        className="bg-primary text-primary-foreground pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-extrabold"
                      >
                        <Navigation className="size-[18px]" aria-hidden />Y
                        aller
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => editor.setStatus(activity.id, 'done')}
                      className="border-border-strong bg-card pressable h-11 flex-1 rounded-xl border-[1.5px] text-[15px] font-extrabold"
                    >
                      C’est fait
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={open}
                  className="pressable focus-visible:ring-ring/50 mb-3 flex min-h-11 min-w-0 flex-1 flex-col rounded-xl text-left outline-none focus-visible:ring-[3px]"
                >
                  <span
                    className={cn(
                      'text-base leading-[22px] font-extrabold',
                      settled && 'text-muted-foreground font-bold',
                      status === 'skipped' && 'line-through',
                    )}
                  >
                    {name}
                  </span>
                  {(meta.length > 0 ||
                    (!settled && activity.reservationRequired === true)) && (
                    <span className="text-muted-foreground text-sm leading-5">
                      {meta.join(' · ')}
                      {!settled && activity.reservationRequired === true && (
                        <>
                          {meta.length > 0 ? ' · ' : ''}
                          <span className="text-secondary-strong font-extrabold">
                            à réserver
                          </span>
                        </>
                      )}
                    </span>
                  )}
                </button>
              )}
            </li>
          </QuickActionsTarget>
        )
      })}
    </ol>
  )
}

/** « Ce soir » : l'hébergement en une ligne, le détail dans sa fiche. */
export function StayRow({
  dayIndex,
  editor,
}: {
  dayIndex: number
  editor: DayEditor
}) {
  const { push } = useAppNav()
  const stay = editor.stay
  if (!stay) return null
  return (
    <button
      type="button"
      onClick={() => push({ kind: 'accommodation', dayIndex })}
      className="pressable focus-visible:ring-ring/50 flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left outline-none focus-visible:ring-[3px]"
    >
      <Hotel className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
        <span className="text-muted-foreground font-medium">Ce soir · </span>
        {stay.accommodation.name || 'Hébergement'}
      </span>
      <ChevronRight
        className="text-muted-foreground size-5 shrink-0"
        aria-hidden
      />
    </button>
  )
}

/**
 * Tout ce qui aide sans décider de la journée — points forts, à goûter,
 * bagages, conseils — replié derrière une seule ligne.
 */
export function DayExtras({
  day,
  editor,
}: {
  day: DayItinerary
  editor: DayEditor
}) {
  const [open, setOpen] = useState(false)
  const highlights = day.highlights ?? []
  const packing = day.packingTips ?? []
  const count =
    highlights.length +
    packing.length +
    (day.foodRecommendations?.length ?? 0) +
    (day.tips?.length ?? 0)
  if (count === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="pressable focus-visible:ring-ring/50 flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left outline-none focus-visible:ring-[3px]"
      >
        <Info className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <span className="flex-1 text-[15px] font-bold">
          Conseils, bagages, à goûter
        </span>
        <span className="text-muted-foreground text-sm">{count}</span>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-5 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-border/70 -mx-px border-t pb-4">
          {highlights.length > 0 && (
            <TextList
              title="Points forts"
              items={highlights}
              description="Point fort de la journée"
              actions={(item, position) =>
                editor.listItemActions('highlights', item, position)
              }
            />
          )}
          <FoodList day={day} editor={editor} />
          {packing.length > 0 && (
            <TextList
              title="Bagages"
              items={packing}
              description="Bagages de la journée"
              actions={(item, position) =>
                editor.listItemActions('packingTips', item, position)
              }
            />
          )}
          <TipsList day={day} editor={editor} />
        </div>
      )}
    </>
  )
}

function TextList({
  title,
  items,
  description,
  actions,
}: {
  title: string
  items: string[]
  description: string
  actions: (
    item: string,
    position: number,
  ) => ReturnType<DayEditor['listItemActions']>
}) {
  return (
    <section className="mx-3.5 mt-4">
      <h3 className="mb-1 text-[15px] font-black">{title}</h3>
      <ul>
        {items.map((item, position) => (
          <QuickActionsTarget
            key={`${item}-${position}`}
            asChild
            entity="day"
            title={item}
            description={description}
            actions={actions(item, position)}
          >
            <li className="text-muted-foreground flex min-h-9 items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="bg-muted-foreground size-1 shrink-0 rounded-full"
              />
              {item}
            </li>
          </QuickActionsTarget>
        ))}
      </ul>
    </section>
  )
}
