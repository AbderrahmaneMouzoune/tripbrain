'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
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
import {
  isInsideNativeApp,
  openMapsNatively,
  type NativeMapsTarget,
} from '@/lib/native-app'
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
 *
 * Dans l'app native, toujours le lien Google : c'est la forme que le natif
 * sait lire, et c'est lui qui choisit l'app de cartes installée.
 */
export function useApplePlatform(): boolean {
  const [apple, setApple] = useState(false)
  useEffect(() => {
    setApple(
      !isInsideNativeApp() &&
        isApplePlatform(navigator.userAgent, navigator.maxTouchPoints),
    )
  }, [])
  return apple
}

type DirectionsTarget = 'activity' | 'transport' | 'accommodation' | 'city'
type DirectionsSurface =
  | 'today'
  | 'day'
  | 'activity'
  | 'transport'
  | 'accommodation'
  | 'map'

/** Mesure d'usage d'un « Y aller » : le type de lieu, jamais le lieu. */
export function trackDirections(
  target: DirectionsTarget,
  surface: DirectionsSurface,
) {
  trackEvent('directions_opened', { target, surface })
}

/**
 * Clic sur un lien d'itinéraire : mesuré, puis confié à l'app de cartes du
 * téléphone quand l'app native sait le faire (nom et coordonnées compris).
 * Sinon — navigateur, ancienne version de l'app — le lien suit son cours.
 */
export function openDirections(
  event: MouseEvent<HTMLAnchorElement>,
  target: DirectionsTarget,
  surface: DirectionsSurface,
  place: {
    name?: string
    address?: string
    coordinates?: readonly [number, number]
  },
  mode: NativeMapsTarget['mode'] = 'directions',
) {
  trackDirections(target, surface)
  const url = event.currentTarget.href
  if (!url) return
  const handled = openMapsNatively({
    mode,
    name: place.name?.trim() || undefined,
    address: place.address?.trim() || undefined,
    coordinates: place.coordinates
      ? [place.coordinates[0], place.coordinates[1]]
      : undefined,
    url,
  })
  if (handled) event.preventDefault()
}

/**
 * Copie avec un retour visible : une pastille « Adresse copiée » au bas de
 * l'écran, annoncée aux lecteurs d'écran. Le presse-papiers ne dit rien de
 * lui-même, et la feuille qui a lancé la copie vient souvent de se refermer.
 */
export function useCopyToast() {
  const { copy } = useClipboard()
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copyText = useCallback(
    async (text: string, confirmation = 'Copié') => {
      // Le presse-papiers peut refuser (WebView sans geste, permission) : on
      // ne confirme que ce qui a vraiment été copié. L'haptique vient de
      // `useClipboard`.
      const copied = await copy(text)
      if (timer.current) clearTimeout(timer.current)
      setFailed(!copied)
      setMessage(copied ? confirmation : 'Copie impossible')
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
            className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+104px)] z-[70] flex justify-center px-4"
          >
            {message && (
              <span className="bg-ink text-ink-foreground animate-pop flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold shadow-lg">
                {failed ? (
                  <X className="size-4" aria-hidden />
                ) : (
                  <Check className="size-4" aria-hidden />
                )}
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
