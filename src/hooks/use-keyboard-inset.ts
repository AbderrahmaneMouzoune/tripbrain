'use client'

import { useEffect } from 'react'
import { isInsideNativeApp } from '@/lib/native-app'

/** Délai de l'animation du clavier avant de recentrer le champ. */
const KEYBOARD_SETTLE_MS = 300

/** Marge sous le champ pour qu'il ne colle pas au bord du clavier. */
const FIELD_MARGIN_PX = 16

/** Hauteur de la page masquée par le clavier (0 sans clavier). */
export function keyboardInset(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
): number {
  return Math.max(
    0,
    Math.round(innerHeight - viewportHeight - viewportOffsetTop),
  )
}

function isTextField(target: EventTarget | null): target is HTMLElement {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (!(target instanceof HTMLInputElement)) return false
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(target.type)
}

/**
 * Dans l'app native, suit le clavier à l'écran : `--keyboard-inset` sur
 * `<html>` (px masqués, 0 sans clavier) pour borner les calques plein écran,
 * et le champ qui prend le focus est recentré s'il finit sous le clavier.
 *
 * Sans effet dans Safari et en PWA, où le navigateur s'en charge déjà.
 */
export function useKeyboardInset() {
  useEffect(() => {
    if (!isInsideNativeApp()) return
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement

    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const inset = keyboardInset(
          window.innerHeight,
          viewport.height,
          viewport.offsetTop,
        )
        root.style.setProperty('--keyboard-inset', `${inset}px`)
      })
    }

    let settle: ReturnType<typeof setTimeout> | undefined
    const onFocusIn = (event: FocusEvent) => {
      const field = event.target
      if (!isTextField(field)) return
      clearTimeout(settle)
      settle = setTimeout(() => {
        if (document.activeElement !== field) return
        const rect = field.getBoundingClientRect()
        const visibleTop = viewport.offsetTop
        const visibleBottom = viewport.offsetTop + viewport.height
        if (
          rect.bottom + FIELD_MARGIN_PX > visibleBottom ||
          rect.top < visibleTop
        ) {
          field.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }, KEYBOARD_SETTLE_MS)
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.removeEventListener('focusin', onFocusIn)
      root.style.removeProperty('--keyboard-inset')
    }
  }, [])
}
