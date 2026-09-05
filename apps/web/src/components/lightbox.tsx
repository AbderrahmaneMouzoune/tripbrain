'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
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

export function Lightbox({ images, isOpen, onClose }: LightboxProps) {
  if (!isOpen) return null

  return (
    <div
      className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-sm"
      onClick={onClose}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10"
        onClick={onClose}
        aria-label="Fermer"
      >
        <X className="h-5 w-5" />
      </Button>
      <div
        className="flex-1 overflow-y-auto px-4 py-14"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {images.map((img, i) => (
            <CachedImage
              key={i}
              src={img.url}
              alt={img.alt}
              className="w-full rounded-xl object-contain"
              fallbackClassName="w-full rounded-xl min-h-40"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
