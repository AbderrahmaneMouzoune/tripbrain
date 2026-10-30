import { useCallback, useRef } from 'react'
import { getNativeApp } from '@/lib/native-app'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Distance horizontale minimale, en pixels (60 par défaut). */
  threshold?: number
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/**
 * Zones qui défilent elles-mêmes à l'horizontale (bande des jours, carrousel
 * de photos) : un geste qui y commence leur appartient.
 */
const SWIPE_IGNORE_SELECTOR = '[data-swipe-ignore]'

/**
 * Bande du bord gauche réservée, dans l'app iOS, au geste retour du système :
 * un balayage qui y commence ferme l'écran au lieu de changer de journée.
 */
export const IOS_BACK_EDGE_PX = 24

/** Le geste commence-t-il dans la zone du retour système (app iOS seulement) ? */
export function startsInBackEdge(
  clientX: number,
  platform: string | undefined,
): boolean {
  return platform === 'ios' && clientX < IOS_BACK_EDGE_PX
}

/**
 * Détecte un balayage horizontal. Un geste plus vertical qu'horizontal est un
 * défilement de la page : il est ignoré.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
}: UseSwipeOptions): SwipeHandlers {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target
    if (
      target instanceof Element &&
      target.closest(SWIPE_IGNORE_SELECTOR) !== null
    ) {
      touchStartX.current = null
      touchStartY.current = null
      return
    }
    const touch = e.touches[0]
    if (startsInBackEdge(touch.clientX, getNativeApp()?.platform)) {
      touchStartX.current = null
      touchStartY.current = null
      return
    }
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return

      const deltaX = e.changedTouches[0].clientX - touchStartX.current
      const deltaY = e.changedTouches[0].clientY - touchStartY.current

      touchStartX.current = null
      touchStartY.current = null

      if (Math.abs(deltaY) > Math.abs(deltaX)) return

      if (deltaX < -threshold) {
        onSwipeLeft?.()
      } else if (deltaX > threshold) {
        onSwipeRight?.()
      }
    },
    [onSwipeLeft, onSwipeRight, threshold],
  )

  return { onTouchStart, onTouchEnd }
}
