'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { Activity } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_TYPE_LABELS,
  formatDuration,
  reorderTarget,
} from '@/components/day/day-logic'
import {
  ACTIVITY_STATUS_LABELS,
  ActivityNumber,
} from '@/components/day/day-ui'

/** Écart entre deux lignes (gap de la liste), compté dans le décalage. */
const ROW_GAP = 2
/** Au-delà de ce déplacement, l'appui sur la poignée devient un glisser. */
const DRAG_THRESHOLD = 6

function ordinal(n: number) {
  return n === 1 ? '1er' : `${n}e`
}

interface DragState {
  id: string
  from: number
  target: number
  dy: number
  shift: number
}

/**
 * Activités du mode édition, à réordonner de trois façons :
 * - glisser la poignée (souris, doigt, stylet : événements de pointeur) ;
 * - toucher la poignée (ou l'activer au clavier) pour passer la ligne en mode
 *   déplacement, puis utiliser les boutons monter / descendre qui apparaissent ;
 * - au clavier, en mode déplacement, les flèches haut et bas.
 * Chaque déplacement est annoncé aux lecteurs d'écran.
 */
export function ReorderableActivities({
  activities,
  onMove,
  onEdit,
  onDelete,
}: {
  activities: Activity[]
  onMove: (activityId: string, target: number) => void
  onEdit: (activity: Activity) => void
  onDelete: (activityId: string) => void
}) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const handleRefs = useRef(new Map<string, HTMLButtonElement>())
  const pending = useRef<{
    id: string
    from: number
    startY: number
    mids: number[]
    shift: number
    target: number
    active: boolean
    pointerId: number
  } | null>(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(null), 3500)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  // Après un déplacement au clavier, la ligne a changé de place : la poignée
  // garde le focus pour enchaîner.
  useEffect(() => {
    if (movingId) handleRefs.current.get(movingId)?.focus()
  }, [activities, movingId])

  const announce = (activity: Activity, target: number) => {
    setAnnouncement(
      `${activity.name || 'Activité'} déplacée en position ${target + 1} sur ${activities.length}.`,
    )
  }

  const moveBy = (activity: Activity, index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= activities.length) return
    onMove(activity.id, target)
    announce(activity, target)
  }

  const onPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    activity: Activity,
    index: number,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const rects = activities.map((a) =>
      rowRefs.current.get(a.id)?.getBoundingClientRect(),
    )
    if (rects.some((rect) => !rect)) return
    const boxes = rects as DOMRect[]
    pending.current = {
      id: activity.id,
      from: index,
      startY: event.clientY,
      mids: boxes.map((box) => box.top + box.height / 2),
      shift: boxes[index].height + ROW_GAP,
      target: index,
      active: false,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = pending.current
    if (!state || state.pointerId !== event.pointerId) return
    const dy = event.clientY - state.startY
    if (!state.active && Math.abs(dy) < DRAG_THRESHOLD) return
    state.active = true
    event.preventDefault()
    const target = reorderTarget(state.mids, state.from, state.mids[state.from] + dy)
    state.target = target
    setDrag({ id: state.id, from: state.from, target, dy, shift: state.shift })
  }

  const endDrag = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const state = pending.current
    pending.current = null
    if (!state) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!state.active) return
    suppressClick.current = true
    setDrag(null)
    if (commit && state.target !== state.from) {
      const activity = activities[state.from]
      onMove(state.id, state.target)
      if (activity) announce(activity, state.target)
    }
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ol className="bg-card border-border flex flex-col gap-0.5 rounded-[20px] border p-1.5">
        {activities.map((activity, index) => {
          const isDragged = drag?.id === activity.id
          const isMoving = movingId === activity.id
          let offset = 0
          if (drag && !isDragged) {
            if (drag.from < drag.target && index > drag.from && index <= drag.target)
              offset = -drag.shift
            if (drag.from > drag.target && index >= drag.target && index < drag.from)
              offset = drag.shift
          }
          const status = activity.status ?? 'planned'
          const meta = [
            status !== 'planned' ? ACTIVITY_STATUS_LABELS[status] : undefined,
            ACTIVITY_TYPE_LABELS[activity.type],
            formatDuration(activity.duration),
          ]
            .filter(Boolean)
            .join(' · ')
          const name = activity.name || 'Activité sans nom'

          return (
            <li
              key={activity.id}
              ref={(element) => {
                if (element) rowRefs.current.set(activity.id, element)
                else rowRefs.current.delete(activity.id)
              }}
              className={cn(
                'bg-card relative flex items-center gap-1 rounded-2xl py-1',
                isDragged
                  ? 'ring-primary z-10 shadow-[0_18px_36px_rgb(14_26_58/0.28)] ring-2'
                  : 'transition-transform duration-200',
                isMoving && 'ring-primary ring-2',
              )}
              style={{
                transform: isDragged
                  ? `translateY(${drag.dy}px) rotate(-1.5deg)`
                  : offset
                    ? `translateY(${offset}px)`
                    : undefined,
              }}
            >
              <button
                type="button"
                ref={(element) => {
                  if (element) handleRefs.current.set(activity.id, element)
                  else handleRefs.current.delete(activity.id)
                }}
                aria-label={`Déplacer ${name}`}
                aria-pressed={isMoving || isDragged}
                aria-describedby="reorder-help"
                onPointerDown={(event) => onPointerDown(event, activity, index)}
                onPointerMove={onPointerMove}
                onPointerUp={(event) => endDrag(event, true)}
                onPointerCancel={(event) => endDrag(event, false)}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  setMovingId(isMoving ? null : activity.id)
                }}
                onKeyDown={(event) => {
                  if (!isMoving) return
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    moveBy(activity, index, -1)
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    moveBy(activity, index, 1)
                  } else if (event.key === 'Escape') {
                    setMovingId(null)
                  }
                }}
                className={cn(
                  'flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg outline-none select-none active:cursor-grabbing',
                  'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  isMoving || isDragged
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}
              >
                <GripVertical className="size-5" aria-hidden />
              </button>
              <ActivityNumber
                index={isDragged ? drag.target : index}
                activity={
                  isDragged ? { ...activity, status: 'planned' } : activity
                }
                isNext={isDragged}
                size="sm"
              />
              <span className="min-w-0 flex-1 pl-1.5">
                <span className="block truncate text-[15px] font-extrabold">
                  {name}
                </span>
                <span
                  className={cn(
                    'block truncate text-[13px]',
                    isDragged
                      ? 'text-primary-strong font-bold'
                      : 'text-muted-foreground',
                  )}
                >
                  {isDragged
                    ? `Déplacé · ${ordinal(drag.from + 1)} → ${ordinal(drag.target + 1)}`
                    : meta}
                </span>
              </span>
              {isMoving ? (
                <>
                  <button
                    type="button"
                    onClick={() => moveBy(activity, index, -1)}
                    disabled={index === 0}
                    aria-label={`Monter ${name}`}
                    className="text-primary pressable flex size-11 items-center justify-center rounded-xl disabled:opacity-30"
                  >
                    <ArrowUp className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(activity, index, 1)}
                    disabled={index === activities.length - 1}
                    aria-label={`Descendre ${name}`}
                    className="text-primary pressable flex size-11 items-center justify-center rounded-xl disabled:opacity-30"
                  >
                    <ArrowDown className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovingId(null)}
                    aria-label="Terminer le déplacement"
                    className="bg-primary-soft text-primary-strong pressable mr-1 flex size-11 items-center justify-center rounded-xl"
                  >
                    <Check className="size-5" aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(activity)}
                    aria-label={`Modifier ${name}`}
                    className="text-primary pressable flex size-11 items-center justify-center rounded-xl"
                  >
                    <Pencil className="size-5" aria-hidden />
                  </button>
                  {confirmDelete === activity.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(null)
                        onDelete(activity.id)
                        setAnnouncement(`${name} supprimée.`)
                      }}
                      className="bg-destructive-soft text-destructive pressable animate-pop mr-1 flex h-11 items-center rounded-xl px-2.5 text-[13px] font-extrabold"
                    >
                      Supprimer ?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(activity.id)}
                      aria-label={`Supprimer ${name}`}
                      className="text-destructive pressable flex size-11 items-center justify-center rounded-xl"
                    >
                      <Trash2 className="size-5" aria-hidden />
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
      <p id="reorder-help" className="sr-only">
        Glissez la poignée, ou touchez-la puis utilisez les boutons monter et
        descendre. Au clavier : Entrée, puis les flèches haut et bas.
      </p>
    </>
  )
}
