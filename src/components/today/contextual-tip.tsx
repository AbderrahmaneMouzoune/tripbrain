'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
  type SVGProps,
} from 'react'
import { createPortal } from 'react-dom'
import { readPreferences } from '@/lib/preferences'
import { trackEvent } from '@/lib/analytics/client'

/** Les trois astuces, dans l'ordre où on les découvre en général. */
export const TIP_IDS = ['long-press', 'swipe-days', 'documents'] as const
export type TipId = (typeof TIP_IDS)[number]

const TIP_ANALYTICS: Record<TipId, 'long_press' | 'swipe_days' | 'documents'> =
  {
    'long-press': 'long_press',
    'swipe-days': 'swipe_days',
    documents: 'documents',
  }

/**
 * Lit les préférences au moment même : le hook `usePreferences` démarre sur
 * les valeurs par défaut le temps de lire le stockage, et proposerait alors
 * toutes les astuces au premier rendu.
 */
export function tipAvailable(id: TipId): boolean {
  const preferences = readPreferences()
  return !preferences.tipsDismissed && !preferences.tipsSeen.includes(id)
}

/**
 * Une seule astuce spontanée par ouverture de l'app : la suivante attendra la
 * prochaine visite, ou le geste qui la justifie.
 */
let spontaneousTipShown = false
export function canShowSpontaneousTip(): boolean {
  return !spontaneousTipShown
}
export function noteSpontaneousTip(): void {
  spontaneousTipShown = true
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const BUBBLE_GAP = 14
const BUBBLE_ESTIMATED_HEIGHT = 210

/**
 * Astuce contextuelle : un voile couvre l'écran sauf l'élément concerné,
 * entouré d'orange, et une bulle l'explique. Le trou du voile est un cadre
 * posé à l'emplacement mesuré de l'élément, dans un portail : l'élément n'a
 * pas à se hisser au-dessus du voile, quel que soit son contexte d'empilement.
 */
export function ContextualTip({
  id,
  target,
  step,
  total = TIP_IDS.length,
  icon: Icon,
  iconClassName,
  title,
  body,
  onAcknowledge,
  onSkipAll,
}: {
  id: TipId
  target: RefObject<HTMLElement | null>
  step: number
  total?: number
  icon: ComponentType<SVGProps<SVGSVGElement>>
  iconClassName?: string
  title: string
  body: string
  onAcknowledge: () => void
  onSkipAll: () => void
}) {
  const [rect, setRect] = useState<Rect | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  const measure = useCallback(() => {
    const element = target.current
    if (!element) return
    const box = element.getBoundingClientRect()
    setRect({
      top: box.top,
      left: box.left,
      width: box.width,
      height: box.height,
    })
  }, [target])

  useLayoutEffect(() => {
    const element = target.current
    if (!element) return
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
    measure()
  }, [measure, target])

  useEffect(() => {
    let frame = 0
    const onChange = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    // Le voile est modal : la page ne défile plus sous la bulle.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
      document.body.style.overflow = previousOverflow
    }
  }, [measure])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const acknowledge = () => {
    trackEvent('contextual_tip_closed', {
      tip: TIP_ANALYTICS[id],
      outcome: 'acknowledged',
    })
    onAcknowledge()
  }
  const skipAll = () => {
    trackEvent('contextual_tip_closed', {
      tip: TIP_ANALYTICS[id],
      outcome: 'skipped_all',
    })
    onSkipAll()
  }

  if (typeof document === 'undefined' || !rect) return null

  const viewportHeight = window.innerHeight
  const below =
    rect.top + rect.height + BUBBLE_GAP + BUBBLE_ESTIMATED_HEIGHT <
    viewportHeight
  const arrowLeft = Math.max(28, Math.min(rect.left + 28, window.innerWidth - 48))

  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-[60]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') acknowledge()
      }}
    >
      {/* Voile percé autour de l'élément : l'ombre du cadre couvre le reste. */}
      <div
        aria-hidden
        className="ring-secondary pointer-events-auto absolute rounded-[14px] shadow-[0_0_0_200vmax_rgb(0_0_0/0.62)] ring-[3px] transition-[top,left,width,height] duration-200"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="bg-card text-card-foreground animate-pop absolute inset-x-4 mx-auto flex max-w-md flex-col gap-2.5 rounded-[20px] p-4 shadow-[0_16px_40px_rgb(0_0_0/0.35)]"
        style={
          below
            ? { top: rect.top + rect.height + BUBBLE_GAP }
            : { bottom: viewportHeight - rect.top + BUBBLE_GAP }
        }
      >
        <span
          aria-hidden
          className="bg-card absolute size-3.5 rotate-45"
          style={{
            left: arrowLeft - 16,
            ...(below ? { top: -7 } : { bottom: -7 }),
          }}
        />
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="bg-secondary-soft text-secondary-strong flex size-10 shrink-0 items-center justify-center rounded-full"
          >
            <Icon className={iconClassName ?? 'animate-wiggle size-5'} />
          </span>
          <div className="min-w-0">
            <p className="text-secondary-strong text-[11px] font-black tracking-[0.08em]">
              ASTUCE {step} SUR {total}
            </p>
            <p id={titleId} className="text-base font-black">
              {title}
            </p>
          </div>
        </div>
        <p
          id={bodyId}
          className="text-muted-foreground text-sm leading-relaxed"
        >
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={skipAll}
            className="text-muted-foreground pressable min-h-11 rounded-xl px-3.5 text-sm font-extrabold"
          >
            Passer les astuces
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={acknowledge}
            className="bg-primary text-primary-foreground pressable min-h-11 rounded-xl px-5 text-sm font-extrabold"
          >
            Compris
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
