'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

/**
 * Éléments qui gardent leur propre appui long : ouvrir un lien, choisir du
 * texte dans un champ. On leur laisse la main plutôt que de les recouvrir.
 */
const NATIVE_PRESS_SELECTOR =
  'a[href], input, textarea, select, [contenteditable="true"]'

export interface UseLongPressOptions {
  /** Appelé quand l'appui a duré assez longtemps sans se déplacer */
  onLongPress: () => void
  /** Durée du maintien, en millisecondes */
  delay?: number
  /** Déplacement au-delà duquel le geste devient un défilement, en pixels */
  moveTolerance?: number
  /** Rend le geste inerte (rien à proposer sur cet élément, par exemple) */
  disabled?: boolean
}

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onPointerLeave: () => void
  onPointerCancel: () => void
  onContextMenu: (event: ReactMouseEvent) => void
  onClickCapture: (event: ReactMouseEvent) => void
}

/**
 * Détecte un appui maintenu, à la souris comme au doigt.
 *
 * Le geste est abandonné dès que le pointeur s'éloigne : sur mobile, un appui
 * qui glisse est un défilement, pas une intention d'ouvrir quelque chose. Le
 * clic qui suit le déclenchement est étouffé, faute de quoi relâcher le doigt
 * activerait aussi ce qui se trouve dessous (un accordéon, un lien).
 *
 * `contextmenu` sert de second chemin : clic droit sur ordinateur, touche
 * « menu » au clavier, et remplacement du menu natif d'Android.
 */
export function useLongPress({
  onLongPress,
  delay = 450,
  moveTolerance = 12,
  disabled = false,
}: UseLongPressOptions): { pressed: boolean; handlers: LongPressHandlers } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  /** Vrai entre le déclenchement et le clic qui suit, le temps de l'étouffer. */
  const triggered = useRef(false)
  const [pressed, setPressed] = useState(false)

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
    setPressed(false)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const trigger = useCallback(() => {
    stop()
    triggered.current = true
    // Retour haptique là où il existe : l'appui long n'a aucun autre signal.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12)
    }
    onLongPress()
  }, [onLongPress, stop])

  const onPointerDown = (event: ReactPointerEvent) => {
    if (disabled) return

    triggered.current = false

    // Le clic droit passe par `contextmenu` ; les autres boutons ne nous
    // concernent pas.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (isNativePressTarget(event.target)) return

    origin.current = { x: event.clientX, y: event.clientY }
    setPressed(true)
    timer.current = setTimeout(trigger, delay)
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const start = origin.current
    if (!start) return

    const distance = Math.hypot(
      event.clientX - start.x,
      event.clientY - start.y,
    )
    if (distance > moveTolerance) stop()
  }

  const onContextMenu = (event: ReactMouseEvent) => {
    if (disabled || isNativePressTarget(event.target)) return

    event.preventDefault()
    if (triggered.current) return

    trigger()
  }

  const onClickCapture = (event: ReactMouseEvent) => {
    if (!triggered.current) return

    triggered.current = false
    // Une activation au clavier (`detail` à 0) n'a rien à voir avec l'appui
    // long qui vient d'avoir lieu : elle doit passer.
    if (event.detail === 0) return

    event.preventDefault()
    event.stopPropagation()
  }

  return {
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
      onContextMenu,
      onClickCapture,
    },
  }
}

function isNativePressTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(NATIVE_PRESS_SELECTOR) !== null
  )
}
