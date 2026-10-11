'use client'

import { Image as ImageIcon } from 'lucide-react'
import type { StoredFile } from '@/lib/documents-db'
import {
  documentCategory,
  fileFormatLabel,
  type DocumentCategory,
} from '@/lib/document-organize'
import { cn } from '@/lib/utils'

const TONES: Record<
  DocumentCategory,
  { tile: string; strong: string; soft: string; text: string }
> = {
  ticket: {
    tile: 'bg-primary-soft border-border-strong',
    strong: 'bg-primary',
    soft: 'bg-border-strong',
    text: 'text-primary-strong',
  },
  hotel: {
    tile: 'bg-secondary-soft border-secondary/40',
    strong: 'bg-secondary',
    soft: 'bg-secondary/35',
    text: 'text-secondary-strong',
  },
  identity: {
    tile: 'bg-success-soft border-success/30',
    strong: 'bg-success',
    soft: 'bg-success/30',
    text: 'text-success',
  },
  other: {
    tile: 'bg-background border-border-strong',
    strong: 'bg-muted-foreground',
    soft: 'bg-border',
    text: 'text-muted-foreground',
  },
}

/**
 * Vignette d'un document : la vraie image quand c'en est une, sinon une
 * petite page stylisée à la couleur de sa famille, avec son format.
 */
export function DocumentThumb({
  file,
  previewUrl,
  size = 'sm',
  className,
}: {
  file: Pick<StoredFile, 'name' | 'type' | 'linkedTo'>
  previewUrl?: string | null
  size?: 'sm' | 'lg'
  className?: string
}) {
  const format = fileFormatLabel(file)
  const box =
    size === 'sm' ? 'h-[46px] w-10 rounded-[9px]' : 'h-full w-full rounded-2xl'

  if (previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={previewUrl}
        alt=""
        aria-hidden
        className={cn(
          'border-border bg-muted shrink-0 border object-cover',
          box,
          className,
        )}
      />
    )
  }

  if (file.type.startsWith('image/')) {
    return (
      <span
        aria-hidden
        className={cn(
          'bg-accent-soft border-accent/30 text-accent flex shrink-0 flex-col items-center justify-between border p-1',
          box,
          className,
        )}
      >
        <ImageIcon className={size === 'sm' ? 'mt-1 size-4' : 'mt-6 size-8'} />
        <span className="font-mono text-[9px] font-semibold">{format}</span>
      </span>
    )
  }

  const tone = TONES[documentCategory(file)]
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 flex-col gap-[3px] border',
        size === 'sm' ? 'px-1.5 pt-[7px] pb-1' : 'gap-2 p-4',
        tone.tile,
        box,
        className,
      )}
    >
      <span
        className={cn(
          'h-[3px] w-[70%] rounded-full',
          tone.strong,
          size === 'lg' && 'h-2',
        )}
      />
      <span
        className={cn(
          'h-[3px] w-full rounded-full',
          tone.soft,
          size === 'lg' && 'h-1.5',
        )}
      />
      <span
        className={cn(
          'h-[3px] w-[80%] rounded-full',
          tone.soft,
          size === 'lg' && 'h-1.5',
        )}
      />
      <span
        className={cn(
          'mt-auto font-mono font-semibold',
          size === 'sm' ? 'text-[9px]' : 'text-xs',
          tone.text,
        )}
      >
        {format}
      </span>
    </span>
  )
}
