'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CachedImage } from '@/components/cached-image'
import { triggerHaptic } from '@/lib/native-app'

export interface LightboxItem {
  url: string
  alt: string
}

interface LightboxProps {
  images: LightboxItem[]
  isOpen: boolean
  onClose: () => void
  /** Photo touchée : la galerie s'ouvre dessus plutôt qu'en haut de la liste. */
  startIndex?: number
}

/** Glissement vers le bas, en pixels, qui ferme la galerie. */
export const LIGHTBOX_DISMISS_PX = 96

/** Durée pendant laquelle la photo touchée reste épinglée en haut. */
export const LIGHTBOX_PIN_MS = 2000

/**
 * Faut-il ramener la photo touchée en haut ? Les photos au-dessus n'ont pas
 * de hauteur réservée : en se chargeant, elles la poussent vers le bas. On la
 * replace tant que l'utilisateur n'a pas touché la liste, pendant un temps
 * borné.
 */
export function shouldRepinLightboxPhoto(
  userHasScrolled: boolean,
  elapsedMs: number,
): boolean {
  return !userHasScrolled && elapsedMs < LIGHTBOX_PIN_MS
}

/**
 * Le geste ferme-t-il la galerie ? Il doit descendre franchement, plus qu'il
 * ne va de côté, et commencer en haut de la liste (sinon c'est un défilement).
 */
export function shouldDismissLightbox(
  deltaX: number,
  deltaY: number,
  startedAtTop: boolean,
): boolean {
  return (
    startedAtTop && deltaY > LIGHTBOX_DISMISS_PX && deltaY > Math.abs(deltaX)
  )
}

/**
 * Galerie plein écran : toutes les photos à la suite, ouverte sur la photo
 * touchée. Échap, la croix, un tap à côté ou un glissement vers le bas la
 * ferment.
 */
export function Lightbox({
  images,
  isOpen,
  onClose,
  startIndex = 0,
}: LightboxProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // Vrai dès que l'utilisateur touche ou fait défiler la liste : on cesse
  // alors de ramener la photo touchée en haut.
  const userScrolled = useRef(false)
  const gesture = useRef<{ x: number; y: number; atTop: boolean } | null>(null)
  const [dragY, setDragY] = useState(0)

  // À l'ouverture, on amène la photo touchée en haut de l'écran, et on l'y
  // maintient pendant que les photos au-dessus se chargent.
  useEffect(() => {
    if (!isOpen) return
    setDragY(0)
    userScrolled.current = false
    if (startIndex <= 0) return
    const openedAt = performance.now()
    const pin = () => {
      if (
        !shouldRepinLightboxPhoto(
          userScrolled.current,
          performance.now() - openedAt,
        )
      ) {
        return false
      }
      scroller.current
        ?.querySelector<HTMLElement>(`[data-photo-index="${startIndex}"]`)
        ?.scrollIntoView({ block: 'start' })
      return true
    }
    const frame = requestAnimationFrame(pin)
    // Chaque photo qui se charge (ou passe en repli) change la hauteur de la
    // liste : on replace alors la photo touchée.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (!pin()) observer?.disconnect()
          })
    if (list.current) observer?.observe(list.current)
    const stop = window.setTimeout(
      () => observer?.disconnect(),
      LIGHTBOX_PIN_MS,
    )
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(stop)
      observer?.disconnect()
    }
  }, [isOpen, startIndex])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || typeof document === 'undefined') return null

  // Rendue dans un portail : les écrans empilés posent leur propre contexte
  // d'empilement, la galerie doit passer au-dessus de tout.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photos"
      className="bg-background/95 animate-fade fixed inset-0 z-[65] flex flex-col backdrop-blur-sm"
      style={
        dragY > 0 ? { opacity: Math.max(0.35, 1 - dragY / 400) } : undefined
      }
      onClick={onClose}
    >
      <Button
        variant="outline"
        size="icon-round"
        className="border-border bg-card absolute top-[calc(var(--safe-top)+12px)] right-4 z-10"
        onClick={onClose}
        aria-label="Fermer"
        autoFocus
      >
        <X />
      </Button>
      <div
        ref={scroller}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-16"
        onClick={(event) => event.stopPropagation()}
        onWheel={() => {
          userScrolled.current = true
        }}
        onTouchStart={(event) => {
          userScrolled.current = true
          const touch = event.touches[0]
          gesture.current =
            event.touches.length === 1
              ? {
                  x: touch.clientX,
                  y: touch.clientY,
                  atTop: (scroller.current?.scrollTop ?? 0) <= 0,
                }
              : null
        }}
        onTouchMove={(event) => {
          const start = gesture.current
          if (!start?.atTop || event.touches.length !== 1) return
          const delta = event.touches[0].clientY - start.y
          setDragY(delta > 0 ? delta : 0)
        }}
        onTouchEnd={(event) => {
          const start = gesture.current
          gesture.current = null
          setDragY(0)
          if (!start) return
          const touch = event.changedTouches[0]
          if (
            shouldDismissLightbox(
              touch.clientX - start.x,
              touch.clientY - start.y,
              start.atTop,
            )
          ) {
            triggerHaptic('selection')
            onClose()
          }
        }}
        onTouchCancel={() => {
          gesture.current = null
          setDragY(0)
        }}
      >
        <div
          ref={list}
          className="mx-auto flex max-w-2xl flex-col gap-3"
          style={
            dragY > 0
              ? { transform: `translateY(${dragY * 0.6}px)` }
              : undefined
          }
        >
          {images.map((image, index) => (
            <figure
              key={`${image.url}-${index}`}
              data-photo-index={index}
              className="flex scroll-mt-16 flex-col gap-1.5"
            >
              <CachedImage
                src={image.url}
                alt={image.alt}
                className="w-full rounded-2xl object-contain"
                fallbackClassName="w-full rounded-2xl min-h-40"
              />
              {image.alt && (
                <figcaption className="text-muted-foreground text-sm font-bold">
                  {image.alt}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
