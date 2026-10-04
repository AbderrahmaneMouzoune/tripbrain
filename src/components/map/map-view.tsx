'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LocateFixed, Navigation } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/client'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/mobile/segmented-control'
import {
  ACTIVITY_TYPE_LABELS,
  cityStops,
  directionsUrl,
  findNextActivity,
  formatDateRange,
  formatDuration,
  longDate,
} from '@/components/day/day-logic'
import {
  Pill,
  trackDirections,
  useApplePlatform,
} from '@/components/day/day-ui'
// Leaflet lui-même n'est chargé que dans le navigateur, par `TripLeaflet`,
// à l'ouverture de la carte (import dynamique dans un effet).
import {
  TripLeaflet,
  placedActivities,
  type MapScope,
} from '@/components/map/trip-leaflet'


/**
 * Activité à montrer à l'ouverture de l'onglet Carte (« Voir sur la carte »
 * depuis une fiche). Lue une fois par la carte, puis oubliée.
 */
let pendingFocus: { dayIndex: number; activityId: string } | null = null
export function focusActivityOnMap(dayIndex: number, activityId: string) {
  pendingFocus = { dayIndex, activityId }
}

/** Onglet Carte : la journée ou tout le voyage, en plein écran. */
export function MapView(_props: {}) {
  const { itinerary } = useTrip()
  const { selectedDay, selectDay, push } = useAppNav()
  const apple = useApplePlatform()
  const index = Math.min(Math.max(selectedDay, 0), itinerary.length - 1)
  const day = itinerary[index]

  const [scope, setScope] = useState<MapScope>('day')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    () => {
      const focus = pendingFocus
      pendingFocus = null
      return focus?.activityId ?? null
    },
  )
  const stops = useMemo(() => cityStops(itinerary), [itinerary])
  const currentStop = stops.findIndex(
    (stop) => index >= stop.startIndex && index <= stop.endIndex,
  )
  const [selectedStop, setSelectedStop] = useState<number | null>(null)

  const [position, setPosition] = useState<[number, number] | null>(null)
  const [recenterToken, setRecenterToken] = useState(0)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const placed = placedActivities(day)

  // À chaque journée, on sélectionne la prochaine étape localisée (ou la
  // première) — sauf si une fiche vient de demander une activité précise.
  const lastDay = useRef<string | null>(null)
  useEffect(() => {
    if (!day) return
    const dayChanged = lastDay.current !== null && lastDay.current !== day.id
    lastDay.current = day.id
    const stillPlaced = placed.some(
      (p) => p.activity.id === selectedActivityId,
    )
    if (stillPlaced && !dayChanged) return
    const next = findNextActivity(day)
    const preferred =
      placed.find((p) => p.activity.id === next?.activity.id) ?? placed[0]
    setSelectedActivityId(preferred?.activity.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id, placed.length])

  useEffect(() => {
    if (scope === 'trip') setSelectedStop(currentStop >= 0 ? currentStop : 0)
  }, [scope, currentStop])

  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current)
    },
    [],
  )

  if (!day) return null

  const showMessage = (text: string) => {
    if (messageTimer.current) clearTimeout(messageTimer.current)
    setMessage(text)
    messageTimer.current = setTimeout(() => setMessage(null), 4000)
  }

  const locate = () => {
    if (!('geolocation' in navigator)) {
      trackEvent('location_requested', { outcome: 'unavailable' })
      showMessage('Position indisponible sur cet appareil')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLocating(false)
        setPosition([result.coords.latitude, result.coords.longitude])
        setRecenterToken((token) => token + 1)
        trackEvent('location_requested', { outcome: 'granted' })
      },
      (error) => {
        setLocating(false)
        const denied = error.code === error.PERMISSION_DENIED
        trackEvent('location_requested', {
          outcome: denied ? 'denied' : 'unavailable',
        })
        showMessage(
          denied
            ? 'Accès à la position refusé dans le navigateur'
            : 'Position introuvable pour le moment',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const goToDay = (target: number) => {
    if (target < 0 || target >= itinerary.length) return
    selectDay(target, 'map')
  }

  const previous = itinerary[index - 1]
  const following = itinerary[index + 1]

  const selected =
    scope === 'day'
      ? placed.find((p) => p.activity.id === selectedActivityId)
      : undefined
  const stop =
    scope === 'trip' && selectedStop !== null ? stops[selectedStop] : undefined

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-0">
      <TripLeaflet
        className="absolute inset-0"
        itinerary={itinerary}
        dayIndex={index}
        scope={scope}
        selectedActivityId={selectedActivityId}
        selectedStop={selectedStop}
        onSelectActivity={setSelectedActivityId}
        onSelectStop={(stopIndex) => {
          setSelectedStop(stopIndex)
          const target = stops[stopIndex]
          if (target) selectDay(target.startIndex, 'map')
        }}
        userPosition={position}
        recenterToken={recenterToken}
      />

      <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-[1000] mx-auto flex max-w-xl flex-col gap-2">
        <div className="bg-card border-border flex items-center gap-1 rounded-[20px] border p-1 shadow-[0_4px_14px_rgb(14_26_58/0.12)]">
          <button
            type="button"
            onClick={() => goToDay(index - 1)}
            disabled={!previous}
            aria-label={
              previous ? `Jour précédent : ${longDate(previous.date)}` : 'Premier jour'
            }
            className="bg-background pressable flex size-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-40"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 text-center" aria-live="polite">
            <p className="truncate text-base leading-5 font-black">
              Jour {index + 1} · {day.city}
            </p>
            <p className="text-muted-foreground truncate text-xs font-extrabold first-letter:uppercase">
              {longDate(day.date)} · {day.activities.length} étape
              {day.activities.length > 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => goToDay(index + 1)}
            disabled={!following}
            aria-label={
              following ? `Jour suivant : ${longDate(following.date)}` : 'Dernier jour'
            }
            className="bg-background pressable flex size-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-40"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
        <SegmentedControl
          label="Étendue de la carte"
          options={[
            { value: 'day', label: 'Jour' },
            { value: 'trip', label: 'Tout le voyage' },
          ]}
          value={scope}
          onChange={setScope}
          className="w-64 shadow-[0_2px_8px_rgb(14_26_58/0.1)]"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] mx-auto flex max-w-xl flex-col gap-2">
        {message && (
          <p
            role="status"
            className="bg-ink text-ink-foreground animate-pop self-center rounded-full px-4 py-2 text-sm font-extrabold"
          >
            {message}
          </p>
        )}
        <div className="flex items-end justify-between">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-card/75 text-muted-foreground pointer-events-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          >
            © OpenStreetMap
          </a>
          <Button
            variant="outline"
            size="icon-round"
            onClick={locate}
            disabled={locating}
            aria-label="Afficher ma position"
            className="border-border bg-card text-primary pointer-events-auto shadow-md"
          >
            <LocateFixed className={locating ? 'animate-shimmer-soft' : ''} />
          </Button>
        </div>

        {scope === 'day' && selected && (
          <section
            aria-label="Repère sélectionné"
            className="bg-card border-border animate-rise pointer-events-auto rounded-[22px] border p-3.5 shadow-[0_8px_24px_rgb(14_26_58/0.16)]"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-[17px] font-black"
              >
                {selected.index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg leading-6 font-black">
                  {selected.activity.name}
                </h2>
                <p className="text-muted-foreground truncate text-[13px] font-bold">
                  {[
                    ACTIVITY_TYPE_LABELS[selected.activity.type],
                    formatDuration(selected.activity.duration),
                    selected.activity.openAt,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {selected.activity.reservationRequired && (
                <Pill tone="secondary" className="text-[11px]">
                  Réservation
                </Pill>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="lg2"
                className="flex-1 px-2"
                onClick={() =>
                  push({
                    kind: 'activity',
                    dayIndex: index,
                    activityId: selected.activity.id,
                  })
                }
              >
                Voir plus d’infos
              </Button>
              <Button asChild size="lg2" className="flex-1 px-2">
                <a
                  href={directionsUrl(selected.activity, apple) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackDirections('activity', 'map')}
                >
                  <Navigation className="size-[18px]" aria-hidden />Y aller
                </a>
              </Button>
            </div>
          </section>
        )}

        {scope === 'day' && placed.length === 0 && (
          <section className="bg-card border-border pointer-events-auto rounded-[22px] border p-3.5 shadow-[0_8px_24px_rgb(14_26_58/0.16)]">
            <p className="text-[15px] font-extrabold">
              Aucune activité localisée ce jour
            </p>
            <p className="text-muted-foreground text-[13px]">
              Ajoutez des coordonnées à une activité pour la voir ici.
            </p>
            <Button
              variant="outline"
              size="lg2"
              className="mt-3 w-full"
              onClick={() => push({ kind: 'day', dayIndex: index })}
            >
              Voir la journée
            </Button>
          </section>
        )}

        {stop && selectedStop !== null && (
          <section
            aria-label="Étape sélectionnée"
            className="bg-card border-border animate-rise pointer-events-auto rounded-[22px] border p-3.5 shadow-[0_8px_24px_rgb(14_26_58/0.16)]"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-[17px] font-black"
              >
                {selectedStop + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg leading-6 font-black">
                  {stop.city}
                </h2>
                <p className="text-muted-foreground truncate text-[13px] font-bold">
                  {stop.startIndex === stop.endIndex
                    ? `Jour ${stop.startIndex + 1}`
                    : `Jours ${stop.startIndex + 1} à ${stop.endIndex + 1}`}{' '}
                  ·{' '}
                  {formatDateRange(
                    itinerary[stop.startIndex].date,
                    itinerary[stop.endIndex].date,
                  )}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="lg2"
                className="flex-1 px-2"
                onClick={() =>
                  push({ kind: 'day', dayIndex: stop.startIndex })
                }
              >
                Voir plus d’infos
              </Button>
              <Button
                size="lg2"
                className="flex-1 px-2"
                onClick={() => {
                  selectDay(stop.startIndex, 'map')
                  setScope('day')
                }}
              >
                Voir les étapes
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
