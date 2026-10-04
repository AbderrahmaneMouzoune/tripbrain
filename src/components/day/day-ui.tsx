'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bus,
  Camera,
  Car,
  Check,
  Plane,
  ShoppingBag,
  Sparkles,
  Train,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Activity, Transport } from '@/lib/itinerary-data'
import { useClipboard } from '@/hooks/use-clipboard'
import { trackEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'
import { isApplePlatform } from '@/components/day/day-logic'

export const ACTIVITY_ICONS: Record<Activity['type'], LucideIcon> = {
  visit: Camera,
  transport: Train,
  food: Utensils,
  experience: Sparkles,
  shopping: ShoppingBag,
}

export const TRANSPORT_ICONS: Record<Transport['type'], LucideIcon> = {
  train: Train,
  car: Car,
  plane: Plane,
  bus: Bus,
}

/**
 * Plans d'Apple sur iPhone et iPad, Google Maps ailleurs. Lu après le montage :
 * le premier rendu ne connaît pas l'appareil.
 */
export function useApplePlatform(): boolean {
  const [apple, setApple] = useState(false)
  useEffect(() => {
    setApple(isApplePlatform(navigator.userAgent, navigator.maxTouchPoints))
  }, [])
  return apple
}

/** Mesure d'usage d'un « Y aller » : le type de lieu, jamais le lieu. */
export function trackDirections(
  target: 'activity' | 'transport' | 'accommodation' | 'city',
  surface: 'today' | 'day' | 'activity' | 'transport' | 'accommodation' | 'map',
) {
  trackEvent('directions_opened', { target, surface })
}

/**
 * Copie avec un retour visible : une pastille « Adresse copiée » au bas de
 * l'écran, annoncée aux lecteurs d'écran. Le presse-papiers ne dit rien de
 * lui-même, et la feuille qui a lancé la copie vient souvent de se refermer.
 */
export function useCopyToast() {
  const { copy } = useClipboard()
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copyText = useCallback(
    async (text: string, confirmation = 'Copié') => {
      await copy(text)
      if (timer.current) clearTimeout(timer.current)
      setMessage(confirmation)
      timer.current = setTimeout(() => setMessage(null), 1800)
    },
    [copy],
  )

  const toast =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-[70] flex justify-center px-4"
          >
            {message && (
              <span className="bg-ink text-ink-foreground animate-pop flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold shadow-lg">
                <Check className="size-4" aria-hidden />
                {message}
              </span>
            )}
          </div>,
          document.body,
        )

  return { copyText, toast }
}

export type ActivityStatusValue = NonNullable<Activity['status']>

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatusValue, string> = {
  planned: 'Prévu',
  done: 'Fait',
  skipped: 'Annulé',
}

/**
 * Pastille numérotée d'une activité : pleine pour la prochaine étape, verte
 * cochée une fois faite, barrée une fois annulée.
 */
export function ActivityNumber({
  index,
  activity,
  isNext,
  size = 'md',
}: {
  index: number
  activity: Activity
  isNext?: boolean
  size?: 'sm' | 'md'
}) {
  const status = activity.status ?? 'planned'
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-black',
        size === 'sm' ? 'size-[26px] text-xs' : 'size-7 text-[13px]',
        status === 'done'
          ? 'bg-success-soft text-success'
          : status === 'skipped'
            ? 'bg-muted text-muted-foreground'
            : isNext
              ? 'bg-primary text-primary-foreground'
              : activity.type === 'food'
                ? 'bg-secondary-soft text-secondary-strong'
                : 'bg-primary-soft text-primary-strong',
      )}
    >
      {status === 'done' ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : status === 'skipped' ? (
        <X className="size-3.5" strokeWidth={3} />
      ) : (
        index + 1
      )}
    </span>
  )
}

/** Petite pastille arrondie (« Réservation », « UNESCO »). */
export function Pill({
  tone = 'primary',
  className,
  children,
}: {
  tone?: 'primary' | 'secondary' | 'accent' | 'success' | 'muted' | 'outline'
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-extrabold',
        tone === 'primary' && 'bg-primary-soft text-primary-strong',
        tone === 'secondary' && 'bg-secondary-soft text-secondary-strong',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'outline' &&
          'border-border-strong text-muted-foreground border',
        className,
      )}
    >
      {children}
    </span>
  )
}
