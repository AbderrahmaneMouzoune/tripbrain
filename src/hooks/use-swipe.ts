import { useCallback, useRef } from 'react'

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
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
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
