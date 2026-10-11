'use client'

import { useId, useMemo, useState } from 'react'
import { AlertCircle, Check, Download, Info } from 'lucide-react'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/components/app/trip-provider'
import { trackEvent } from '@/lib/analytics/client'
import {
  importFailureReason,
  itineraryVolume,
  shareImportFailureReason,
} from '@/lib/analytics/metrics'
import { deriveTripTitle, type TripStatus } from '@/lib/trips'
import type { ImportMode } from '@/hooks/use-trip-data'
import type { DayItinerary } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import type {
  ReceivedTrip,
  ReceivedVia,
} from '@/components/receive/received-trip'
import {
  formatTripRange,
  previewIncludes,
  previewStats,
  projectRoute,
} from '@/components/receive/trip-preview-data'

const MAP_WIDTH = 350
const MAP_HEIGHT = 170

const VIA_LABEL: Record<ReceivedVia, string> = {
  'typed-code': 'Reçu avec un code de partage',
  scan: 'Reçu par QR code',
  link: 'Reçu par un lien de partage',
  clipboard: 'Reçu depuis tripbrain.fr',
  generator: 'Généré sur tripbrain.fr',
  file: 'Lu depuis votre fichier',
}

const STATUS_LABEL: Record<TripStatus, string> = {
  ongoing: 'en cours',
  upcoming: 'à venir',
  past: 'terminé',
}

/** Mini-carte du parcours : les étapes reliées dans l'ordre, en pointillés qui avancent. */
export function RouteMiniMap({
  days,
  className,
}: {
  days: DayItinerary[]
  className?: string
}) {
  const route = useMemo(
    () =>
      projectRoute(days, { width: MAP_WIDTH, height: MAP_HEIGHT, padding: 28 }),
    [days],
  )
  const labels = route.stops.filter((stop) => stop.label).map((s) => s.label)

  if (route.points.length === 0) return null

  return (
    <div className={cn('bg-primary-soft', className)}>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Parcours : ${labels.join(', ')}`}
      >
        {route.points.length > 1 && (
          <polyline
            points={route.points.map((p) => `${p.x},${p.y}`).join(' ')}
            className="stroke-primary animate-march fill-none"
            strokeWidth={2.5}
            strokeDasharray="4 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {route.stops.map((stop, index) => (
          <circle
            key={`${stop.x}-${stop.y}`}
            cx={stop.x}
            cy={stop.y}
            r={index === 0 ? 6 : 5}
            className="fill-card stroke-primary"
            strokeWidth={3}
          />
        ))}
        {route.stops.map((stop) =>
          stop.label ? (
            <text
              key={`label-${stop.x}-${stop.y}`}
              x={Math.min(Math.max(stop.x, 34), MAP_WIDTH - 34)}
              y={stop.y < 22 ? stop.y + 20 : stop.y - 11}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-extrabold"
            >
              {stop.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

/**
 * Aperçu d'un voyage reçu, avant tout enregistrement : tracé, dates,
 * compteurs réels, contenu inclus. Quand des voyages existent déjà, on choisit
 * de l'ajouter (par défaut) ou de remplacer le voyage consulté.
 */
export function TripPreviewStep({
  received,
  onBack,
  onSaved,
  onWrongTrip,
  backIcon = 'back',
  progress,
  eyebrow,
}: {
  received: ReceivedTrip
  onBack: () => void
  /** Appelé une fois le voyage enregistré (la suite décide de l'écran à ouvrir). */
  onSaved: () => void
  /** « Ce n'est pas le bon voyage » ; par défaut, comme le retour. */
  onWrongTrip?: () => void
  backIcon?: 'back' | 'close'
  progress?: { step: number; total: number }
  eyebrow?: string
}) {
  const { trips, activeTrip, addTrip, importSharedItinerary } = useTrip()
  const [mode, setMode] = useState<ImportMode>('add')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const radioName = useId()

  const { days } = received
  const stats = useMemo(() => previewStats(days), [days])
  const includes = useMemo(() => previewIncludes(days), [days])
  const title = received.title?.trim() || deriveTripTitle(days)
  const range =
    days.length > 0
      ? formatTripRange(days[0].date, days[days.length - 1].date)
      : ''

  // Remplacer n'a de sens que pour un vrai voyage : la démo, elle, s'efface
  // d'elle-même dès qu'un voyage est ajouté.
  const realTrips = trips.filter((trip) => !trip.isDemo)
  const activeSummary = trips.find((trip) => trip.id === activeTrip?.id)
  const canReplace = Boolean(
    activeTrip && !activeTrip.isDemo && realTrips.length > 0,
  )

  const counters = [
    { value: stats.days, label: stats.days > 1 ? 'jours' : 'jour' },
    { value: stats.cities, label: stats.cities > 1 ? 'villes' : 'ville' },
    {
      value: stats.accommodations,
      label: stats.accommodations > 1 ? 'hébergements' : 'hébergement',
    },
    {
      value: stats.transports,
      label: stats.transports > 1 ? 'trajets' : 'trajet',
    },
  ]

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const effectiveMode: ImportMode = canReplace ? mode : 'add'
    try {
      if (received.analytics.kind === 'share') {
        await importSharedItinerary(days, {
          mode: effectiveMode,
          title: received.title,
          source: received.source,
        })
        trackEvent('share_import_completed', {
          source: received.analytics.source,
          days_count: days.length,
        })
      } else {
        if (effectiveMode === 'replace') {
          await importSharedItinerary(days, {
            mode: 'replace',
            title: received.title,
            source: received.source,
          })
        } else {
          await addTrip(days, {
            title: received.title,
            source: received.source,
          })
        }
        trackEvent('trip_imported', {
          source: received.analytics.source,
          ...itineraryVolume(days),
        })
      }
      onSaved()
    } catch (err) {
      if (received.analytics.kind === 'share') {
        trackEvent('share_import_failed', {
          source: received.analytics.source,
          reason: shareImportFailureReason(err),
        })
      } else {
        trackEvent('trip_import_failed', {
          source: received.analytics.source,
          reason: importFailureReason(err),
        })
      }
      setError(
        err instanceof Error ? err.message : 'L’enregistrement a échoué.',
      )
      setSaving(false)
    }
  }

  const subtitle =
    received.via === 'file' && received.fileName
      ? `Lu depuis ${received.fileName}`
      : VIA_LABEL[received.via]

  return (
    <MobileScreen
      onBack={onBack}
      backIcon={backIcon}
      progress={progress}
      eyebrow={eyebrow}
      title={canReplace ? 'Importer ce voyage ?' : 'Voici votre voyage'}
      description={`${subtitle} · vérifiez avant d’enregistrer`}
      footer={
        <>
          <Button
            size="xl"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {canReplace && <Download aria-hidden />}
            {saving
              ? 'Enregistrement…'
              : canReplace
                ? 'Importer'
                : 'Enregistrer sur ce téléphone'}
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground min-h-11 w-full text-sm font-extrabold"
            onClick={onWrongTrip ?? onBack}
            disabled={saving}
          >
            Ce n’est pas le bon voyage
          </Button>
        </>
      }
    >
      <section
        aria-label="Voyage reçu"
        className="bg-card border-border overflow-hidden rounded-[22px] border"
      >
        <RouteMiniMap days={days} />
        <div className="p-4">
          <p className="text-xl leading-tight font-black">{title}</p>
          {range && (
            <p className="text-muted-foreground mt-0.5 text-sm font-bold">
              {range}
            </p>
          )}
          <dl className="mt-3.5 grid grid-cols-4 gap-2">
            {counters.map((counter) => (
              <div
                key={counter.label}
                className="bg-background flex flex-col-reverse items-center rounded-xl px-1 py-2.5 text-center"
              >
                <dt className="text-muted-foreground truncate text-xs font-bold">
                  {counter.label}
                </dt>
                <dd className="font-display text-primary text-[22px] leading-tight">
                  {counter.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {includes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2.5 text-sm font-bold">
          {includes.map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="bg-success-soft text-success flex size-6 shrink-0 items-center justify-center rounded-full"
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              {line}
            </li>
          ))}
        </ul>
      )}

      {canReplace && activeTrip && (
        <>
          <div
            role="note"
            className="bg-secondary-soft border-secondary/30 text-secondary-strong mt-4 flex items-start gap-3 rounded-[18px] border px-3.5 py-3"
          >
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="text-sm leading-snug">
              {realTrips.length > 1
                ? `Vous avez déjà ${realTrips.length} voyages sur ce téléphone, dont `
                : 'Vous avez déjà un voyage sur ce téléphone : '}
              <strong className="font-black">{activeTrip.title}</strong>
              {activeSummary && ` (${STATUS_LABEL[activeSummary.status]})`}
            </p>
          </div>

          <fieldset className="mt-3.5 flex flex-col gap-2.5">
            <legend className="text-muted-foreground mb-2 text-[11px] font-black tracking-[0.1em] uppercase">
              Que faire du voyage reçu ?
            </legend>
            <ModeOption
              name={radioName}
              value="add"
              checked={mode === 'add'}
              onSelect={setMode}
              title="Ajouter à mes voyages"
              description="Les voyages restent tous sur ce téléphone"
              badge="Recommandé"
            />
            <ModeOption
              name={radioName}
              value="replace"
              checked={mode === 'replace'}
              onSelect={setMode}
              title={`Remplacer ${activeTrip.title}`}
              description="Son programme est remplacé par celui-ci"
            />
          </fieldset>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive mt-4 flex items-start gap-2 rounded-2xl px-3.5 py-3 text-sm font-bold"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </MobileScreen>
  )
}

function ModeOption({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  badge,
}: {
  name: string
  value: ImportMode
  checked: boolean
  onSelect: (mode: ImportMode) => void
  title: string
  description: string
  badge?: string
}) {
  return (
    <label
      className={cn(
        'pressable bg-card flex cursor-pointer items-center gap-3.5 rounded-[20px] p-3.5',
        'has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]',
        checked ? 'border-primary border-2 p-[13px]' : 'border-border border',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="accent-primary size-[22px] shrink-0"
      />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="text-base leading-snug font-extrabold break-words">
          {title}
        </span>
        <span className="text-muted-foreground text-[13px]">{description}</span>
        {badge && (
          <span className="bg-primary text-primary-foreground mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
            {badge}
          </span>
        )}
      </span>
    </label>
  )
}
