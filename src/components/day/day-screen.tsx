'use client'

import {
  ArrowLeft,
  Backpack,
  Check,
  ChevronLeft,
  ChevronRight,
  Hand,
  MapPin,
  Pencil,
  Plus,
  Share,
  SquarePen,
  Train,
  Hotel,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { useEditSession } from '@/components/app/edit-session'
import { EditChrome } from '@/components/edit/edit-bar'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QuickActionsTarget } from '@/components/quick-actions'
import { useDayEditor } from '@/components/day/use-day-editor'
import { ReorderableActivities } from '@/components/day/reorderable-activities'
import { PhotoCarousel } from '@/components/day/photo-carousel'
import {
  ActivityCard,
  DashedAdd,
  FoodList,
  SectionHeading,
  StayCard,
  TipsList,
  TransportSummary,
} from '@/components/day/day-sections'
import {
  BOOKING_STATUS_LABELS,
  dayTypeLabel,
  findNextActivity,
  formatDateRange,
  longDate,
  shortDate,
  transportLabel,
} from '@/components/day/day-logic'
import { Pill, TRANSPORT_ICONS } from '@/components/day/day-ui'

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

  const goToDay = (target: number) => {
    selectDay(target, 'arrow')
    replace({ kind: 'day', dayIndex: target })
  }

  const previous = itinerary[index - 1]
  const following = itinerary[index + 1]
  const next = findNextActivity(day)
  const doneCount = day.activities.filter((a) => a.status === 'done').length
  const photos = (day.images ?? []).map((image) => ({
    url: image.url,
    caption: image.caption,
  }))
  const typeLabel = dayTypeLabel(day.dayType)

  const stats = [
    { value: String(day.activities.length), label: 'activités' },
    day.walkingDistance
      ? { value: day.walkingDistance, label: 'à pied' }
      : undefined,
    typeLabel ? { value: typeLabel, label: 'type de journée' } : undefined,
  ].filter((stat): stat is { value: string; label: string } => Boolean(stat))

  const header = (
    <header className="px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
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
              aria-label="Partager le voyage"
              onClick={() => push({ kind: 'share' })}
              className={headerButton}
            >
              <Share />
            </Button>
            <Button
              variant="outline"
              size="icon-round"
              aria-label="Modifier la journée"
              onClick={startEditing}
              className={headerButton}
            >
              <Pencil />
            </Button>
          </>
        )}
      </div>
      <QuickActionsTarget
        entity="day"
        title={day.title}
        description={`Jour ${index + 1} · ${day.city}`}
        actions={editor.dayActions()}
      >
        <p className="text-secondary-strong mt-2.5 text-xs leading-4 font-black tracking-[0.08em]">
          {`${longDate(day.date)} · Jour ${index + 1}`.toUpperCase()}
        </p>
        <h1 className="font-display mt-0.5 text-[32px] leading-9">
          {day.title}
        </h1>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-base leading-[22px] font-extrabold">
          <MapPin className="size-4" aria-hidden />
          {day.city}
        </p>
      </QuickActionsTarget>
    </header>
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
          {header}

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
          </section>

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
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {header}

        {photos.length > 0 && (
          <PhotoCarousel
            photos={photos}
            label="Photos du jour"
            className="mt-3.5"
          />
        )}

        {day.notes && (
          <p className="border-secondary text-muted-foreground mx-5 mt-3 border-l-[3px] pl-3 text-[15px] leading-[21px] font-semibold">
            {day.notes}
          </p>
        )}

        {stats.length > 0 && (
          <dl
            className="bg-card border-border mx-5 mt-3.5 grid rounded-[20px] border px-1.5 py-3"
            style={{
              gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
            }}
          >
            {stats.map((stat, position) => (
              <div
                key={stat.label}
                className={cn(
                  'flex flex-col-reverse items-center gap-0.5 px-1 text-center',
                  position > 0 && 'border-border/70 border-l',
                )}
              >
                <dt className="text-muted-foreground text-xs font-extrabold">
                  {stat.label}
                </dt>
                <dd
                  className={cn(
                    'text-xl leading-6 font-black',
                    stat.label === 'type de journée' && 'text-secondary-strong',
                  )}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {day.highlights && day.highlights.length > 0 && (
          <section className="mx-5 mt-[18px]">
            <SectionHeading>Points forts</SectionHeading>
            <ul className="flex flex-wrap gap-2">
              {day.highlights.map((highlight, position) => (
                <QuickActionsTarget
                  key={`${highlight}-${position}`}
                  asChild
                  entity="day"
                  title={highlight}
                  description="Point fort de la journée"
                  actions={editor.listItemActions(
                    'highlights',
                    highlight,
                    position,
                  )}
                >
                  <li className="bg-secondary-soft text-secondary-strong border-secondary/30 rounded-full border px-3 py-[7px] text-[13px] font-extrabold">
                    {highlight}
                  </li>
                </QuickActionsTarget>
              ))}
            </ul>
          </section>
        )}

        <section className="mx-5 mt-[18px]">
          <SectionHeading>Transport du jour</SectionHeading>
          {day.transport ? (
            <TransportSummary day={day} dayIndex={index} editor={editor} />
          ) : (
            <DashedAdd
              icon={Train}
              empty="Aucun trajet ce jour"
              label="Ajouter un transport"
              onClick={() => editor.editTransport()}
            />
          )}
        </section>

        <section className="mx-5 mt-[18px]">
          <SectionHeading
            aside={
              day.activities.length > 0 && (
                <span className="text-muted-foreground text-[13px] font-extrabold">
                  {doneCount} sur {day.activities.length} faite
                  {doneCount > 1 ? 's' : ''}
                </span>
              )
            }
          >
            Activités
          </SectionHeading>
          {day.activities.length > 0 ? (
            <ol className="flex flex-col gap-2.5">
              {day.activities.map((activity, position) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  index={position}
                  dayIndex={index}
                  isNext={next?.index === position}
                  editor={editor}
                />
              ))}
            </ol>
          ) : (
            <DashedAdd
              empty="Rien de prévu"
              label="Ajouter une activité"
              onClick={editor.addActivity}
            />
          )}
        </section>

        <section className="mx-5 mt-[18px]">
          <SectionHeading>Hébergement</SectionHeading>
          {editor.stay ? (
            <StayCard dayIndex={index} editor={editor} surface="day" />
          ) : (
            <DashedAdd
              icon={Hotel}
              empty="Aucun hébergement"
              label="Ajouter"
              onClick={editor.editAccommodation}
            />
          )}
        </section>

        <FoodList day={day} editor={editor} />

        <section className="mx-5 mt-[18px]">
          <SectionHeading>Bagages</SectionHeading>
          {day.packingTips && day.packingTips.length > 0 ? (
            <ul className="bg-card border-border divide-border/70 divide-y rounded-[18px] border px-3.5">
              {day.packingTips.map((tip, position) => (
                <QuickActionsTarget
                  key={`${tip}-${position}`}
                  asChild
                  entity="day"
                  title={tip}
                  description="Bagages de la journée"
                  actions={editor.listItemActions('packingTips', tip, position)}
                >
                  <li className="flex min-h-11 items-center gap-2.5 py-2 text-sm font-bold">
                    <span
                      aria-hidden
                      className="bg-secondary size-1.5 shrink-0 rounded-full"
                    />
                    {tip}
                  </li>
                </QuickActionsTarget>
              ))}
            </ul>
          ) : (
            <div className="bg-card border-border text-muted-foreground flex min-h-[52px] items-center gap-2.5 rounded-[18px] border pr-2 pl-3.5">
              <Backpack className="size-5 shrink-0" aria-hidden />
              <span className="flex-1 text-sm font-bold">
                Rien pour ce jour
              </span>
              <button
                type="button"
                onClick={editor.editDay}
                className="text-primary flex min-h-11 items-center px-2.5 text-sm font-extrabold"
              >
                Ajouter
              </button>
            </div>
          )}
        </section>

        <TipsList day={day} editor={editor} />

        <p className="text-muted-foreground mx-5 my-3 flex items-center justify-center gap-1.5 text-xs font-bold">
          <Hand className="size-4" aria-hidden />
          Appui long sur un élément pour plus d’actions
        </p>

        <span className="flex-1" />

        <nav aria-label="Jours voisins" className="mx-5 mt-2 flex gap-2.5">
          {previous ? (
            <button
              type="button"
              onClick={() => goToDay(index - 1)}
              className="bg-card border-border pressable flex min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3 py-2.5 text-left"
            >
              <ChevronLeft className="size-5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-xs font-extrabold capitalize">
                  {shortDate(previous.date)}
                </span>
                <span className="truncate text-sm font-black">
                  {previous.title}
                </span>
              </span>
            </button>
          ) : (
            <span className="flex-1" />
          )}
          {following ? (
            <button
              type="button"
              onClick={() => goToDay(index + 1)}
              className="bg-card border-border pressable flex min-w-0 flex-1 items-center justify-end gap-2 rounded-2xl border px-3 py-2.5 text-right"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-xs font-extrabold capitalize">
                  {shortDate(following.date)}
                </span>
                <span className="truncate text-sm font-black">
                  {following.title}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0" aria-hidden />
            </button>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
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
