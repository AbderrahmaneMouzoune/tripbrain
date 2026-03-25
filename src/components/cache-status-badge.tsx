'use client'

import { type ReactNode } from 'react'
import { Download, CheckCircle2, AlertCircle, WifiOff } from 'lucide-react'
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
 * | State                    | Icon           | Colour  |
 * |--------------------------|----------------|---------|
 * | Downloading / pending    | Download pulse | muted   |
 * | All images cached        | Check circle   | emerald |
 * | Some errors, rest cached | Alert circle   | amber   |
 */
export function CacheStatusBadge() {
  const { stats } = useImageCacheContext()

  if (stats.total === 0) return null

  const isActive = stats.downloading > 0 || stats.pending > 0
  const allCached = stats.cached === stats.total && stats.error === 0
  const hasErrors = stats.error > 0
  const progress = stats.total > 0 ? Math.round((stats.cached / stats.total) * 100) : 0

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
        <Download className="h-4 w-4 animate-pulse" strokeWidth={1.75} />
      </Button>
    )
    popoverContent = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Download className="text-muted-foreground h-4 w-4 shrink-0 animate-pulse" strokeWidth={1.75} />
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
          Certaines images n&apos;ont pas pu être téléchargées. Elles
          s&apos;afficheront normalement si vous êtes connecté.
        </p>
        <div className="flex flex-col gap-1.5">
          <Progress value={progress} className="h-1.5" />
          <p className="text-muted-foreground text-xs">
            {stats.cached} / {stats.total} images en cache
            {stats.error > 0 && (
              <span className="text-amber-500"> — {stats.error} erreur{stats.error > 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
      </div>
    )
  } else {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 text-sm">
        {popoverContent}
      </PopoverContent>
    </Popover>
  )
}
