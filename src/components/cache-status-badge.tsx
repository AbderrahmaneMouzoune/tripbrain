'use client'

import { Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImageCacheContext } from '@/components/image-cache-provider'

/**
 * Compact header badge that reflects the current state of the image cache.
 *
 * | State                        | Icon              | Colour  |
 * |------------------------------|-------------------|---------|
 * | Downloading / pending        | Animated download | muted   |
 * | All images cached            | Check circle      | emerald |
 * | Some errors, rest cached     | Alert circle      | amber   |
 *
 * The button `title` attribute provides a detailed tooltip with counts.
 * Returns `null` when there are no images to cache (e.g. no itinerary loaded).
 */
export function CacheStatusBadge() {
  const { stats } = useImageCacheContext()

  if (stats.total === 0) return null

  const isActive = stats.downloading > 0 || stats.pending > 0
  const allCached = stats.cached === stats.total && stats.error === 0
  const hasErrors = stats.error > 0

  if (allCached) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-emerald-500 hover:text-emerald-500 h-8 w-8"
        aria-label={`${stats.cached} images disponibles hors ligne`}
        title={`Toutes les images sont disponibles hors ligne (${stats.cached}/${stats.total})`}
      >
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
      </Button>
    )
  }

  if (isActive) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground h-8 w-8"
        aria-label={`Mise en cache des images : ${stats.cached}/${stats.total}`}
        title={`Mise en cache des images pour accès hors ligne : ${stats.cached}/${stats.total}`}
      >
        <Download className="h-4 w-4 animate-bounce" strokeWidth={1.75} />
      </Button>
    )
  }

  if (hasErrors) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-amber-500 hover:text-amber-500 h-8 w-8"
        aria-label={`${stats.error} image(s) non disponibles hors ligne`}
        title={`${stats.cached}/${stats.total} images en cache — ${stats.error} erreur(s)`}
      >
        <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
      </Button>
    )
  }

  return null
}
