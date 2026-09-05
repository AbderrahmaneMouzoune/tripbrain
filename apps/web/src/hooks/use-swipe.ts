import { useCallback, useRef } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Minimum horizontal distance in px to trigger a swipe (default: 60) */
  threshold?: number
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/**
 * Returns touch event handlers to detect horizontal swipe gestures.
 * Swipes that are more vertical than horizontal are ignored to avoid
 * conflicting with normal scrolling.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
}: UseSwipeOptions): SwipeHandlers {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
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

      // Ignore swipes that are predominantly vertical (scrolling)
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
