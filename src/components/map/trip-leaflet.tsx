'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  LatLngExpression,
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from 'leaflet'
import { MapPin } from 'lucide-react'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import { cityStops } from '@/components/day/day-logic'

export type MapScope = 'day' | 'trip'

type Leaflet = typeof import('leaflet')

/** Activité localisée, avec son numéro dans le programme du jour. */
export interface PlacedActivity {
  activity: Activity & { coordinates: [number, number] }
  index: number
}

export function placedActivities(day: DayItinerary | undefined) {
  if (!day) return []
  return day.activities.flatMap((activity, index) =>
    Array.isArray(activity.coordinates) && activity.coordinates.length === 2
      ? [{ activity, index } as PlacedActivity]
      : [],
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Les repères sont du HTML injecté par Leaflet : on les habille des mêmes
// classes que le reste de l'interface, pour garder les mêmes couleurs.

function pinHtml(label: string, tone: 'primary' | 'done' | 'skipped') {
  const toneClass =
    tone === 'done'
      ? 'bg-success text-success-foreground'
      : tone === 'skipped'
        ? 'bg-muted text-muted-foreground'
        : 'bg-primary text-primary-foreground'
  return `<span class="flex size-11 items-center justify-center"><span class="${toneClass} border-card flex size-[30px] items-center justify-center rounded-full border-[2.5px] font-sans text-sm font-black shadow-md">${escapeHtml(label)}</span></span>`
}

function selectedPinHtml(label: string, name: string) {
  return `<span class="relative flex size-[52px] items-center justify-center"><span class="animate-bounce-soft bg-secondary text-secondary-foreground border-card ring-secondary/25 flex size-[42px] items-center justify-center rounded-full border-[3px] font-sans text-lg font-black shadow-lg ring-[6px]">${escapeHtml(label)}</span><span class="bg-ink text-ink-foreground absolute top-3 left-[50px] max-w-[180px] truncate rounded-[10px] px-2.5 py-1 font-sans text-[13px] font-black whitespace-nowrap shadow-md">${escapeHtml(name)}</span></span>`
}

const USER_PIN_HTML =
  '<span class="bg-primary/20 flex size-11 items-center justify-center rounded-full"><span class="animate-halo bg-primary border-card size-4 rounded-full border-[3px] shadow-md"></span></span>'

/**
 * Carte Leaflet du voyage : repères numérotés des activités d'une journée, ou
 * une étape par ville pour tout le voyage, reliés par un tracé en pointillés.
 * Leaflet n'est chargé que dans le navigateur, à l'ouverture de la carte.
 */
export function TripLeaflet({
  itinerary,
  dayIndex,
  scope,
  selectedActivityId,
  selectedStop,
  onSelectActivity,
  onSelectStop,
  userPosition,
  recenterToken,
  className,
}: {
  itinerary: DayItinerary[]
  dayIndex: number
  scope: MapScope
  selectedActivityId: string | null
  selectedStop: number | null
  onSelectActivity: (activityId: string) => void
  onSelectStop: (stopIndex: number) => void
  userPosition: [number, number] | null
  /** Change à chaque demande de recentrage sur la position. */
  recenterToken: number
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<Leaflet | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LeafletMarker[]>([])
  const routeRef = useRef<LeafletPolyline | null>(null)
  const routeHaloRef = useRef<LeafletPolyline | null>(null)
  const userMarkerRef = useRef<LeafletMarker | null>(null)
  const fittedKeyRef = useRef<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Les rappels changent d'identité à chaque rendu : on garde les derniers.
  const handlersRef = useRef({ onSelectActivity, onSelectStop })
  handlersRef.current = { onSelectActivity, onSelectStop }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !containerRef.current || mapRef.current) return
      leafletRef.current = L
      const map = L.map(containerRef.current, {
        center: itinerary[dayIndex]?.coordinates ?? [0, 0],
        zoom: 12,
        zoomControl: false,
        // L'attribution OpenStreetMap est affichée par l'écran, au-dessus de
        // la carte d'aperçu, plutôt que dans un coin masqué.
        attributionControl: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
      setIsLoaded(true)
    }
    void init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = []
      routeRef.current = null
      routeHaloRef.current = null
      userMarkerRef.current = null
      fittedKeyRef.current = null
    }
    // La carte se crée une fois ; les couches suivent dans l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!isLoaded || !L || !map) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
    routeRef.current?.remove()
    routeRef.current = null
    routeHaloRef.current?.remove()
    routeHaloRef.current = null

    // Tracé façon maquette : un liseré blanc qui détache le pointillé du fond,
    // puis des points qui avancent dans le sens du parcours.
    const drawRoute = (
      line: [number, number][],
      tone: 'primary' | 'secondary',
    ) => {
      routeHaloRef.current = L.polyline(line, {
        className: 'tb-route-halo',
        weight: 8,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map)
      routeRef.current = L.polyline(line, {
        className:
          tone === 'primary' ? 'tb-route tb-route-primary' : 'tb-route',
        weight: 4,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map)
    }

    const addMarker = (
      coordinates: [number, number],
      html: string,
      size: number,
      label: string,
      selected: boolean,
      onSelect?: () => void,
    ) => {
      const marker = L.marker(coordinates, {
        icon: L.divIcon({
          className: '',
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: Boolean(onSelect),
        interactive: Boolean(onSelect),
        zIndexOffset: selected ? 1000 : 0,
      }).addTo(map)
      const element = marker.getElement()
      if (element && onSelect) {
        element.setAttribute('aria-label', label)
        if (selected) element.setAttribute('aria-pressed', 'true')
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        })
        marker.on('click', onSelect)
      }
      markersRef.current.push(marker)
      return marker
    }

    const points: [number, number][] = []
    let selectedPoint: [number, number] | null = null

    if (scope === 'trip') {
      const stops = cityStops(itinerary)
      stops.forEach((stop, stopIndex) => {
        const selected = stopIndex === selectedStop
        const label = String(stopIndex + 1)
        addMarker(
          stop.coordinates,
          selected
            ? selectedPinHtml(label, stop.city)
            : pinHtml(label, 'primary'),
          selected ? 52 : 44,
          `Étape ${label} : ${stop.city}${selected ? ', sélectionnée' : ''}`,
          selected,
          () => handlersRef.current.onSelectStop(stopIndex),
        )
        points.push(stop.coordinates)
        if (selected) selectedPoint = stop.coordinates
      })
      if (points.length > 1) drawRoute(points, 'primary')
    } else {
      const day = itinerary[dayIndex]
      const placed = placedActivities(day)
      placed.forEach(({ activity, index }) => {
        const selected = activity.id === selectedActivityId
        const label = String(index + 1)
        const status = activity.status ?? 'planned'
        addMarker(
          activity.coordinates,
          selected
            ? selectedPinHtml(label, activity.name)
            : pinHtml(
                label,
                status === 'done'
                  ? 'done'
                  : status === 'skipped'
                    ? 'skipped'
                    : 'primary',
              ),
          selected ? 52 : 44,
          `Étape ${label} : ${activity.name}${selected ? ', sélectionnée' : ''}`,
          selected,
          () => handlersRef.current.onSelectActivity(activity.id),
        )
        points.push(activity.coordinates)
        if (selected) selectedPoint = activity.coordinates
      })
      if (placed.length > 1) drawRoute(points, 'secondary')
      // Aucune activité localisée : le centre de la journée situe au moins la ville.
      if (placed.length === 0 && day) {
        addMarker(
          day.coordinates,
          pinHtml(String(day.dayNumber), 'primary'),
          44,
          day.city,
          false,
        )
        points.push(day.coordinates)
      }
    }

    // On recadre quand la journée ou l'étendue change, pas à chaque sélection :
    // la carte ne doit pas sauter sous le doigt.
    const fitKey = `${scope}-${scope === 'day' ? dayIndex : 'all'}-${points.length}`
    const padding = {
      paddingTopLeft: [32, 170] as [number, number],
      paddingBottomRight: [32, 250] as [number, number],
    }
    if (fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey
      if (points.length === 1) map.setView(points[0], 14, { animate: true })
      else if (points.length > 1)
        map.fitBounds(L.latLngBounds(points), { ...padding, maxZoom: 15 })
    } else if (selectedPoint) {
      map.panInside(selectedPoint as LatLngExpression, {
        ...padding,
      })
    }
  }, [isLoaded, itinerary, dayIndex, scope, selectedActivityId, selectedStop])

  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!isLoaded || !L || !map) return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userPosition) return
    userMarkerRef.current = L.marker(userPosition, {
      icon: L.divIcon({
        className: '',
        html: USER_PIN_HTML,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 2000,
    }).addTo(map)
  }, [isLoaded, userPosition])

  useEffect(() => {
    const map = mapRef.current
    if (!isLoaded || !map || !userPosition || recenterToken === 0) return
    map.setView(userPosition, Math.max(map.getZoom(), 15), { animate: true })
  }, [isLoaded, recenterToken, userPosition])

  return (
    <div className={cn('tb-map bg-muted', className)}>
      <div
        ref={containerRef}
        className="bg-muted h-full w-full"
        aria-label="Carte du voyage"
        role="region"
      />
      {!isLoaded && (
        <div className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center gap-2">
          <MapPin className="animate-shimmer-soft size-5" aria-hidden />
          <span className="text-sm font-bold">Chargement de la carte…</span>
        </div>
      )}
    </div>
  )
}
