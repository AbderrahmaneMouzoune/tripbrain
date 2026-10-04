'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Copy,
  FileUp,
  Flag,
  Hand,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useAppNav } from '@/components/app/navigation'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { ListCard, ListRow } from '@/components/mobile/list-row'
import { SectionTitle } from '@/components/mobile/section-title'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RouteSketch } from '@/components/trip-menu/route-sketch'
import {
  cityOfDay,
  countAccommodations,
  describeTripMoment,
  formatMonthYear,
  formatTripOrigin,
  formatTripRange,
  groupTripsByStatus,
  plural,
} from '@/components/trip-menu/trip-format'
import { useLongPress } from '@/hooks/use-long-press'
import { countTripDocuments, deleteTripDocuments } from '@/lib/documents-db'
import { readAllTrips } from '@/lib/trips-db'
import { daysUntil, type TripSummary } from '@/lib/trips'
import type { DayItinerary } from '@/lib/itinerary-data'
import { trackEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

/**
 * Mes voyages : tous les voyages de l'appareil, rangés en cours / à venir /
 * passés. Un tap ouvre le voyage ; ⋯ ou un appui long propose de le
 * renommer, le dupliquer ou le supprimer.
 */
export function TripsScreen({ onClose }: ScreenProps<'trips'>) {
  const {
    trips,
    activeTripId,
    switchTrip,
    renameTrip,
    duplicateTrip,
    deleteTrip,
  } = useTrip()
  const { push, setTab, closeAll } = useAppNav()

  // Les résumés ne portent pas les étapes : l'itinéraire complet de chaque
  // voyage est relu (en lecture seule) pour les tracés et les hébergements.
  const [itineraries, setItineraries] = useState<
    Record<string, DayItinerary[]>
  >({})
  useEffect(() => {
    let cancelled = false
    readAllTrips()
      .then((stored) => {
        if (cancelled) return
        setItineraries(
          Object.fromEntries(stored.map((trip) => [trip.id, trip.itinerary])),
        )
      })
      .catch(() => {
        // Sans tracé, les cartes restent lisibles : rien à signaler.
      })
    return () => {
      cancelled = true
    }
  }, [trips])

  const sections = useMemo(() => groupTripsByStatus(trips), [trips])

  const [menuFor, setMenuFor] = useState<TripSummary | null>(null)
  const [renameFor, setRenameFor] = useState<TripSummary | null>(null)
  const [deleteFor, setDeleteFor] = useState<TripSummary | null>(null)

  const openTrip = (id: string) => {
    switchTrip(id)
    // `setTab` referme aussi toute la pile d'écrans : un `closeAll` en plus
    // remonterait l'historique deux fois.
    setTab('today')
  }

  return (
    <MobileScreen
      onBack={onClose}
      title="Mes voyages"
      footer={
        <>
          <Button
            size="xl"
            className="w-full shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
            onClick={() => push({ kind: 'generator' })}
          >
            <Plus aria-hidden />
            Nouveau voyage
          </Button>
          <div className="grid grid-cols-2 gap-1">
            <Button
              variant="ghost"
              className="text-primary-strong h-11 text-[15px] font-extrabold"
              onClick={() => push({ kind: 'receive', method: 'code' })}
            >
              <KeyRound aria-hidden />
              Recevoir un partage
            </Button>
            <Button
              variant="ghost"
              className="text-primary-strong h-11 text-[15px] font-extrabold"
              onClick={() => push({ kind: 'import-file' })}
            >
              <FileUp aria-hidden />
              Importer un fichier
            </Button>
          </div>
        </>
      }
    >
      {sections.length === 0 && (
        <p className="text-muted-foreground text-[15px]">
          Aucun voyage sur cet appareil pour l’instant.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.status} className="mb-5 flex flex-col gap-2.5">
          <SectionTitle
            className={cn(
              section.status === 'ongoing' && '[&_h2]:text-secondary-strong',
            )}
          >
            {section.label}
          </SectionTitle>
          {section.trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              itinerary={itineraries[trip.id]}
              active={trip.id === activeTripId}
              onOpen={() => openTrip(trip.id)}
              onMenu={() => setMenuFor(trip)}
            />
          ))}
        </section>
      ))}

      {trips.length > 0 && (
        <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-xs font-bold">
          <Hand className="size-4 shrink-0" aria-hidden />
          Appui long sur un voyage : Renommer, Dupliquer, Supprimer
        </p>
      )}

      {/* ── Actions d'un voyage ── */}
      <BottomSheet
        open={menuFor !== null}
        onOpenChange={(open) => !open && setMenuFor(null)}
        title={menuFor?.title ?? 'Voyage'}
        description={
          menuFor
            ? (formatTripRange(menuFor.startDate, menuFor.endDate, {
                withYear: true,
              }) ?? undefined)
            : undefined
        }
      >
        <ListCard className="mb-2">
          <ListRow
            icon={Pencil}
            tone="primary"
            label="Renommer"
            onClick={() => {
              const trip = menuFor
              setMenuFor(null)
              afterSheetClosed(() => setRenameFor(trip))
            }}
          />
          <ListRow
            icon={Copy}
            tone="accent"
            label="Dupliquer"
            description="Une copie à retoucher sans toucher à l’original"
            onClick={async () => {
              const trip = menuFor
              setMenuFor(null)
              if (!trip) return
              await duplicateTrip(trip.id)
              trackEvent('trip_duplicated')
            }}
          />
          <ListRow
            icon={Trash2}
            destructive
            label="Supprimer"
            description="Le voyage et ses documents, sur cet appareil"
            onClick={() => {
              const trip = menuFor
              setMenuFor(null)
              afterSheetClosed(() => setDeleteFor(trip))
            }}
          />
        </ListCard>
      </BottomSheet>

      <RenameSheet
        trip={renameFor}
        onClose={() => setRenameFor(null)}
        onRename={async (title) => {
          if (!renameFor) return
          await renameTrip(renameFor.id, title)
          trackEvent('trip_renamed')
          setRenameFor(null)
        }}
      />

      <DeleteTripDialog
        trip={deleteFor}
        onClose={() => setDeleteFor(null)}
        onConfirm={async (trip) => {
          const isLast = trips.length <= 1
          try {
            await deleteTripDocuments(trip.id)
          } catch {
            // Les documents ne doivent pas empêcher de supprimer le voyage.
          }
          await deleteTrip(trip.id)
          trackEvent('trip_deleted')
          setDeleteFor(null)
          // Plus aucun voyage : l'accueil prend le relais, rien à garder ouvert.
          if (isLast) closeAll()
        }}
      />
    </MobileScreen>
  )
}

/**
 * Laisse la feuille d'actions finir de se fermer avant d'ouvrir la suivante :
 * deux fenêtres modales qui se croisent se disputent le focus et le
 * verrouillage du défilement.
 */
function afterSheetClosed(open: () => void) {
  setTimeout(open, 250)
}

/** Une carte de voyage, dont la forme dépend du moment (en cours, à venir, passé). */
function TripCard({
  trip,
  itinerary,
  active,
  onOpen,
  onMenu,
}: {
  trip: TripSummary
  itinerary: DayItinerary[] | undefined
  active: boolean
  onOpen: () => void
  onMenu: () => void
}) {
  const { pressed, handlers } = useLongPress({ onLongPress: onMenu })
  const coordinates = useMemo(
    () => (itinerary ?? []).map((day) => day.coordinates),
    [itinerary],
  )
  const moment = describeTripMoment(trip)
  const range = formatTripRange(trip.startDate, trip.endDate, {
    withYear: true,
  })
  const origin = formatTripOrigin(trip.source, trip.createdAt)

  const menuButton = (light?: boolean) => (
    <Button
      variant="ghost"
      size="icon-round"
      onClick={onMenu}
      aria-label={`Options du voyage ${trip.title}`}
      className={cn(
        'absolute top-1.5 right-1.5',
        light &&
          'text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground',
      )}
    >
      <MoreHorizontal />
    </Button>
  )

  const activeBadge = active && (
    <span className="bg-primary-soft text-primary-strong rounded-full px-2 py-0.5 text-[11px] font-extrabold">
      Affiché
    </span>
  )

  if (trip.status === 'ongoing') {
    const todayCity = itinerary ? cityOfDay(itinerary, moment.dayNumber) : null
    const stays = itinerary ? countAccommodations(itinerary) : 0
    const facts = [
      range,
      trip.cityCount > 0 ? plural(trip.cityCount, 'ville') : null,
      stays > 0 ? plural(stays, 'hébergement') : null,
    ].filter(Boolean)

    return (
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          {...handlers}
          className={cn(
            'pressable bg-card focus-visible:ring-ring/50 block w-full overflow-hidden rounded-[22px] text-left outline-none focus-visible:ring-[3px]',
            active ? 'border-primary border-2' : 'border-border border',
            pressed && 'scale-[0.98]',
          )}
        >
          <div className="bg-primary text-primary-foreground relative h-[118px]">
            <RouteSketch
              coordinates={coordinates}
              width={350}
              height={118}
              padding={22}
              currentIndex={moment.dayNumber ? moment.dayNumber - 1 : null}
              className="absolute inset-0 h-full w-full"
              dotClassName="text-primary-foreground"
            />
            {todayCity && (
              <span className="bg-card text-primary-strong absolute top-3 left-3.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black">
                <span className="bg-secondary size-2 rounded-full" />
                Aujourd’hui à {todayCity}
              </span>
            )}
            {trip.cities.length > 0 && (
              <span className="text-primary-foreground/80 absolute right-3.5 bottom-2.5 left-3.5 truncate text-[11px] font-extrabold">
                {trip.cities.join(' · ')}
              </span>
            )}
          </div>
          <div className="px-4 pt-3.5 pb-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-xl font-black">
                {trip.title}
              </p>
              {moment.dayNumber && (
                <p className="text-primary-strong shrink-0 text-[13px] font-extrabold">
                  Jour {moment.dayNumber}/{trip.dayCount}
                </p>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {facts.join(' · ')}
            </p>
            {moment.progress !== null && (
              <div aria-hidden className="bg-border/70 mt-3 h-1.5 rounded-full">
                <span
                  className="bg-primary animate-grow block h-1.5 rounded-full"
                  style={{ width: `${Math.round(moment.progress * 100)}%` }}
                />
              </div>
            )}
            {activeBadge && <div className="mt-2.5">{activeBadge}</div>}
          </div>
        </button>
        {menuButton(true)}
      </div>
    )
  }

  if (trip.status === 'upcoming') {
    const inDays = trip.startDate ? daysUntil(trip.startDate) : null
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          {...handlers}
          className={cn(
            'pressable bg-card focus-visible:ring-ring/50 flex w-full items-center gap-3.5 rounded-[20px] p-3.5 pr-12 text-left outline-none focus-visible:ring-[3px]',
            active
              ? 'border-primary border-2 p-[13px] pr-12'
              : 'border-border border',
            pressed && 'scale-[0.98]',
          )}
        >
          <span
            aria-hidden
            className="bg-secondary-soft text-secondary-strong flex size-16 shrink-0 items-center justify-center rounded-2xl"
          >
            <RouteSketch
              coordinates={coordinates}
              width={64}
              height={64}
              padding={12}
              dashed
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="w-full truncate text-[17px] font-black">
              {trip.title}
            </span>
            <span className="text-muted-foreground text-[13px]">
              {[range, origin].filter(Boolean).join(' · ')}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {inDays !== null && inDays > 0 && (
                <span className="bg-secondary-soft text-secondary-strong rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                  {inDays === 1 ? 'Demain' : `Dans ${inDays} jours`}
                </span>
              )}
              {activeBadge}
            </span>
          </span>
        </button>
        {menuButton()}
      </div>
    )
  }

  const month = formatMonthYear(trip.startDate)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        {...handlers}
        className={cn(
          'pressable focus-visible:ring-ring/50 bg-card/60 text-muted-foreground flex w-full items-center gap-3.5 rounded-[20px] border border-dashed px-3.5 py-3 pr-12 text-left outline-none focus-visible:ring-[3px]',
          active ? 'border-primary' : 'border-border-strong',
          pressed && 'scale-[0.98]',
        )}
      >
        <span
          aria-hidden
          className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-[14px]"
        >
          <Flag className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate text-[15px] font-extrabold">
            {trip.title}
          </span>
          <span className="text-[13px]">
            {[plural(trip.dayCount, 'jour'), month].filter(Boolean).join(' · ')}
          </span>
          {activeBadge && <span className="mt-1">{activeBadge}</span>}
        </span>
        <span className="text-xs font-extrabold">Terminé</span>
      </button>
      {menuButton()}
    </div>
  )
}

/** Feuille de renommage : un seul champ, validé au clavier ou au bouton. */
function RenameSheet({
  trip,
  onClose,
  onRename,
}: {
  trip: TripSummary | null
  onClose: () => void
  onRename: (title: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (trip) setValue(trip.title)
  }, [trip])

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!value.trim()) return
    setSaving(true)
    try {
      await onRename(value.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={trip !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Renommer le voyage"
      footer={
        <Button
          size="xl"
          className="w-full"
          disabled={!value.trim() || saving}
          onClick={() => void submit()}
        >
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-2 pb-1">
        <Label htmlFor="trip-rename" className="text-sm font-extrabold">
          Nom du voyage
        </Label>
        <Input
          id="trip-rename"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={80}
          className="bg-card h-12 rounded-xl text-base"
        />
      </form>
    </BottomSheet>
  )
}

/** Confirmation de suppression d'un voyage, avec son nombre réel de documents. */
function DeleteTripDialog({
  trip,
  onClose,
  onConfirm,
}: {
  trip: TripSummary | null
  onClose: () => void
  onConfirm: (trip: TripSummary) => Promise<void>
}) {
  const [documentCount, setDocumentCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDocumentCount(null)
    if (!trip) return
    let cancelled = false
    countTripDocuments(trip.id)
      .then((count) => !cancelled && setDocumentCount(count))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [trip])

  return (
    <AlertDialog
      open={trip !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <AlertDialogContent className="bg-card flex max-w-[calc(100%-48px)] flex-col items-center gap-0 rounded-[28px] border-0 px-5 pt-6 pb-5 text-center sm:max-w-sm">
        <span
          aria-hidden
          className="bg-destructive-soft text-destructive flex size-16 items-center justify-center rounded-full"
        >
          <Trash2 className="size-7" />
        </span>
        <AlertDialogTitle className="font-display mt-4 text-2xl leading-tight font-normal">
          Supprimer « {trip?.title} » ?
        </AlertDialogTitle>
        <AlertDialogDescription className="text-muted-foreground mt-2.5 text-[15px] leading-normal">
          {documentCount
            ? `Le voyage et ${documentCount > 1 ? `ses ${documentCount} documents` : 'son document'} seront supprimés de ce téléphone.`
            : 'Le voyage sera supprimé de ce téléphone.'}{' '}
          Cette action est définitive.
        </AlertDialogDescription>
        <div className="mt-[18px] grid w-full grid-cols-2 gap-2.5">
          <AlertDialogCancel
            disabled={busy}
            className="border-border-strong bg-card h-[52px] rounded-2xl border-[1.5px] text-base font-extrabold"
          >
            Annuler
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy || !trip}
            className="h-[52px] rounded-2xl text-base font-extrabold"
            onClick={async () => {
              if (!trip) return
              setBusy(true)
              try {
                await onConfirm(trip)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Supprimer
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
