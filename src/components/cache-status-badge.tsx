'use client'

import { type ReactNode, useState } from 'react'
import { CloudDownload, CheckCircle2, AlertCircle, WifiOff, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { useImageCacheContext } from '@/components/image-cache-provider'

/**
 * Compact header badge that reflects the current state of the image cache.
 * Clicking the badge opens a popover with a detailed explanation.
 *
 * | State                    | Icon                | Colour  |
 * |--------------------------|---------------------|---------|
 * | Downloading / pending    | CloudDownload pulse | muted   |
 * | All images cached        | WifiOff             | emerald |
 * | Some errors, rest cached | Alert circle        | amber   |
 */
export function CacheStatusBadge() {
  const { stats, retryErrors } = useImageCacheContext()
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)

  if (stats.total === 0) return null

  const isActive = stats.downloading > 0 || stats.pending > 0
  const allCached = stats.cached === stats.total && stats.error === 0
  // Only show the error state when no download is in progress
  const hasErrors = stats.error > 0 && !isActive
  const progress = stats.total > 0 ? Math.round((stats.cached / stats.total) * 100) : 0

  if (dismissed && hasErrors) return null

  let trigger: ReactNode
  let popoverContent: ReactNode

  if (allCached) {
    trigger = (
      <Button
        variant="ghost"
        size="icon"
        className="text-emerald-500 hover:text-emerald-500 h-8 w-8"
        aria-label="Images disponibles hors ligne"
      >
        <WifiOff className="h-4 w-4" strokeWidth={1.75} />
      </Button>
    )
    popoverContent = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.75} />
          <p className="text-sm font-semibold">Images disponibles hors ligne</p>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Toutes les photos du voyage sont stockées sur cet appareil et
          accessibles sans connexion internet.
        </p>
        <p className="text-muted-foreground text-xs">
          {stats.cached} / {stats.total} images en cache
        </p>
      </div>
    )
  } else if (isActive) {
    trigger = (
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground h-8 w-8"
        aria-label={`Mise en cache : ${stats.cached}/${stats.total} images`}
      >
        <CloudDownload className="h-4 w-4 animate-pulse" strokeWidth={1.75} />
      </Button>
    )
    popoverContent = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CloudDownload className="text-muted-foreground h-4 w-4 shrink-0 animate-pulse" strokeWidth={1.75} />
          <p className="text-sm font-semibold">Mise en cache des images…</p>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Les photos du voyage sont téléchargées en arrière-plan pour être
          accessibles sans connexion internet.
        </p>
        <div className="flex flex-col gap-1.5">
          <Progress value={progress} className="h-1.5" />
          <p className="text-muted-foreground text-xs">
            {stats.cached} / {stats.total} images
            {stats.downloading > 0 && (
              <span> — {stats.downloading} en cours</span>
            )}
          </p>
        </div>
      </div>
    )
  } else if (hasErrors) {
    trigger = (
      <Button
        variant="ghost"
        size="icon"
        className="text-amber-500 hover:text-amber-500 h-8 w-8"
        aria-label={`${stats.error} image(s) non disponibles hors ligne`}
      >
        <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
      </Button>
    )
    popoverContent = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.75} />
          <p className="text-sm font-semibold">Mise en cache partielle</p>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {stats.error} image{stats.error > 1 ? 's' : ''} n&apos;ont pas pu
          être téléchargées. Elles s&apos;afficheront si vous êtes connecté.
        </p>
        <div className="flex flex-col gap-1.5">
          <Progress value={progress} className="h-1.5" />
          <p className="text-muted-foreground text-xs">
            {stats.cached} / {stats.total} images en cache
            <span className="text-amber-500">
              {' '}— {stats.error} erreur{stats.error > 1 ? 's' : ''}
            </span>
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 gap-1.5 text-xs"
            onClick={() => {
              retryErrors()
              setOpen(false)
            }}
          >
            <RefreshCw className="h-3 w-3" />
            Réessayer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 flex-1 gap-1.5 text-xs"
            onClick={() => {
              setDismissed(true)
              setOpen(false)
            }}
          >
            <X className="h-3 w-3" />
            Ignorer
          </Button>
        </div>
      </div>
    )
  } else {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 text-sm">
        {popoverContent}
      </PopoverContent>
    </Popover>
  )
}
