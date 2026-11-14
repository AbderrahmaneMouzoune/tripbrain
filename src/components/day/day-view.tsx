'use client'

import type { RefObject } from 'react'
import { ChevronLeft, ChevronRight, Hand } from 'lucide-react'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav, type DayChangeMethod } from '@/components/app/navigation'
import { cn } from '@/lib/utils'
import { QuickActionsTarget } from '@/components/quick-actions'
import type { DayEditor } from '@/components/day/use-day-editor'
import { PhotoCarousel } from '@/components/day/photo-carousel'
import { DashedAdd, TransportSummary } from '@/components/day/day-sections'
import { DayExtras, DayTimeline, StayRow } from '@/components/day/day-timeline'
import {
  findNextActivity,
  longDate,
  shortDate,
} from '@/components/day/day-logic'
import { DayOverviewStrip } from '@/components/day/day-overview'
import { PhoneText } from '@/components/phone-text'

/**
 * Une journée du voyage, en lecture : la bande des jours, puis le fil des
 * étapes. C'est la même vue dans l'onglet Aujourd'hui et sur l'écran ouvert
 * depuis le Programme ou la Carte ; seul l'en-tête change.
 */
export function DayView({
  index,
  editor,
  now,
  onSelectDay,
  stripRef,
  highlightRef,
  transportRef,
}: {
  index: number
  editor: DayEditor
  /** L'heure de référence pour la prochaine étape (un lieu fermé est sauté). */
  now?: Date
  onSelectDay: (target: number, method: DayChangeMethod) => void
  stripRef?: RefObject<HTMLElement | null>
  /** Posé sur la prochaine étape (ou la première) : cible des astuces. */
  highlightRef?: RefObject<HTMLLIElement | null>
  transportRef?: RefObject<HTMLButtonElement | null>
}) {
  const { itinerary } = useTrip()
  const { dayDirection } = useAppNav()
  const day = editor.day
  if (!day) return null

  const previous = itinerary[index - 1]
  const following = itinerary[index + 1]
  const next = findNextActivity(day, now)
  const photos = (day.images ?? []).map((image) => ({
    url: image.url,
    caption: image.caption,
  }))
  const hasExtras = Boolean(
    day.highlights?.length ||
    day.packingTips?.length ||
    day.foodRecommendations?.length ||
    day.tips?.length,
  )
  const metaLine = [
    day.city,
    day.activities.length > 0
      ? `${day.activities.length} étape${day.activities.length > 1 ? 's' : ''}`
      : undefined,
    day.walkingDistance ? `${day.walkingDistance} à pied` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  const goTo = (target: number, method: DayChangeMethod) => {
    if (target < 0 || target >= itinerary.length || target === index) return
    onSelectDay(target, method)
  }

  return (
    <>
      {/* Hors du bloc animé : la bande des jours ne glisse pas et ne saute
          pas quand la hauteur du titre change d'une journée à l'autre. */}
      <DayOverviewStrip
        ref={stripRef}
        itinerary={itinerary}
        current={index}
        onSelect={(target) => goTo(target, 'timeline')}
        className="mt-3"
      />
      <div
        key={index}
        className={cn(
          'flex flex-1 flex-col',
          dayDirection === 'next'
            ? 'animate-[slide-in-from-right_0.3s_ease-out_backwards]'
            : dayDirection === 'previous'
              ? 'animate-[slide-in-from-left_0.3s_ease-out_backwards]'
              : 'animate-fade',
        )}
      >
        <div className="mt-2 px-5">
          <QuickActionsTarget
            entity="day"
            title={day.title}
            description={`Jour ${index + 1} · ${day.city}`}
            actions={editor.dayActions()}
          >
            <p className="text-muted-foreground mt-2.5 text-sm leading-5 font-bold first-letter:uppercase">
              {`${longDate(day.date)} · Jour ${index + 1} sur ${itinerary.length}`}
            </p>
            <h1 className="font-display mt-0.5 text-[30px] leading-[34px]">
              {day.title}
            </h1>
            <p className="text-muted-foreground mt-1 text-[15px] leading-[22px]">
              {metaLine}
            </p>
          </QuickActionsTarget>
        </div>

        {day.notes && (
          <p className="text-muted-foreground mx-5 mt-2 text-[15px] leading-[21px]">
            <PhoneText text={day.notes} />
          </p>
        )}

        {day.transport && (
          <div className="mx-5 mt-4">
            <TransportSummary
              ref={transportRef}
              day={day}
              dayIndex={index}
              editor={editor}
            />
          </div>
        )}

        <div className="mt-5">
          {day.activities.length > 0 ? (
            <DayTimeline
              day={day}
              dayIndex={index}
              nextIndex={next?.index ?? null}
              editor={editor}
              highlightRef={highlightRef}
            />
          ) : (
            <div className="mx-5">
              <DashedAdd
                empty="Rien de prévu"
                label="Ajouter une activité"
                onClick={editor.addActivity}
              />
            </div>
          )}
        </div>

        {photos.length > 0 && (
          <PhotoCarousel
            photos={photos}
            label="Photos du jour"
            className="mt-2"
          />
        )}

        {(editor.stay || hasExtras) && (
          <div className="bg-card border-border divide-border/70 mx-5 mt-4 divide-y overflow-hidden rounded-[18px] border">
            <StayRow dayIndex={index} editor={editor} />
            <DayExtras day={day} editor={editor} />
          </div>
        )}

        <p className="text-muted-foreground mx-5 my-3 flex items-center justify-center gap-1.5 text-xs font-bold">
          <Hand className="size-4" aria-hidden />
          Appui long sur un élément pour plus d’actions
        </p>

        <span className="flex-1" />

        <nav aria-label="Jours voisins" className="mx-5 mt-2 flex gap-2.5">
          {previous ? (
            <button
              type="button"
              onClick={() => goTo(index - 1, 'arrow')}
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
              onClick={() => goTo(index + 1, 'arrow')}
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
    </>
  )
}
