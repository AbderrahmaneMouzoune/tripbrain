'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CachedImage } from '@/components/cached-image'

export interface LightboxItem {
  url: string
  alt: string
}

interface LightboxProps {
  images: LightboxItem[]
  isOpen: boolean
  onClose: () => void
}

/** Galerie plein écran : toutes les photos à la suite, Échap pour fermer. */
export function Lightbox({ images, isOpen, onClose }: LightboxProps) {
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
      onClick={onClose}
    >
      <Button
        variant="outline"
        size="icon-round"
        className="border-border bg-card absolute top-[calc(env(safe-area-inset-top)+12px)] right-4 z-10"
        onClick={onClose}
        aria-label="Fermer"
        autoFocus
      >
        <X />
      </Button>
      <div
        className="flex-1 overflow-y-auto px-4 py-16"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {images.map((image, index) => (
            <figure
              key={`${image.url}-${index}`}
              className="flex flex-col gap-1.5"
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
