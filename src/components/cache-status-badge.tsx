'use client'

import { type ReactNode, useState, useEffect } from 'react'
import {
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  RefreshCw,
  X,
  ImageOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useImageCacheContext } from '@/components/image-cache-provider'
import type { ImageStatus } from '@/hooks/use-image-cache'

/**
 * Small thumbnail that renders the image's original URL.
 * Falls back to an icon when the network is unavailable.
 */
function ImagePreview({ url }: { url: string }) {
  const [errored, setErrored] = useState(false)
  return errored ? (
    <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center rounded">
      <ImageOff className="text-muted-foreground h-5 w-5" />
    </div>
  ) : (
    <img
      src={url}
      alt=""
      className="h-12 w-12 shrink-0 rounded object-cover"
      onError={() => setErrored(true)}
    />
  )
}

/**
 * Per-image status indicator + retry button shown in the error dialog.
 */
function ImageRowActions({
  url,
  status,
  onRetry,
}: {
  url: string
  status: ImageStatus
  onRetry: (url: string) => void
}) {
  if (status === 'cached') {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.75} />
  }
  if (status === 'downloading' || status === 'pending') {
    return <RefreshCw className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => onRetry(url)}
    >
      <RefreshCw className="h-3 w-3" />
      Réessayer
    </Button>
  )
}

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
  const { stats, statuses, retryErrors, retrySingle } = useImageCacheContext()
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const isActive = stats.downloading > 0 || stats.pending > 0
  const allCached = stats.cached === stats.total && stats.error === 0
  // Only show the error state when no download is in progress
  const hasErrors = stats.error > 0 && !isActive
  const progress = stats.total > 0 ? Math.round((stats.cached / stats.total) * 100) : 0

  // Clear the retrying flag as soon as the hook transitions into active download
  useEffect(() => {
    if (retrying && isActive) setRetrying(false)
  }, [retrying, isActive])

  // Close the dialog automatically when all errors are resolved
  useEffect(() => {
    if (dialogOpen && stats.error === 0 && !isActive) setDialogOpen(false)
  }, [dialogOpen, stats.error, isActive])

  // Re-show future error states after the current errors have been cleared
  useEffect(() => {
    if (stats.error === 0 && dismissed) setDismissed(false)
  }, [stats.error, dismissed])
  if (stats.total === 0) return null
  if (dismissed && hasErrors) return null

  const errorUrls = Object.entries(statuses)
    .filter(([, s]) => s === 'error')
    .map(([url]) => url)

  // URLs that are currently in progress (pending/downloading). These are
  // included alongside errors so in-flight work remains visible in the dialog.
  const retryingUrls = Object.entries(statuses)
    .filter(([, s]) => s === 'downloading' || s === 'pending')
    .map(([url]) => url)

  // Full list shown in dialog: current errors + URLs currently in progress.
  // This reflects the current statuses only; retry history is not tracked here.
  const dialogUrls = [...new Set([...errorUrls, ...retryingUrls])]

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
              setOpen(false)
              setDialogOpen(true)
            }}
          >
            <AlertCircle className="h-3 w-3" />
            Voir le détail
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
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" className="w-72 text-sm">
          {popoverContent}
        </PopoverContent>
      </Popover>

      {/* Error detail dialog — only rendered in the error state */}
      {hasErrors || dialogOpen ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.75} />
                Images non disponibles
              </DialogTitle>
              <DialogDescription>
                {stats.error} image{stats.error > 1 ? 's' : ''} n&apos;ont pas pu être
                téléchargées. Vérifiez votre connexion, puis réessayez.
              </DialogDescription>
            </DialogHeader>

            <ul className="flex-1 overflow-y-auto divide-y px-6">
              {dialogUrls.map((url) => {
                const status = statuses[url] ?? 'error'
                return (
                  <li key={url} className="flex items-center gap-3 py-3">
                    <ImagePreview url={url} />
                    <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                      {url}
                    </p>
                    <ImageRowActions
                      url={url}
                      status={status}
                      onRetry={retrySingle}
                    />
                  </li>
                )
              })}
            </ul>

            <DialogFooter className="border-t px-6 py-4">
              <Button
                variant="ghost"
                className="text-muted-foreground gap-1.5 text-sm"
                onClick={() => {
                  setDismissed(true)
                  setDialogOpen(false)
                }}
              >
                <X className="h-4 w-4" />
                Ignorer
              </Button>
              <Button
                variant="outline"
                disabled={retrying}
                className="gap-1.5 text-sm"
                onClick={() => {
                  setRetrying(true)
                  retryErrors()
                }}
              >
                <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Reprise…' : 'Réessayer tout'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
