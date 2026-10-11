'use client'

import { Check, Pencil } from 'lucide-react'
import { currentDayIndex, tripStatus } from '@/lib/trips'
import { cn } from '@/lib/utils'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { useEditSession } from '@/components/app/edit-session'
import { Button } from '@/components/ui/button'
import {
  buildProgramRows,
  dayOfMonth,
  dayTiming,
  formatDateRange,
  weekdayShort,
} from '@/components/day/day-logic'

/** Onglet Programme : tout le voyage, étape par étape. */
export function ProgramView(_props: {}) {
  const { itinerary, activeTrip } = useTrip()
  const { selectedDay, selectDay, push } = useAppNav()
  const { startEditing } = useEditSession()

  if (itinerary.length === 0) return null

  const first = itinerary[0]
  const last = itinerary[itinerary.length - 1]
  const cityCount = new Set(itinerary.map((day) => day.city)).size
  const status = tripStatus(itinerary)
  const total = itinerary.length
  // Avant le départ, rien n'est parcouru ; après, tout l'est.
  const progress =
    status === 'upcoming'
      ? 0
      : status === 'past'
        ? total
        : currentDayIndex(itinerary) + 1

  const rows = buildProgramRows(itinerary)

  const openDay = (index: number) => {
    selectDay(index, 'timeline')
    push({ kind: 'day', dayIndex: index })
  }

  const editProgram = () => {
    const index = Math.min(Math.max(selectedDay, 0), total - 1)
    push({ kind: 'day', dayIndex: index })
    startEditing()
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-6">
      <header className="flex items-start gap-2 px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[30px] leading-[1.1]">
            {activeTrip?.title ?? 'Mon voyage'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-bold">
            {formatDateRange(first.date, last.date, '→')} · {total} jour
            {total > 1 ? 's' : ''} · {cityCount} ville{cityCount > 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Modifier le programme"
          onClick={editProgram}
          className="border-border bg-card shrink-0 shadow-none"
        >
          <Pencil />
        </Button>
      </header>

      <div className="mx-5 mt-3.5 flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label="Avancement du voyage"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={progress}
          className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-secondary animate-grow h-2 rounded-full"
            style={{ width: `${(progress / total) * 100}%` }}
          />
        </div>
        <span className="text-muted-foreground text-[13px] font-extrabold tabular-nums">
          {status === 'upcoming'
            ? 'Pas encore parti'
            : `Jour ${progress} / ${total}`}
        </span>
      </div>

      <div className="stagger mt-4 px-5">
        {rows.map((row) => {
          if (row.kind === 'city') {
            return (
              <h2
                key={row.key}
                className="flex items-baseline justify-between px-1 pt-3.5 pb-1.5"
              >
                <span className="text-[17px] font-black">{row.city}</span>
                <span className="text-muted-foreground text-xs font-extrabold">
                  {row.range}
                </span>
              </h2>
            )
          }
          if (row.kind === 'move') {
            return (
              <p
                key={row.key}
                className="text-muted-foreground flex items-center gap-2 py-0.5 pl-[30px] text-xs font-extrabold"
              >
                <span aria-hidden className="bg-border-strong h-5 w-0.5" />
                {row.label}
              </p>
            )
          }
          const timing = dayTiming(row.day.date)
          const isToday = timing === 'today'
          const isPast = timing === 'past'
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => openDay(row.index)}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`Jour ${row.index + 1}, ${row.day.title}${isToday ? ", aujourd'hui" : isPast ? ', passé' : ''}`}
              className={cn(
                'pressable mb-1.5 flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-3 py-1.5 text-left outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                isToday
                  ? 'border-primary bg-card border-2 px-[11px] py-[5px]'
                  : isPast
                    ? 'border-border-strong border border-dashed'
                    : 'border-border bg-card border',
              )}
            >
              <span className="text-muted-foreground flex w-10 shrink-0 flex-col items-center">
                <span className="text-[10px] font-black">
                  {weekdayShort(row.day.date)}
                </span>
                <span
                  className={cn(
                    'text-[17px] leading-tight font-black',
                    !isPast && 'text-foreground',
                  )}
                >
                  {dayOfMonth(row.day.date)}
                </span>
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 text-[15px] font-extrabold',
                  isPast && 'text-muted-foreground',
                )}
              >
                {row.day.title}
              </span>
              {isToday && (
                <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-[3px] text-[11px] font-black">
                  Aujourd’hui
                </span>
              )}
              {isPast && (
                <Check
                  className="text-success size-5 shrink-0"
                  strokeWidth={2.5}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
