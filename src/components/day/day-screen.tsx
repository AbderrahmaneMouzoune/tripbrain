'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  SquarePen,
  Train,
  Hotel,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav, type DayChangeMethod } from '@/components/app/navigation'
import { useEditSession } from '@/components/app/edit-session'
import { EditChrome } from '@/components/edit/edit-bar'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSwipe } from '@/hooks/use-swipe'
import { QuickActionsTarget } from '@/components/quick-actions'
import { useDayEditor } from '@/components/day/use-day-editor'
import { ReorderableActivities } from '@/components/day/reorderable-activities'
import { DashedAdd } from '@/components/day/day-sections'
import { DayView } from '@/components/day/day-view'
import {
  BOOKING_STATUS_LABELS,
  dayTypeLabel,
  formatDateRange,
  longDate,
  transportLabel,
} from '@/components/day/day-logic'
import { Pill, TRANSPORT_ICONS } from '@/components/day/day-ui'
import { SwapDaySheet } from '@/components/day/day-overview'

const headerButton = 'border-border bg-card shrink-0 shadow-none'

/** Roadbook complet d'une journée, en lecture comme en mode édition. */
export function DayScreen({ screen, onClose }: ScreenProps<'day'>) {
  const { itinerary } = useTrip()
  const { push, replace, selectDay } = useAppNav()
  const { isEditing, startEditing, finishEditing, pendingChanges } =
    useEditSession()
  const index = Math.min(Math.max(screen.dayIndex, 0), itinerary.length - 1)
  const editor = useDayEditor(index)
  const day = editor.day
  const [swapOpen, setSwapOpen] = useState(false)

  // Ouvert pour modifier (crayon d'Aujourd'hui ou du Programme) : la
  // modification terminée — enregistrée ou annulée — on revient d'où l'on
  // vient, sans laisser une seconde vue de la journée dans la pile.
  const openedForEdit = useRef(isEditing)
  useEffect(() => {
    if (openedForEdit.current && !isEditing) onClose()
  }, [isEditing, onClose])

  const goToDay = (target: number, method: DayChangeMethod = 'arrow') => {
    if (target < 0 || target >= itinerary.length) return
    selectDay(target, method)
    replace({ kind: 'day', dayIndex: target })
  }

  // Balayer l'écran passe d'une journée à l'autre, comme sur Aujourd'hui.
  const swipe = useSwipe({
    onSwipeLeft: () => goToDay(index + 1, 'swipe'),
    onSwipeRight: () => goToDay(index - 1, 'swipe'),
  })

  if (!day) {
    return (
      <MobileScreen onBack={onClose} title="Journée introuvable">
        <p className="text-muted-foreground text-sm">
          Cette journée n’existe plus dans le voyage.
        </p>
      </MobileScreen>
    )
  }

  // En mode édition, le retour passe par « Terminer » : sans modification on
  // sort aussitôt, sinon le récapitulatif s'ouvre et l'écran reste.
  const back = () => {
    if (!isEditing) return onClose()
    finishEditing()
    if (pendingChanges === 0) onClose()
  }

  const typeLabel = dayTypeLabel(day.dayType)

  const metaLine = [
    day.city,
    day.activities.length > 0
      ? `${day.activities.length} étape${day.activities.length > 1 ? 's' : ''}`
      : undefined,
    day.walkingDistance ? `${day.walkingDistance} à pied` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  const topBar = (
    <header className="px-5 pt-[calc(var(--safe-top)+12px)]">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-round"
          onClick={back}
          aria-label="Retour"
          className={headerButton}
        >
          <ArrowLeft />
        </Button>
        <span className="flex-1" />
        {isEditing ? (
          <Button
            variant="ink"
            onClick={finishEditing}
            className="h-11 rounded-full pr-4 pl-3 text-[15px] font-extrabold"
          >
            <Check className="size-5" />
            Terminer
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="icon-round"
              aria-label="Modifier la journée"
              onClick={startEditing}
              className={headerButton}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon-round"
              aria-label="Voyage et réglages"
              onClick={() => push({ kind: 'menu' })}
              className={headerButton}
            >
              <MoreHorizontal />
            </Button>
          </>
        )}
      </div>
    </header>
  )

  const titleBlock = (
    <div className="px-5">
      <QuickActionsTarget
        entity="day"
        title={day.title}
        description={`Jour ${index + 1} · ${day.city}`}
        actions={editor.dayActions()}
      >
        <p className="text-muted-foreground mt-2.5 text-sm leading-5 font-bold first-letter:uppercase">
          {`${longDate(day.date)} · Jour ${index + 1}`}
        </p>
        <h1 className="font-display mt-0.5 text-[30px] leading-[34px]">
          {day.title}
        </h1>
        <p className="text-muted-foreground mt-1 text-[15px] leading-[22px]">
          {metaLine}
        </p>
      </QuickActionsTarget>
    </div>
  )

  if (isEditing) {
    const TransportIcon = day.transport
      ? TRANSPORT_ICONS[day.transport.type]
      : Train
    const stay = editor.stay
    const counts = [
      day.highlights?.length
        ? `${day.highlights.length} point${day.highlights.length > 1 ? 's' : ''} fort${day.highlights.length > 1 ? 's' : ''}`
        : undefined,
      day.foodRecommendations?.length
        ? `${day.foodRecommendations.length} à goûter`
        : undefined,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <div className="bg-background text-foreground min-h-dvh">
        <div className="mx-auto w-full max-w-xl pb-6">
          {topBar}
          {titleBlock}

          <div
            role="status"
            className="bg-secondary-soft text-secondary-strong border-secondary/30 mx-5 mt-4 flex items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5"
          >
            <SquarePen className="size-5 shrink-0" aria-hidden />
            <p className="text-[13px] leading-snug font-bold">
              <strong className="font-black">Mode édition</strong> · touchez un
              élément pour le modifier
            </p>
          </div>

          <section className="bg-card border-border mx-5 mt-3 flex flex-col gap-3 rounded-[22px] border p-4">
            <div>
              <p className="text-secondary-strong text-[11px] font-black tracking-[0.1em]">
                LA JOURNÉE
              </p>
              <p className="mt-0.5 text-[17px] font-black">{day.title}</p>
              {day.notes && (
                <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                  {day.notes}
                </p>
              )}
            </div>
            {(typeLabel || day.walkingDistance || counts) && (
              <div className="flex flex-wrap gap-1.5">
                {typeLabel && <Pill>{typeLabel}</Pill>}
                {day.walkingDistance && (
                  <Pill>{day.walkingDistance} à pied</Pill>
                )}
                {counts && <Pill tone="muted">{counts}</Pill>}
              </div>
            )}
            <Button
              variant="soft"
              onClick={editor.editDay}
              className="h-11 rounded-xl text-[15px] font-extrabold"
            >
              <Pencil />
              Modifier la journée
            </Button>
            {itinerary.length > 1 && (
              <Button
                variant="outline"
                onClick={() => setSwapOpen(true)}
                className="h-11 rounded-xl text-[15px] font-extrabold"
              >
                <ArrowLeftRight />
                Échanger avec un autre jour
              </Button>
            )}
          </section>
          <SwapDaySheet
            open={swapOpen}
            onOpenChange={setSwapOpen}
            dayIndex={index}
          />

          <div className="mx-5 mt-5 mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-black">Activités</h2>
            {day.activities.length > 1 && (
              <span className="text-muted-foreground text-xs font-extrabold">
                Glissez pour réordonner
              </span>
            )}
          </div>
          {day.activities.length > 0 && (
            <div className="mx-5">
              <ReorderableActivities
                activities={day.activities}
                onMove={editor.moveTo}
                onEdit={editor.editActivity}
                onDelete={editor.deleteActivity}
              />
            </div>
          )}
          <div className="mx-5 mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={editor.addActivity}
              className="border-primary/40 text-primary-strong pressable flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-sm font-extrabold"
            >
              <Plus className="size-4" aria-hidden />
              Ajouter une activité
            </button>
            {!day.transport && (
              <button
                type="button"
                onClick={() => editor.editTransport()}
                className="border-primary/40 text-primary-strong pressable flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-sm font-extrabold"
              >
                <Plus className="size-4" aria-hidden />
                Ajouter un transport
              </button>
            )}
          </div>

          {day.transport && (
            <>
              <h2 className="mx-5 mt-5 mb-2 text-[17px] font-black">
                Transport
              </h2>
              <EditRow
                icon={<TransportIcon className="size-5" />}
                tone="primary"
                title={transportLabel(day.transport)}
                subtitle={[
                  [day.transport.departureTime, day.transport.arrivalTime]
                    .filter(Boolean)
                    .join(' → '),
                  day.transport.status
                    ? BOOKING_STATUS_LABELS[day.transport.status]
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                editLabel="Modifier le transport"
                onEdit={() => editor.editTransport(day.transport)}
              />
            </>
          )}

          <h2 className="mx-5 mt-5 mb-2 text-[17px] font-black">Hébergement</h2>
          {stay ? (
            <EditRow
              icon={<Hotel className="size-5" />}
              tone="secondary"
              title={stay.accommodation.name || 'Hébergement'}
              subtitle={[
                stay.accommodation.checkIn && stay.accommodation.checkOut
                  ? formatDateRange(
                      stay.accommodation.checkIn,
                      stay.accommodation.checkOut,
                      '→',
                    )
                  : undefined,
                stay.nights
                  ? `${stay.nights} nuit${stay.nights > 1 ? 's' : ''}`
                  : undefined,
                stay.accommodation.status
                  ? BOOKING_STATUS_LABELS[stay.accommodation.status]
                  : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
              editLabel="Modifier l’hébergement"
              onEdit={editor.editAccommodation}
            />
          ) : (
            <div className="mx-5">
              <DashedAdd
                icon={Hotel}
                label="Ajouter un hébergement"
                onClick={editor.editAccommodation}
              />
            </div>
          )}
        </div>
        {editor.sheets}
        <EditChrome />
      </div>
    )
  }

  return (
    <div
      className="bg-background text-foreground flex min-h-dvh flex-col"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-[calc(var(--safe-bottom)+24px)]">
        {topBar}
        <DayView index={index} editor={editor} onSelectDay={goToDay} />
      </div>
      {editor.sheets}
    </div>
  )
}

/** Ligne du mode édition : l'élément et son crayon. */
function EditRow({
  icon,
  tone,
  title,
  subtitle,
  editLabel,
  onEdit,
}: {
  icon: React.ReactNode
  tone: 'primary' | 'secondary'
  title: string
  subtitle?: string
  editLabel: string
  onEdit: () => void
}) {
  return (
    <div className="bg-card border-border mx-5 flex items-center gap-3 rounded-[20px] border py-3 pr-2 pl-3.5">
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          tone === 'primary'
            ? 'bg-primary-soft text-primary'
            : 'bg-secondary-soft text-secondary-strong',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold">
          {title}
        </span>
        {subtitle && (
          <span className="text-muted-foreground block truncate text-[13px]">
            {subtitle}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onEdit}
        aria-label={editLabel}
        className="bg-primary-soft text-primary-strong pressable flex size-11 shrink-0 items-center justify-center rounded-xl"
      >
        <Pencil className="size-5" aria-hidden />
      </button>
    </div>
  )
}
