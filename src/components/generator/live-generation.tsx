'use client'

import { useSyncExternalStore } from 'react'
import {
  IconAlertTriangle,
  IconBell,
  IconPlayerStop,
  IconRefresh,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { GenerationState } from '@/lib/generator/generation-store'
import { formatTripRange } from '@/lib/generator/review'
import type { GeneratedDay } from '@/lib/generator/itinerary-schema'
import { cn } from '@/lib/utils'

/** Nombre maximal de squelettes après la journée en cours. */
const SKELETONS_AHEAD = 3

/** La permission de notifier, lue sans la demander. */
function useNotificationsGranted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () =>
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted',
    () => false,
  )
}

/**
 * Génération en direct : chaque journée apparaît dès qu'elle est écrite,
 * suivie de squelettes pour celles qui restent. L'écran peut être quitté —
 * la génération continue dans le magasin du module.
 */
export function LiveGeneration({
  state,
  onClose,
  onStop,
  onSeeResult,
  onRetry,
  onEdit,
}: {
  state: GenerationState
  onClose: () => void
  onStop: () => void
  onSeeResult: () => void
  onRetry: () => void
  onEdit: () => void
}) {
  const notifies = useNotificationsGranted()
  const running = state.status === 'running'
  const total = Math.max(state.expectedDays, state.days.length)
  const done = state.days.length
  const currentNumber = Math.min(done + 1, total || done + 1)
  const currentCity = state.current?.city ?? state.days[done - 1]?.city
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const startDate = state.request?.startDate ?? ''

  const subtitle = [
    state.tripTitle,
    total > 0 && startDate ? formatTripRange(startDate, total) : '',
  ]
    .filter(Boolean)
    .join(' · ')

  let status: string
  if (state.status === 'stopped') {
    status = `Arrêtée au jour ${done}${total ? ` sur ${total}` : ''}`
  } else if (state.status === 'error') {
    status = 'Génération interrompue'
  } else if (done === 0 && !state.current) {
    status = 'Préparation du voyage…'
  } else {
    status = `Jour ${currentNumber}${total ? ` sur ${total}` : ''}${
      currentCity ? ` · ${currentCity}` : ''
    }`
  }

  const remaining = Math.max(0, total - done - (state.current ? 1 : 0))
  const skeletons = running ? Math.min(SKELETONS_AHEAD, remaining) : 0

  return (
    <MobileScreen
      onBack={onClose}
      backIcon="close"
      backLabel={
        running ? 'Fermer, la génération continue' : 'Fermer le générateur'
      }
      progress={{ step: 2, total: 4 }}
      stagger={false}
      footer={
        <>
          {running && (
            <div className="bg-primary-soft text-primary-strong mb-1 flex items-center gap-2.5 rounded-[14px] px-3 py-2.5">
              <IconBell className="text-primary size-5 shrink-0" aria-hidden />
              <p className="flex-1 text-[13px] leading-[1.4] font-bold">
                {notifies
                  ? 'Vous pouvez quitter l’écran : on vous prévient quand c’est prêt.'
                  : 'Vous pouvez quitter l’écran : la génération continue tant que l’app reste ouverte.'}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            {running ? (
              <Button
                variant="outline"
                size="lg2"
                className="h-[52px] flex-1 rounded-2xl text-base font-extrabold"
                onClick={onStop}
              >
                <IconPlayerStop aria-hidden />
                Arrêter
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg2"
                className="h-[52px] flex-1 rounded-2xl text-base font-extrabold"
                onClick={state.status === 'error' ? onEdit : onRetry}
              >
                {state.status === 'error' ? (
                  'Modifier'
                ) : (
                  <>
                    <IconRefresh aria-hidden />
                    Relancer
                  </>
                )}
              </Button>
            )}
            {state.status === 'error' ? (
              <Button
                size="lg2"
                className="h-[52px] flex-1 rounded-2xl text-base font-extrabold"
                onClick={onRetry}
              >
                <IconRefresh aria-hidden />
                Réessayer
              </Button>
            ) : (
              <Button
                size="lg2"
                className="h-[52px] flex-1 rounded-2xl text-base font-extrabold"
                disabled={running || done === 0}
                onClick={onSeeResult}
              >
                Voir le résultat
              </Button>
            )}
          </div>
        </>
      }
    >
      <header className="flex flex-col gap-1">
        <p className="text-secondary-strong flex items-center gap-2 text-xs font-black tracking-[0.08em] uppercase">
          {running && (
            <span
              aria-hidden
              className="bg-secondary animate-pulse-dot size-2 rounded-full"
            />
          )}
          {running ? 'Génération en direct' : 'Génération'}
        </p>
        <h1 className="font-display text-[28px] leading-[1.15]">
          {running ? 'On compose votre voyage' : 'Votre voyage en cours'}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground text-sm font-bold">{subtitle}</p>
        )}
      </header>

      <div className="bg-ink text-ink-foreground mt-4 flex flex-col gap-2.5 rounded-[20px] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          {running ? (
            <span
              aria-hidden
              className="border-ink-foreground/20 border-t-ink-foreground size-[18px] shrink-0 animate-spin rounded-full border-[2.5px]"
            />
          ) : (
            <IconAlertTriangle
              className="text-secondary size-[18px] shrink-0"
              aria-hidden
            />
          )}
          <span className="flex-1 truncate text-[15px] font-black">
            {status}
          </span>
          {total > 0 && (
            <span className="text-ink-foreground/70 font-mono text-[13px] font-semibold">
              {percent} %
            </span>
          )}
        </div>
        <span
          role="progressbar"
          aria-label="Avancement de la génération"
          aria-valuemin={0}
          aria-valuemax={total || undefined}
          aria-valuenow={done}
          aria-valuetext={status}
          className="bg-ink-foreground/15 block h-1.5 overflow-hidden rounded-full"
        >
          <span
            className="bg-secondary block h-1.5 rounded-full transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </span>
        {state.summary && (
          <span className="text-ink-foreground/70 line-clamp-2 text-xs font-bold">
            {state.summary}
          </span>
        )}
      </div>

      {state.status === 'error' && state.error && (
        <div
          role="alert"
          className="bg-destructive-soft text-destructive mt-3 flex items-start gap-2.5 rounded-2xl p-3.5"
        >
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="flex-1 text-sm leading-snug font-bold">
            {state.error.message}
            {state.error.retryAfter
              ? ` (dans ${Math.ceil(state.error.retryAfter / 60)} min)`
              : ''}
          </p>
        </div>
      )}

      <ol
        aria-live="polite"
        aria-label="Journées générées"
        className="mt-3.5 flex flex-col gap-2"
      >
        {state.days.map((day, index) => (
          <DayRow key={index} day={day} number={index + 1} />
        ))}
        {running && state.current && (
          <li
            aria-current="step"
            className="bg-card border-primary ring-ring/30 animate-fade flex gap-3 rounded-2xl border px-3 py-2.5 ring-[3px]"
          >
            <DayBadge number={done + 1} active />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold">
                <span className="truncate">
                  {state.current.city && (
                    <span className="text-muted-foreground">
                      {state.current.city} ·{' '}
                    </span>
                  )}
                  {state.current.title ?? ''}
                </span>
                <span className="text-primary-strong ml-auto shrink-0 text-[11px] font-extrabold">
                  en cours…
                </span>
              </span>
              <span className="flex items-center gap-1.5 overflow-hidden">
                {state.current.activityNames.slice(0, 2).map((name) => (
                  <span
                    key={name}
                    className="bg-primary-soft text-primary-strong border-ring/30 truncate rounded-full border px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap"
                  >
                    {name}
                  </span>
                ))}
                <span className="animate-shimmer-soft bg-primary-soft h-[18px] w-[76px] shrink-0 rounded-full" />
              </span>
            </span>
          </li>
        )}
        {Array.from({ length: skeletons }, (_, index) => (
          <li
            key={`skeleton-${index}`}
            aria-hidden
            className="bg-card border-border flex gap-3 rounded-2xl border border-dashed px-3 py-2.5"
          >
            <span className="bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-black">
              J{done + (state.current ? 2 : 1) + index}
            </span>
            <span className="flex flex-1 flex-col justify-center gap-2">
              <span className="animate-shimmer-soft bg-muted h-3 w-3/5 rounded-md" />
              <span className="flex gap-1.5">
                <span className="animate-shimmer-soft bg-muted h-4 w-[70px] rounded-full" />
                <span className="animate-shimmer-soft bg-muted h-4 w-[54px] rounded-full" />
                <span className="animate-shimmer-soft bg-muted h-4 w-16 rounded-full" />
              </span>
            </span>
          </li>
        ))}
      </ol>
    </MobileScreen>
  )
}

function DayBadge({ number, active }: { number: number; active?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-black',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-primary-soft text-primary-strong',
      )}
    >
      J{number}
    </span>
  )
}

function DayRow({ day, number }: { day: GeneratedDay; number: number }) {
  return (
    <li className="bg-card border-border animate-rise flex gap-3 rounded-2xl border px-3 py-2.5">
      <DayBadge number={number} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-sm font-extrabold">
          <span className="text-muted-foreground">{day.city} · </span>
          {day.title}
        </span>
        {day.activities.length > 0 && (
          <span className="flex gap-1.5 overflow-hidden">
            {day.activities.slice(0, 3).map((activity, index) => (
              <span
                key={index}
                className="bg-background border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap"
              >
                {activity.name}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  )
}
