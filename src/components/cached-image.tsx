'use client'

import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useImageCacheContext } from '@/components/image-cache-provider'

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  /** Optional className applied to the fallback placeholder (defaults to `className`) */
  fallbackClassName?: string
}

/**
 * Smart image component that leverages the image cache.
 *
 * - If the image is cached locally (IndexedDB), it is displayed via a blob
 *   object URL — no network request needed, works fully offline.
 * - If the image is not yet cached, it loads from the original network URL
 *   (same behaviour as a plain `<img>`).
 * - If loading fails (e.g. device is offline and image was never cached),
 *   a visual placeholder is shown instead of a broken image icon.
 *
 * Must be rendered inside an `<ImageCacheProvider>`.
 */
export function CachedImage({
  src,
  alt,
  className,
  fallbackClassName,
  ...props
}: CachedImageProps) {
  const { cachedSrcs } = useImageCacheContext()
  const [imgError, setImgError] = useState(false)

  // Use the cached blob URL when available; otherwise fall back to the
  // original URL so the image still loads while caching is in progress.
  const displaySrc = cachedSrcs[src] ?? src

  if (imgError) {
    return (
      <div
        className={cn(
          'bg-muted flex flex-col items-center justify-center gap-2',
          fallbackClassName ?? className,
        )}
        role="img"
        aria-label={alt}
      >
        <ImageIcon
          className="text-muted-foreground/40 h-8 w-8"
          strokeWidth={1.5}
        />
        <span className="text-muted-foreground/50 text-xs">Non disponible</span>
      </div>
    )
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
      {...props}
    />
  )
}
