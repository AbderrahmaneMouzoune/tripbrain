'use client'

import { useCallback, useState, type ReactNode } from 'react'
import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'
import {
  accommodationForm,
  activityForm,
  dayForm,
  transportForm,
} from '@/lib/edit-fields'
import {
  createEmptyAccommodation,
  createEmptyActivity,
  createEmptyTransport,
  moveActivity,
  removeActivity,
  removeDayTextListItem,
  setAccommodation,
  setActivityStatus,
  setTransport,
  upsertActivity,
  type ActivityStatus,
  type DayTextList,
} from '@/lib/itinerary-edit'
import {
  buildAccommodationActions,
  buildActivityActions,
  buildDayActions,
  buildDayListItemActions,
  buildTransportActions,
  type QuickAction,
} from '@/lib/quick-actions'
import { trackEvent } from '@/lib/analytics/client'
import { useTrip } from '@/components/app/trip-provider'
import { useEditSession } from '@/components/app/edit-session'
import { EntityEditSheet } from '@/components/edit/entity-edit-sheet'
import { useCopyToast } from '@/components/day/day-ui'
import { findStay, moveActivityTo, type Stay } from '@/components/day/day-logic'

type EditorKind = 'day' | 'activity' | 'transport' | 'accommodation'

/**
 * Tout ce qui modifie une journée, partagé par le roadbook, les fiches et
 * l'onglet Aujourd'hui : formulaires d'édition, changements de statut,
 * réordonnancement, suppressions et menus d'appui long. Chaque modification
 * passe par `saveDay`, donc par la session d'édition quand elle est ouverte.
 *
 * L'hébergement est rattaché au jour d'arrivée : un soir suivant, on édite la
 * journée qui le porte (`stay.ownerIndex`), pas celle qu'on regarde.
 */
export function useDayEditor(dayIndex: number) {
  const { itinerary } = useTrip()
  const { saveDay } = useEditSession()
  const day: DayItinerary | undefined = itinerary[dayIndex]
  const stay: Stay | null = findStay(itinerary, dayIndex)
  const { copyText, toast } = useCopyToast()

  // Le formulaire garde l'entité éditée après fermeture pour son animation de
  // sortie : on ne remet pas les brouillons à zéro.
  const [openEditor, setOpenEditor] = useState<EditorKind | null>(null)
  const [dayDraft, setDayDraft] = useState<DayItinerary | null>(null)
  const [activityDraft, setActivityDraft] = useState<Activity | null>(null)
  const [transportDraft, setTransportDraft] = useState<Transport | null>(null)
  const [accommodationDraft, setAccommodationDraft] = useState<{
    value: Accommodation
    ownerIndex: number
    isNew: boolean
  } | null>(null)

  const save = useCallback(
    (next: DayItinerary) => {
      saveDay(next)
    },
    [saveDay],
  )

  const editDay = () => {
    if (!day) return
    setDayDraft(day)
    setOpenEditor('day')
  }
  const editActivity = (activity: Activity) => {
    setActivityDraft(activity)
    setOpenEditor('activity')
  }
  const addActivity = () => editActivity(createEmptyActivity())
  const editTransport = (transport?: Transport) => {
    setTransportDraft(transport ?? createEmptyTransport())
    setOpenEditor('transport')
  }
  const editAccommodation = () => {
    if (!day) return
    if (stay) {
      setAccommodationDraft({
        value: stay.accommodation,
        ownerIndex: stay.ownerIndex,
        isNew: false,
      })
    } else {
      setAccommodationDraft({
        value: createEmptyAccommodation(day),
        ownerIndex: dayIndex,
        isNew: true,
      })
    }
    setOpenEditor('accommodation')
  }

  const setStatus = (activityId: string, status: ActivityStatus) => {
    if (!day) return
    save(setActivityStatus(day, activityId, status))
  }
  const deleteActivity = (activityId: string) => {
    if (!day) return
    trackEvent('entity_edited', { entity: 'activity', action: 'delete' })
    save(removeActivity(day, activityId))
  }
  const moveBy = (activityId: string, offset: number) => {
    if (!day) return
    trackEvent('entity_edited', { entity: 'activity', action: 'reorder' })
    save(moveActivity(day, activityId, offset))
  }
  const moveTo = (activityId: string, target: number) => {
    if (!day) return
    const next = moveActivityTo(day, activityId, target)
    if (next === day) return
    trackEvent('entity_edited', { entity: 'activity', action: 'reorder' })
    save(next)
  }
  const deleteTransport = () => {
    if (!day) return
    trackEvent('entity_edited', { entity: 'transport', action: 'delete' })
    save(setTransport(day, undefined))
  }
  const deleteAccommodation = () => {
    if (!stay) return
    trackEvent('entity_edited', { entity: 'accommodation', action: 'delete' })
    save(setAccommodation(itinerary[stay.ownerIndex], undefined))
  }

  const onCopy = (text: string) => {
    void copyText(text)
  }

  const dayActions = (): QuickAction[] =>
    day
      ? buildDayActions(
          // Un hébergement hérité d'un soir précédent compte : on ne propose
          // pas d'en ajouter un second.
          stay ? { ...day, accommodation: stay.accommodation } : day,
          {
            onEdit: editDay,
            onAddActivity: addActivity,
            onAddTransport: () => editTransport(),
            onAddAccommodation: editAccommodation,
            onCopy,
          },
        )
      : []

  const activityActions = (activity: Activity, index: number) =>
    day
      ? buildActivityActions(
          activity,
          {
            onEdit: () => editActivity(activity),
            onStatusChange: (status) => setStatus(activity.id, status),
            onMove: (offset) => moveBy(activity.id, offset),
            onDelete: () => deleteActivity(activity.id),
            onCopy,
          },
          {
            canMoveUp: index > 0,
            canMoveDown: index < day.activities.length - 1,
            city: day.city,
          },
        )
      : []

  const transportActions = () =>
    day?.transport
      ? buildTransportActions(day.transport, {
          onEdit: () => editTransport(day.transport),
          onDelete: deleteTransport,
          onCopy,
        })
      : []

  const accommodationActions = () =>
    stay
      ? buildAccommodationActions(stay.accommodation, {
          onEdit: editAccommodation,
          onDelete: deleteAccommodation,
          onCopy,
        })
      : []

  const listItemActions = (list: DayTextList, item: string, index: number) =>
    day
      ? buildDayListItemActions(
          item,
          { list, city: day.city },
          {
            onEditList: editDay,
            onRemove: () => {
              trackEvent('entity_edited', { entity: 'day', action: 'update' })
              save(removeDayTextListItem(day, list, index))
            },
            onCopy,
          },
        )
      : []

  const closeEditor = (open: boolean) => {
    if (!open) setOpenEditor(null)
  }

  const activityExists = Boolean(
    day &&
    activityDraft &&
    day.activities.some((a) => a.id === activityDraft.id),
  )

  const sheets: ReactNode = day ? (
    <>
      {toast}
      {dayDraft && (
        <EntityEditSheet
          open={openEditor === 'day'}
          onOpenChange={closeEditor}
          title="Modifier la journée"
          schema={dayForm}
          value={dayDraft}
          onSubmit={(next) => {
            trackEvent('entity_edited', { entity: 'day', action: 'update' })
            save(next)
          }}
        />
      )}
      {activityDraft && (
        <EntityEditSheet
          open={openEditor === 'activity'}
          onOpenChange={closeEditor}
          title={activityExists ? "Modifier l'activité" : 'Nouvelle activité'}
          schema={activityForm}
          value={activityDraft}
          onSubmit={(next) => {
            trackEvent('entity_edited', {
              entity: 'activity',
              action: activityExists ? 'update' : 'create',
            })
            save(upsertActivity(day, next))
          }}
          onDelete={
            activityExists ? () => deleteActivity(activityDraft.id) : undefined
          }
        />
      )}
      {transportDraft && (
        <EntityEditSheet
          open={openEditor === 'transport'}
          onOpenChange={closeEditor}
          title={day.transport ? 'Modifier le transport' : 'Nouveau transport'}
          schema={transportForm}
          value={transportDraft}
          onSubmit={(next) => {
            trackEvent('entity_edited', {
              entity: 'transport',
              action: day.transport ? 'update' : 'create',
            })
            save(setTransport(day, next))
          }}
          onDelete={day.transport ? deleteTransport : undefined}
        />
      )}
      {accommodationDraft && (
        <EntityEditSheet
          open={openEditor === 'accommodation'}
          onOpenChange={closeEditor}
          title={
            accommodationDraft.isNew
              ? 'Nouvel hébergement'
              : "Modifier l'hébergement"
          }
          schema={accommodationForm}
          value={accommodationDraft.value}
          onSubmit={(next) => {
            const owner = itinerary[accommodationDraft.ownerIndex]
            if (!owner) return
            trackEvent('entity_edited', {
              entity: 'accommodation',
              action: accommodationDraft.isNew ? 'create' : 'update',
            })
            save(setAccommodation(owner, next))
          }}
          onDelete={accommodationDraft.isNew ? undefined : deleteAccommodation}
        />
      )}
    </>
  ) : (
    toast
  )

  return {
    day,
    stay,
    copyText,
    editDay,
    editActivity,
    addActivity,
    editTransport,
    editAccommodation,
    setStatus,
    deleteActivity,
    moveBy,
    moveTo,
    save,
    dayActions,
    activityActions,
    transportActions,
    accommodationActions,
    listItemActions,
    sheets,
  }
}

export type DayEditor = ReturnType<typeof useDayEditor>
