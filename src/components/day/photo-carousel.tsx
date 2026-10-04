'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CachedImage } from '@/components/cached-image'
import { Lightbox } from '@/components/lightbox'

export interface CarouselPhoto {
  url: string
  caption: string
}

/**
 * Carrousel de photos à défilement natif (accroche par photo) : la suivante
 * dépasse sur le bord pour inviter au geste. Un toucher ouvre la galerie.
 */
export function PhotoCarousel({
  photos,
  label,
  className,
}: {
  photos: CarouselPhoto[]
  label: string
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const [open, setOpen] = useState(false)

  if (photos.length === 0) return null

  const onScroll = () => {
    const container = scroller.current
    const first = container?.firstElementChild as HTMLElement | null
    if (!container || !first) return
    const step = first.offsetWidth + 10
    setCurrent(
      Math.min(photos.length - 1, Math.round(container.scrollLeft / step)),
    )
  }

  return (
    <section
      aria-label={label}
      data-swipe-ignore
      className={cn('relative', className)}
    >
      <Lightbox
        images={photos.map((photo) => ({ url: photo.url, alt: photo.caption }))}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, index) => (
          <button
            key={`${photo.url}-${index}`}
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Agrandir la photo ${index + 1} sur ${photos.length}${photo.caption ? ` : ${photo.caption}` : ''}`}
            className={cn(
              'bg-primary-soft relative aspect-[304/166] shrink-0 snap-start overflow-hidden rounded-[22px]',
              photos.length > 1 ? 'w-[78%]' : 'w-full',
            )}
          >
            <CachedImage
              src={photo.url}
              alt={photo.caption}
              loading={index > 1 ? 'lazy' : undefined}
              className="h-full w-full object-cover"
              fallbackClassName="h-full w-full"
            />
            {photo.caption && (
              <span className="bg-card/90 text-foreground absolute top-3 left-3 flex max-w-[80%] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-extrabold">
                <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{photo.caption}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <span
            aria-hidden
            className="bg-ink/75 text-ink-foreground pointer-events-none absolute top-3 right-[calc(22%+12px)] rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums"
          >
            {current + 1} / {photos.length}
          </span>
          <div
            aria-hidden
            className="pointer-events-none mt-2 flex justify-center gap-1.5"
          >
            {photos.map((photo, index) => (
              <span
                key={`${photo.url}-dot-${index}`}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  index === current ? 'bg-primary w-[18px]' : 'bg-border-strong w-1.5',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
