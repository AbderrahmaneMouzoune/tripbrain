'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Hand,
  MoreHorizontal,
  MoveHorizontal,
  Pencil,
  Ticket,
} from 'lucide-react'
import { tripStatus } from '@/lib/trips'
import { useSwipe } from '@/hooks/use-swipe'
import { usePreferences } from '@/hooks/use-preferences'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav, type DayChangeMethod } from '@/components/app/navigation'
import { useEditSession } from '@/components/app/edit-session'
import { Button } from '@/components/ui/button'
import { useDayEditor } from '@/components/day/use-day-editor'
import { DayView } from '@/components/day/day-view'
import { BeforeTrip, AfterTrip } from '@/components/today/trip-bookends'
import {
  ContextualTip,
  canShowSpontaneousTip,
  noteSpontaneousTip,
  tipAvailable,
  type TipId,
} from '@/components/today/contextual-tip'
import { GroupSyncPill } from '@/components/share/group-sync-button'

/** L'heure qui passe : la prochaine étape change quand un lieu ferme. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Onglet Aujourd'hui : avant le départ, pendant le voyage, ou après. */
export function TodayView(_props: {}) {
  const { itinerary } = useTrip()
  const now = useNow()
  if (itinerary.length === 0) return null
  const phase = tripStatus(itinerary, now)
  if (phase === 'upcoming') return <BeforeTrip now={now} />
  if (phase === 'past') return <AfterTrip />
  return <TodayDay now={now} />
}

function TodayDay({ now }: { now: Date }) {
  const { itinerary } = useTrip()
  const { selectedDay, selectDay, push, stack } = useAppNav()
  const { startEditing } = useEditSession()
  const { markTipSeen, update } = usePreferences()
  const index = Math.min(Math.max(selectedDay, 0), itinerary.length - 1)
  const editor = useDayEditor(index)
  const day = itinerary[index]

  const stripRef = useRef<HTMLElement>(null)
  const activityRef = useRef<HTMLLIElement>(null)
  const transportRef = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState<TipId | null>(null)

  const goTo = useCallback(
    (target: number, method: DayChangeMethod) => {
      if (target < 0 || target >= itinerary.length) return
      selectDay(target, method)
    },
    [itinerary.length, selectDay],
  )

  const swipe = useSwipe({
    onSwipeLeft: () => {
      // Le geste est trouvé : l'astuce qui l'annonce devient inutile.
      markTipSeen('swipe-days')
      goTo(index + 1, 'swipe')
    },
    onSwipeRight: () => {
      markTipSeen('swipe-days')
      goTo(index - 1, 'swipe')
    },
  })

  // Astuce 1 : l'appui long, dès qu'il y a des activités sous les yeux.
  // Astuce 3 : les documents, sur une journée de trajet, une fois la première
  // apprise. Jamais deux astuces spontanées dans la même visite.
  useEffect(() => {
    // Pas d'astuce sous un écran ouvert par-dessus l'onglet.
    if (tip || stack.length > 0 || !canShowSpontaneousTip()) return
    const timer = setTimeout(() => {
      if (!canShowSpontaneousTip()) return
      if (day.activities.length > 0 && tipAvailable('long-press')) {
        noteSpontaneousTip()
        setTip('long-press')
      } else if (
        day.transport &&
        !tipAvailable('long-press') &&
        tipAvailable('documents')
      ) {
        noteSpontaneousTip()
        setTip('documents')
      }
    }, 900)
    return () => clearTimeout(timer)
  }, [day.activities.length, day.transport, tip, stack.length])

  const selectFromView = (target: number, method: DayChangeMethod) => {
    goTo(target, method)
    // Astuce 2 : on change de jour en touchant la bande ; le balayage irait
    // plus vite. On le dit à ce moment-là, une fois l'astuce 1 apprise.
    if (
      method === 'timeline' &&
      !tip &&
      !tipAvailable('long-press') &&
      tipAvailable('swipe-days')
    ) {
      setTimeout(() => setTip('swipe-days'), 450)
    }
  }

  const closeTip = (skipAll: boolean) => {
    if (!tip) return
    if (skipAll) update({ tipsDismissed: true })
    else markTipSeen(tip)
    setTip(null)
  }

  // La modification passe par l'écran de la journée, en mode édition.
  const edit = () => {
    push({ kind: 'day', dayIndex: index })
    startEditing()
  }

  const transport = day.transport

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col pb-6"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <header className="flex items-center gap-2 px-5 pt-[calc(var(--safe-top)+12px)]">
        <div className="min-w-0 flex-1">
          <GroupSyncPill />
        </div>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Modifier la journée"
          onClick={edit}
          className="border-border bg-card shrink-0 shadow-none"
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Voyage et réglages"
          onClick={() => push({ kind: 'menu' })}
          className="border-border bg-card shrink-0 shadow-none"
        >
          <MoreHorizontal />
        </Button>
      </header>

      <DayView
        index={index}
        editor={editor}
        now={now}
        onSelectDay={selectFromView}
        stripRef={stripRef}
        highlightRef={activityRef}
        transportRef={transportRef}
      />

      {editor.sheets}

      {tip === 'long-press' && (
        <ContextualTip
          id="long-press"
          target={activityRef}
          step={1}
          icon={Hand}
          title="Gardez le doigt appuyé"
          body="sur une activité pour la cocher, copier son adresse ou la chercher sur Google."
          onAcknowledge={() => closeTip(false)}
          onSkipAll={() => closeTip(true)}
        />
      )}
      {tip === 'swipe-days' && (
        <ContextualTip
          id="swipe-days"
          target={stripRef}
          step={2}
          icon={MoveHorizontal}
          title="Balayez pour changer de jour"
          body="Glissez le doigt vers la gauche ou la droite sur l’écran : la journée suivante ou précédente arrive aussitôt."
          onAcknowledge={() => closeTip(false)}
          onSkipAll={() => closeTip(true)}
        />
      )}
      {tip === 'documents' && transport && (
        <ContextualTip
          id="documents"
          target={transportRef}
          step={3}
          icon={Ticket}
          title="Vos billets, même hors ligne"
          body="Rangez le billet de ce trajet dans l’onglet Documents : il s’ouvrira d’un geste depuis la fiche du trajet."
          onAcknowledge={() => closeTip(false)}
          onSkipAll={() => closeTip(true)}
        />
      )}
    </div>
  )
}
