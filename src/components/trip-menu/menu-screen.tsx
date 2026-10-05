'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeftRight,
  CalendarDays,
  CalendarPlus,
  CloudDownload,
  Download,
  FileUp,
  Info,
  KeyRound,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useAppNav } from '@/components/app/navigation'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { ListCard, ListRow } from '@/components/mobile/list-row'
import { SectionTitle } from '@/components/mobile/section-title'
import { IconBadge } from '@/components/mobile/icon-badge'
import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/components/pwa-install-provider'
import { RouteSketch } from '@/components/trip-menu/route-sketch'
import {
  countTransports,
  describeTripMoment,
  formatTripRange,
  plural,
} from '@/components/trip-menu/trip-format'
import { trackEvent } from '@/lib/analytics/client'

/**
 * Menu « Voyage » (bouton ⋯) : le voyage consulté, puis tout ce qui le fait
 * sortir de l'appareil (partage, calendrier), en créer un autre, et les
 * réglages de l'appareil. La suppression ferme la liste, en rouge.
 */
export function MenuScreen({ onClose }: ScreenProps<'menu'>) {
  const { push, selectedDay } = useAppNav()
  const { activeTrip, activeTripId, trips, itinerary, exportData } = useTrip()
  // L'installation n'apparaît que là où elle est possible, et jamais une fois installée.
  const { canInstall, open: openInstallPrompt } = usePwaInstall()

  // Héritier du panneau « Partager & données » : même mesure d'ouverture.
  useEffect(() => {
    trackEvent('share_opened')
  }, [])

  const summary = trips.find((trip) => trip.id === activeTripId)
  const moment = summary ? describeTripMoment(summary) : null
  const coordinates = useMemo(
    () => itinerary.map((day) => day.coordinates),
    [itinerary],
  )
  const dayCount = itinerary.length
  const transports = countTransports(itinerary)
  const currentDay = itinerary[selectedDay]

  const facts = [
    summary ? formatTripRange(summary.startDate, summary.endDate) : null,
    summary && summary.cityCount > 0
      ? plural(summary.cityCount, 'ville')
      : null,
    transports > 0 ? plural(transports, 'trajet') : null,
  ].filter(Boolean)

  return (
    <MobileScreen>
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-secondary-strong text-xs font-black tracking-[0.08em] uppercase">
            Votre voyage
          </p>
          <h1 className="font-display mt-0.5 text-[30px] leading-[1.1]">
            Voyage
          </h1>
        </div>
        <Button
          variant="outline"
          size="icon-round"
          onClick={onClose}
          aria-label="Fermer"
          className="border-border bg-card shrink-0 shadow-none"
        >
          <X />
        </Button>
      </header>

      {/* ── Le voyage consulté ── */}
      {activeTrip && (
        <section
          aria-label="Voyage affiché"
          className="bg-primary text-primary-foreground relative mt-[18px] overflow-hidden rounded-[22px] p-4"
        >
          <RouteSketch
            coordinates={coordinates}
            width={150}
            height={110}
            padding={12}
            currentIndex={moment?.dayNumber ? moment.dayNumber - 1 : null}
            className="text-primary-foreground pointer-events-none absolute -top-1 -right-1.5 opacity-45"
          />
          <p className="text-primary-foreground/80 relative text-[11px] font-black tracking-[0.1em] uppercase">
            {moment?.headline ?? 'Voyage'}
          </p>
          <p className="relative mt-1 text-[22px] leading-tight font-black">
            {activeTrip.title}
          </p>
          {facts.length > 0 && (
            <p className="text-primary-foreground/90 relative mt-0.5 text-sm font-bold">
              {facts.join(' · ')}
            </p>
          )}
          {moment?.progress !== null && moment?.progress !== undefined && (
            <div
              role="progressbar"
              aria-label="Avancement du voyage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(moment.progress * 100)}
              className="bg-primary-foreground/25 relative mt-3 h-1.5 rounded-full"
            >
              <span
                className="bg-primary-foreground animate-grow block h-1.5 origin-left rounded-full"
                style={{ width: `${Math.round(moment.progress * 100)}%` }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => push({ kind: 'trips' })}
            className="pressable bg-card text-primary-strong focus-visible:ring-ring/50 relative mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold outline-none focus-visible:ring-[3px]"
          >
            <ArrowLeftRight className="size-[18px]" aria-hidden />
            {trips.length > 1 ? 'Changer de voyage' : 'Mes voyages'}
          </button>
        </section>
      )}

      {/* ── Partager ── */}
      <SectionTitle className="mt-6 mb-2">Partager</SectionTitle>
      <ListCard>
        <ListRow
          icon={Share2}
          tone="primary"
          label="Partager l’itinéraire"
          description="Lien, QR code ou code à dicter"
          onClick={() => push({ kind: 'share' })}
        />
        <ListRow
          icon={KeyRound}
          tone="accent"
          label="Recevoir un partage"
          description="Saisir le code affiché sur l’autre appareil"
          onClick={() => push({ kind: 'receive', method: 'code' })}
        />
      </ListCard>

      {/* ── Calendrier ── */}
      {dayCount > 0 && (
        <>
          <SectionTitle className="mt-[22px] mb-2">Calendrier</SectionTitle>
          <ListCard>
            <ListRow
              icon={CalendarDays}
              tone="primary"
              label="Ajouter tout le voyage"
              description={`Fichier .ics, ${plural(dayCount, 'jour')}`}
              onClick={() => push({ kind: 'calendar' })}
            />
            {currentDay && (
              <ListRow
                icon={CalendarPlus}
                tone="muted"
                label={`Ajouter le jour ${currentDay.dayNumber}`}
                description={
                  currentDay.city ? `${currentDay.city} uniquement` : undefined
                }
                onClick={() =>
                  push({ kind: 'calendar', dayIndex: selectedDay })
                }
              />
            )}
          </ListCard>
        </>
      )}

      {/* ── Créer ── */}
      <SectionTitle className="mt-[22px] mb-2">Créer</SectionTitle>
      <ListCard>
        <ListRow
          icon={Sparkles}
          tone="secondary"
          label="Créer un autre itinéraire"
          description="avec le générateur"
          onClick={() => push({ kind: 'generator' })}
        />
        <ListRow
          icon={FileUp}
          tone="muted"
          label="Importer un fichier"
          description="JSON, Excel ou CSV"
          onClick={() => push({ kind: 'import-file' })}
        />
        {dayCount > 0 && (
          <ListRow
            icon={Download}
            tone="muted"
            label="Exporter en JSON"
            description="Une copie de ce voyage, à garder ou réimporter"
            onClick={exportData}
            chevron={false}
          />
        )}
      </ListCard>

      {/* ── Appareil ── */}
      <SectionTitle className="mt-[22px] mb-2">Appareil</SectionTitle>
      <ListCard>
        <ListRow
          icon={CloudDownload}
          tone="success"
          label="Disponible hors ligne"
          description="Photos et documents enregistrés sur l’appareil"
          onClick={() => push({ kind: 'offline' })}
        />
        <ListRow
          icon={Settings}
          tone="muted"
          label="Réglages"
          onClick={() => push({ kind: 'settings' })}
        />
        {canInstall && (
          <ListRow
            icon={Smartphone}
            tone="secondary"
            label="Installer l’application"
            description="Sur l’écran d’accueil, en plein écran et hors ligne"
            onClick={() => openInstallPrompt('manual')}
          />
        )}
        <Link
          href="/politique-de-confidentialite"
          className="pressable focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]"
        >
          <ListRow
            icon={ShieldCheck}
            tone="muted"
            label="Confidentialité"
            chevron
          />
        </Link>
      </ListCard>

      {/* ── Suppression ── */}
      {activeTrip && (
        <button
          type="button"
          onClick={() => push({ kind: 'reset' })}
          className="pressable bg-card border-destructive/30 text-destructive focus-visible:ring-ring/50 mt-[22px] flex min-h-16 w-full items-center gap-3.5 rounded-[20px] border px-3.5 py-3 text-left outline-none focus-visible:ring-[3px]"
        >
          <IconBadge icon={Trash2} tone="destructive" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-extrabold">
              Supprimer ce voyage
            </span>
            <span className="text-muted-foreground text-[13px] leading-snug">
              Le voyage et ses documents, sur cet appareil
            </span>
          </span>
        </button>
      )}

      <p className="text-muted-foreground mx-2 mt-5 flex items-start gap-2 text-xs leading-normal">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Votre voyage vit sur cet appareil : le partage est le seul moyen de le
          retrouver ailleurs.
        </span>
      </p>
    </MobileScreen>
  )
}
