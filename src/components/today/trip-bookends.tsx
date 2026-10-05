'use client'

import { useEffect, useState } from 'react'
import {
  Backpack,
  Check,
  ChevronRight,
  List,
  MoreHorizontal,
  Plane,
  RotateCcw,
} from 'lucide-react'
import { daysUntil } from '@/lib/trips'
import { cn } from '@/lib/utils'
import { useDocuments } from '@/hooks/use-documents'
import { usePreferences } from '@/hooks/use-preferences'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { useImageCacheContext } from '@/components/image-cache-provider'
import { Button } from '@/components/ui/button'
import {
  buildDepartureChecklist,
  collectPackingTips,
  countLinkedTickets,
  formatDateRange,
  longDate,
  splitPlace,
  tripRecap,
  type DepartureChecklistId,
  type DepartureChecklistInput,
} from '@/components/day/day-logic'
import { Pill } from '@/components/day/day-ui'

/** En-tête commun avant et après le voyage : titre, dates, menu. */
function BookendHeader({ title }: { title: string }) {
  const { itinerary, activeTrip } = useTrip()
  const { push } = useAppNav()
  const first = itinerary[0]
  const last = itinerary[itinerary.length - 1]
  return (
    <header className="flex items-start gap-3 px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
      <div className="min-w-0 flex-1">
        <p className="text-secondary-strong text-xs font-black tracking-[0.08em]">
          {[activeTrip?.title, formatDateRange(first.date, last.date, '→')]
            .filter(Boolean)
            .join(' · ')
            .toUpperCase()}
        </p>
        <h1 className="font-display mt-0.5 text-[32px] leading-[1.1]">
          {title}
        </h1>
      </div>
      <Button
        variant="outline"
        size="icon-round"
        aria-label="Voyage et réglages"
        onClick={() => push({ kind: 'menu' })}
        className="border-border bg-card shrink-0 shadow-none"
      >
        <MoreHorizontal />
      </Button>
    </header>
  )
}

/** État des notifications, lu après le montage (absent côté serveur). */
function useNotificationPermission(): DepartureChecklistInput['notifications'] {
  const [permission, setPermission] =
    useState<DepartureChecklistInput['notifications']>('unsupported')
  useEffect(() => {
    if (!('Notification' in window)) return
    setPermission(Notification.permission)
  }, [])
  return permission
}

/** Avant le départ : compte à rebours, premier jour, préparation, bagages. */
export function BeforeTrip({ now }: { now: Date }) {
  const { itinerary, activeTrip } = useTrip()
  const { push, setTab } = useAppNav()
  const { stats } = useImageCacheContext()
  const { files } = useDocuments()
  const { preferences } = usePreferences()
  const notifications = useNotificationPermission()

  const first = itinerary[0]
  const countdown = Math.max(daysUntil(first.date, now), 0)
  const cityCount = new Set(itinerary.map((day) => day.city)).size

  const checklist = buildDepartureChecklist({
    dayCount: itinerary.length,
    offline: { total: stats.total, cached: stats.cached },
    notifications,
    remindersEnabled:
      preferences.notifyTransportEve ||
      preferences.notifyMorning ||
      preferences.notifyCheckIn,
    transports: itinerary.flatMap((day) =>
      day.transport ? [day.transport.type] : [],
    ),
    ticketsLinked: countLinkedTickets(itinerary, files, activeTrip?.id),
  })
  const doneCount = checklist.filter((item) => item.done).length

  const runChecklistAction = (id: DepartureChecklistId) => {
    switch (id) {
      case 'offline':
        push({ kind: 'offline' })
        break
      case 'notifications':
        push({ kind: 'settings' })
        break
      case 'tickets':
        setTab('documents')
        break
      case 'share':
        push({ kind: 'share' })
        break
      case 'calendar':
        push({ kind: 'calendar' })
        break
    }
  }

  const packing = collectPackingTips(itinerary)
  const route = first.transport
    ? [
        splitPlace(first.transport.from).name,
        splitPlace(first.transport.to).name,
      ]
        .filter(Boolean)
        .join(' → ')
    : `Arrivée à ${first.city}`

  return (
    <div className="stagger mx-auto w-full max-w-xl pb-6">
      <BookendHeader title="Bientôt le départ" />

      <section
        aria-label="Compte à rebours"
        className="bg-ink text-ink-foreground relative mx-5 mt-4 overflow-hidden rounded-[22px] p-5"
      >
        <span
          aria-hidden
          className="bg-primary absolute -top-10 -right-10 size-[170px] rounded-full opacity-35"
        />
        <span
          aria-hidden
          className="bg-secondary absolute top-[60px] right-[30px] size-[70px] rounded-full opacity-25"
        />
        <p className="text-secondary relative text-[11px] font-black tracking-[0.1em]">
          DÉPART DANS
        </p>
        <p className="relative mt-1 flex items-baseline gap-2.5">
          <span className="font-display text-[72px] leading-[0.95]">
            {countdown}
          </span>
          <span className="font-display text-[26px] leading-none">
            {countdown > 1 ? 'jours' : 'jour'}
          </span>
        </p>
        <div className="border-ink-foreground/15 bg-ink-foreground/10 relative mt-4 flex items-center gap-2.5 rounded-2xl border px-3.5 py-3">
          <Plane className="size-5 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold">
              {route}
            </span>
            <span className="block text-[13px] font-bold capitalize opacity-75">
              {longDate(first.date)}
            </span>
          </span>
          <span className="text-right text-xs leading-snug font-extrabold opacity-75">
            {itinerary.length} jour{itinerary.length > 1 ? 's' : ''}
            <br />
            {cityCount} ville{cityCount > 1 ? 's' : ''}
          </span>
        </div>
      </section>

      <button
        type="button"
        onClick={() => push({ kind: 'day', dayIndex: 0 })}
        className="bg-card border-border pressable mx-5 mt-3 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-[20px] border px-4 py-3.5 text-left"
      >
        <span className="bg-secondary-soft text-secondary-strong flex size-12 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none">
          <span className="text-[10px] font-black">JOUR</span>
          <span className="text-xl font-black">1</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-xs font-extrabold uppercase">
            Premier jour · {first.city}
          </span>
          <span className="block text-base font-extrabold">{first.title}</span>
          {first.notes && (
            <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-[13px] leading-snug">
              {first.notes}
            </span>
          )}
        </span>
        <ChevronRight
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      </button>

      <section aria-labelledby="prep-title" className="mx-5 mt-5">
        <div className="flex items-center justify-between">
          <h2 id="prep-title" className="text-[17px] font-black">
            Préparer le départ
          </h2>
          <Pill>
            {doneCount}/{checklist.length} fait
          </Pill>
        </div>
        <div
          role="progressbar"
          aria-label="Préparation"
          aria-valuemin={0}
          aria-valuemax={checklist.length}
          aria-valuenow={doneCount}
          className="bg-border mt-2.5 h-2 overflow-hidden rounded-full"
        >
          <span
            className="bg-primary animate-grow block h-2 rounded-full"
            style={{ width: `${(doneCount / checklist.length) * 100}%` }}
          />
        </div>
        <ul className="bg-card border-border mt-3 rounded-[20px] border p-1.5">
          {checklist.map((item, position) => {
            const separator =
              position > 0 && checklist[position - 1].done && !item.done
            return (
              <li key={item.id}>
                {separator && (
                  <span
                    aria-hidden
                    className="bg-border/70 mx-2.5 my-1 block h-px"
                  />
                )}
                {item.done ? (
                  <div className="flex min-h-11 items-center gap-3 p-2.5">
                    <span className="bg-success-soft text-success animate-pop flex size-7 shrink-0 items-center justify-center rounded-full">
                      <Check className="size-4" strokeWidth={3} aria-hidden />
                    </span>
                    <span className="text-muted-foreground flex-1 text-[15px] font-bold">
                      {item.label}
                    </span>
                    <span className="text-success text-xs font-extrabold">
                      Fait
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => runChecklistAction(item.id)}
                    className="pressable focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-[14px] p-2.5 text-left outline-none focus-visible:ring-[3px]"
                  >
                    <span
                      aria-hidden
                      className="border-border-strong size-7 shrink-0 rounded-full border-2"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold">
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="text-muted-foreground block text-[13px]">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className="text-muted-foreground size-5 shrink-0"
                      aria-hidden
                    />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {packing.items.length > 0 && (
        <section
          aria-labelledby="packing-title"
          className="bg-card border-border mx-5 mt-3 rounded-[20px] border p-4"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="bg-secondary-soft text-secondary-strong flex size-10 shrink-0 items-center justify-center rounded-xl"
            >
              <Backpack className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <h2 id="packing-title" className="text-base font-black">
                {packing.source === 'packing'
                  ? 'À préparer dans les bagages'
                  : 'À préparer avant de partir'}
              </h2>
              <span className="text-muted-foreground block text-xs font-bold">
                {packing.source === 'packing'
                  ? 'D’après les conseils de votre programme'
                  : 'Les conseils de votre premier jour'}
              </span>
            </span>
          </div>
          <ul className="mt-3 flex flex-col">
            {packing.items.slice(0, 8).map((item) => (
              <li
                key={item.text}
                className="border-border/70 flex items-start gap-2.5 border-t py-2.5 last:pb-0"
              >
                <span
                  aria-hidden
                  className="bg-secondary mt-[7px] size-1.5 shrink-0 rounded-full"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">
                    {item.text}
                  </span>
                  <span className="text-muted-foreground block text-xs font-bold">
                    {item.context}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Après le voyage : un récapitulatif sobre, et le chemin vers le programme. */
export function AfterTrip() {
  const { itinerary } = useTrip()
  const { push, setTab } = useAppNav()
  const recap = tripRecap(itinerary)

  const stats: { value: string; label: string }[] = [
    { value: String(recap.days), label: recap.days > 1 ? 'jours' : 'jour' },
    {
      value: String(recap.cities.length),
      label: recap.cities.length > 1 ? 'villes' : 'ville',
    },
  ]
  if (recap.activities > 0) {
    stats.push({
      value: `${recap.activitiesDone}/${recap.activities}`,
      label: 'activités faites',
    })
  }
  if (recap.walkedKm !== null) {
    stats.push({ value: `${recap.walkedKm} km`, label: 'à pied' })
  }

  return (
    <div className="stagger mx-auto w-full max-w-xl pb-6">
      <BookendHeader title="Voyage terminé" />
      <p className="text-muted-foreground mx-5 mt-2 text-[15px] leading-relaxed">
        Votre programme reste ici, intact, pour vous souvenir de chaque étape.
      </p>

      <dl
        className={cn(
          'bg-card border-border mx-5 mt-4 grid rounded-[20px] border px-1.5 py-3',
          stats.length === 4 ? 'grid-cols-2 gap-y-3' : 'grid-cols-3',
        )}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col-reverse items-center gap-0.5"
          >
            <dt className="text-muted-foreground text-xs font-extrabold">
              {stat.label}
            </dt>
            <dd className="text-xl font-black">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {recap.cities.length > 0 && (
        <section className="mx-5 mt-5">
          <h2 className="mb-2 text-[17px] font-black">Les étapes</h2>
          <ul className="flex flex-wrap gap-2">
            {recap.cities.map((city) => (
              <li
                key={city}
                className="bg-secondary-soft text-secondary-strong rounded-full px-3 py-1.5 text-[13px] font-extrabold"
              >
                {city}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mx-5 mt-6 flex flex-col gap-2.5">
        <Button size="xl" className="w-full" onClick={() => setTab('program')}>
          <List />
          Revoir le programme
        </Button>
        <Button
          size="lg2"
          variant="outline"
          className="w-full"
          onClick={() => push({ kind: 'day', dayIndex: itinerary.length - 1 })}
        >
          <RotateCcw />
          Revoir le dernier jour
        </Button>
      </div>
    </div>
  )
}
