'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck,
  CircleCheck,
  Database,
  Download,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { IconBadge } from '@/components/mobile/icon-badge'
import { SectionTitle } from '@/components/mobile/section-title'
import { ToggleSwitch } from '@/components/mobile/toggle-switch'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useImageCacheContext } from '@/components/image-cache-provider'
import { useDocuments } from '@/hooks/use-documents'
import { usePreferences } from '@/hooks/use-preferences'
import { cacheState, type CacheState } from '@/hooks/use-image-cache'
import { trackEvent } from '@/lib/analytics/client'
import { formatFileSize, missingDocuments } from '@/lib/document-organize'
import { cn } from '@/lib/utils'

const STATE_COPY: Record<
  CacheState,
  { pill: string; title: string; tone: string; dot: string }
> = {
  complete: {
    pill: 'Complet',
    title: 'Tout est sur ce téléphone',
    tone: 'bg-success-soft text-success',
    dot: 'bg-success',
  },
  partial: {
    pill: 'Partiel',
    title: 'Mise en cache partielle',
    tone: 'bg-secondary-soft text-secondary-strong',
    dot: 'bg-secondary',
  },
  downloading: {
    pill: 'En cours',
    title: 'Téléchargement en cours',
    tone: 'bg-primary-soft text-primary-strong',
    dot: 'bg-primary animate-halo',
  },
  empty: {
    pill: 'Complet',
    title: 'Rien à télécharger',
    tone: 'bg-success-soft text-success',
    dot: 'bg-success',
  },
}

/** Espace occupé par l'application sur l'appareil, quand le navigateur le dit. */
export function useStorageEstimate() {
  const [usage, setUsage] = useState<number | null | undefined>(undefined)
  const refresh = useCallback(async () => {
    try {
      if (!navigator.storage?.estimate) {
        setUsage(null)
        return
      }
      const estimate = await navigator.storage.estimate()
      setUsage(estimate.usage ?? null)
    } catch {
      setUsage(null)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { usage, refresh }
}

/** Jauge circulaire : part des images enregistrées. */
function Gauge({ cached, total }: { cached: number; total: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const ratio = total === 0 ? 1 : cached / total
  return (
    <div
      role="img"
      aria-label={`${cached} images sur ${total} enregistrées sur le téléphone`}
      className="relative size-[120px] shrink-0"
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className={cn(
            'transition-[stroke-dashoffset] duration-700',
            ratio >= 1 ? 'stroke-success' : 'stroke-primary',
          )}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] leading-none font-black tabular-nums">
          {cached}
          <span className="text-muted-foreground text-[15px]">/{total}</span>
        </span>
        <span className="text-muted-foreground mt-0.5 text-xs font-extrabold">
          images
        </span>
      </span>
    </div>
  )
}

/** « Disponible hors ligne » : ce qui est sur le téléphone, et ce qui manque. */
export function OfflineScreen({ onClose }: ScreenProps<'offline'>) {
  const { itinerary } = useTrip()
  const { files } = useDocuments()
  const { preferences, update } = usePreferences()
  const {
    stats,
    paused,
    connectionTypeKnown,
    retryErrors,
    downloadNow,
    clearCache,
  } = useImageCacheContext()
  const { usage, refresh } = useStorageEstimate()
  const [confirmClear, setConfirmClear] = useState(false)

  const state = cacheState(stats)
  const copy = STATE_COPY[state]
  const missing = stats.total - stats.cached
  const counts = useMemo(() => missingDocuments(itinerary, []), [itinerary])

  // L'espace occupé change à mesure que les photos arrivent.
  useEffect(() => {
    void refresh()
  }, [stats.cached, refresh])

  let summary: string
  if (paused === 'waiting-for-wifi' && missing > 0) {
    summary = `En attente du Wi-Fi : ${missing} photo${missing > 1 ? 's' : ''} restent à télécharger.`
  } else if (paused === 'cleared' && missing > 0) {
    summary =
      'Cache vidé. Le programme marche toujours sans réseau ; les photos reviendront à la demande.'
  } else if (state === 'complete' || state === 'empty') {
    summary = 'Programme, adresses, photos et documents marchent sans réseau.'
  } else if (state === 'downloading') {
    summary = `Le programme marche déjà sans réseau. ${missing} photo${missing > 1 ? 's' : ''} en route.`
  } else {
    summary = `Tout le programme marche sans réseau. Seules ${missing} photo${missing > 1 ? 's' : ''} s’afficheront grisées.`
  }

  const cachedPercent = stats.total ? (stats.cached / stats.total) * 100 : 0
  const errorPercent = stats.total ? (stats.error / stats.total) * 100 : 0

  return (
    <MobileScreen onBack={onClose} title="Disponible hors ligne">
      <section
        aria-labelledby="offline-state"
        className="bg-card border-border flex items-center gap-[18px] rounded-[22px] border p-[18px]"
      >
        <Gauge cached={stats.cached} total={stats.total} />
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold',
              copy.tone,
            )}
          >
            <span aria-hidden className={cn('size-2 rounded-full', copy.dot)} />
            {copy.pill}
          </span>
          <h2
            id="offline-state"
            className="mt-2 text-lg leading-tight font-black"
          >
            {copy.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
            {summary}
          </p>
        </div>
      </section>

      <SectionTitle className="mt-[22px] mb-2">Sur ce téléphone</SectionTitle>
      <ul className="bg-card border-border divide-border/70 divide-y rounded-[20px] border px-4">
        <li className="flex items-center gap-3 py-3">
          <IconBadge icon={CalendarCheck} tone="primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">
              Programme et adresses
            </span>
            <span className="text-muted-foreground block text-[13px]">
              {itinerary.length} jour{itinerary.length > 1 ? 's' : ''} ·{' '}
              {counts.accommodations.total} hébergement
              {counts.accommodations.total > 1 ? 's' : ''} ·{' '}
              {counts.transports.total} trajet
              {counts.transports.total > 1 ? 's' : ''}
            </span>
          </span>
          <CircleCheck
            aria-label="Disponible"
            className="text-success size-5 shrink-0"
          />
        </li>

        <li className="py-3">
          <div className="flex items-center gap-3">
            <IconBadge icon={ImageIcon} tone="secondary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">Photos</span>
              <span
                className={cn(
                  'block text-[13px]',
                  stats.error > 0
                    ? 'text-secondary-strong font-bold'
                    : 'text-muted-foreground',
                )}
              >
                {stats.error > 0
                  ? `${stats.error} n’ont pas pu être téléchargées`
                  : stats.total === 0
                    ? 'Aucune photo dans ce voyage'
                    : missing === 0
                      ? 'Toutes enregistrées'
                      : `${missing} à télécharger`}
              </span>
            </span>
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                stats.error > 0 ? 'text-secondary-strong' : 'text-success',
              )}
            >
              {stats.cached}/{stats.total}
            </span>
          </div>
          {stats.total > 0 && (
            <div
              aria-hidden
              className="bg-muted mt-2.5 ml-[52px] flex h-1.5 overflow-hidden rounded-full"
            >
              <span
                className="bg-primary animate-grow origin-left transition-[width] duration-500"
                style={{ width: `${cachedPercent}%` }}
              />
              <span
                className="bg-secondary"
                style={{ width: `${errorPercent}%` }}
              />
            </div>
          )}
          {(stats.error > 0 || (paused && missing > 0)) && (
            <div className="mt-2.5 ml-[52px] flex flex-wrap items-center gap-2">
              {stats.error > 0 && (
                <Button
                  size="lg2"
                  className="h-11 rounded-xl"
                  onClick={retryErrors}
                >
                  <RefreshCw aria-hidden />
                  Réessayer tout
                </Button>
              )}
              {paused && missing > stats.error && (
                <Button
                  size="lg2"
                  variant={stats.error > 0 ? 'ghost' : 'default'}
                  className="h-11 rounded-xl"
                  onClick={downloadNow}
                >
                  <Download aria-hidden />
                  Télécharger maintenant
                </Button>
              )}
            </div>
          )}
        </li>

        <li className="flex items-center gap-3 py-3">
          <IconBadge icon={FileText} tone="success" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">Documents</span>
            <span className="text-muted-foreground block text-[13px]">
              Billets, visas, confirmations
            </span>
          </span>
          {/* Les documents ne vivent que sur l'appareil : tous sont disponibles. */}
          <span className="text-success font-mono text-sm font-semibold tabular-nums">
            {files.length}/{files.length}
          </span>
          <CircleCheck
            aria-label="Disponibles"
            className="text-success size-5 shrink-0"
          />
        </li>
      </ul>

      <div className="bg-card border-border mt-3 flex items-center gap-3 rounded-[20px] border px-4 py-3.5">
        <span className="min-w-0 flex-1">
          <span id="wifi-label" className="block text-[15px] font-extrabold">
            Télécharger seulement en Wi-Fi
          </span>
          <span className="text-muted-foreground block text-[13px] leading-snug">
            {connectionTypeKnown
              ? 'Évite d’utiliser vos données mobiles à l’étranger'
              : 'Ce navigateur ne dit pas quel réseau est utilisé : le réglage reste sans effet ici.'}
          </span>
        </span>
        <ToggleSwitch
          labelledBy="wifi-label"
          checked={preferences.wifiOnly}
          onCheckedChange={(checked) => {
            update({ wifiOnly: checked })
            trackEvent('preference_changed', {
              setting: 'wifi_only',
              enabled: checked,
            })
          }}
        />
      </div>

      <div className="bg-card border-border mt-3 rounded-[20px] border p-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={Database} tone="muted" />
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-xs font-black tracking-[0.08em] uppercase">
              Stockage utilisé
            </span>
            <span className="block text-[17px] font-black">
              {usage === undefined
                ? '…'
                : usage === null
                  ? 'Non communiqué par ce navigateur'
                  : `${formatFileSize(usage)} sur ce téléphone`}
            </span>
          </span>
        </div>
        <Button
          variant="outline"
          className="text-destructive border-border-strong mt-3 h-12 w-full rounded-[14px] text-[15px] font-extrabold"
          disabled={stats.cached === 0}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 aria-hidden />
          Vider le cache des images
        </Button>
        <p className="text-muted-foreground mt-2 text-center text-xs leading-snug">
          Le programme et les documents sont conservés.
        </p>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider le cache des images ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {stats.cached} photos enregistrées seront effacées de ce
              téléphone. Sans réseau, elles s’afficheront grisées jusqu’au
              prochain téléchargement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={async () => {
                await clearCache()
                trackEvent('image_cache_cleared')
                void refresh()
              }}
            >
              Vider le cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileScreen>
  )
}
