'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from 'leaflet'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { IconMap2, IconMapPin, IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// ── types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'global' | 'day'

interface MapOverlayProps {
  itinerary: DayItinerary[]
  selectedDay: number
  onSelectDay: (index: number) => void
  onClose: () => void
}

// ── activity type → pin colour ────────────────────────────────────────────────

const ACTIVITY_COLOR: Record<Activity['type'], string> = {
  visit: '#8B5CF6',
  transport: '#3B82F6',
  food: '#EF4444',
  experience: '#10B981',
  shopping: '#F59E0B',
}

// ── pin HTML builders ─────────────────────────────────────────────────────────

function buildDayPinHtml(dayNum: number, isActive: boolean): string {
  const size = isActive ? 38 : 30
  const bg = isActive ? '#F97316' : '#ffffff'
  const textColor = isActive ? '#ffffff' : '#111827'
  const fontSize = isActive ? 14 : 11
  return (
    `<div style="width:${size}px;height:${size}px;background:${bg};` +
    `border:2.5px solid #F97316;border-radius:50%;` +
    `box-shadow:0 2px 8px rgba(0,0,0,.28);display:flex;align-items:center;` +
    `justify-content:center;font-family:system-ui,sans-serif;font-weight:700;` +
    `font-size:${fontSize}px;color:${textColor};">${dayNum}</div>`
  )
}

function buildActivityPinHtml(label: string, color: string): string {
  return (
    `<div style="width:30px;height:30px;background:${color};` +
    `border:2.5px solid rgba(255,255,255,.9);border-radius:50%;` +
    `box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;` +
    `justify-content:center;font-family:system-ui,sans-serif;font-weight:700;` +
    `font-size:11px;color:#fff;">${label}</div>`
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clearMarkers(markers: LeafletMarker[]): void {
  markers.forEach((m) => m.remove())
  markers.length = 0
}

// ── component ─────────────────────────────────────────────────────────────────

export function MapOverlay({
  itinerary,
  selectedDay,
  onSelectDay,
  onClose,
}: MapOverlayProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const dayMarkersRef = useRef<LeafletMarker[]>([])
  const activityMarkersRef = useRef<LeafletMarker[]>([])
  const polylineRef = useRef<LeafletPolyline | null>(null)
  const chipListRef = useRef<HTMLDivElement>(null)

  const [isLoaded, setIsLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('global')
  const [activeDay, setActiveDay] = useState(selectedDay)

  // ── sync activeDay when selectedDay prop changes ──────────────────────────

  useEffect(() => {
    setActiveDay(selectedDay)
  }, [selectedDay])

  // ── init: create the Leaflet map once on mount ────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    let cancelled = false

    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (cancelled || !mapRef.current || mapInstanceRef.current) return

      const initialCoords: [number, number] =
        (itinerary[selectedDay]?.coordinates as [number, number]) ?? [40.5, 65]

      const map = L.map(mapRef.current, {
        center: initialCoords,
        zoom: 5,
        zoomControl: false,
        scrollWheelZoom: true,
      })

      L.control.zoom({ position: 'topright' }).addTo(map)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      mapInstanceRef.current = map

      if (!cancelled) setIsLoaded(true)
    }

    init()

    return () => {
      cancelled = true
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      dayMarkersRef.current = []
      activityMarkersRef.current = []
      polylineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── redraw layers whenever viewMode or activeDay changes ──────────────────

  useEffect(() => {
    if (!isLoaded) return

    const map = mapInstanceRef.current
    if (!map) return

    let cancelled = false

    const run = async () => {
      const L = (await import('leaflet')).default
      if (cancelled) return

      if (viewMode === 'global') {
        // ── global view: dashed polyline + one numbered pin per day ──────────

        clearMarkers(activityMarkersRef.current)
        polylineRef.current?.remove()
        polylineRef.current = null
        clearMarkers(dayMarkersRef.current)

        const coords = itinerary.map((d) => d.coordinates as [number, number])

        // Dashed blue polyline through every day in order
        polylineRef.current = L.polyline(coords, {
          color: '#3B82F6',
          weight: 2,
          opacity: 0.85,
          dashArray: '8 8',
        }).addTo(map)

        // One circular numbered pin per day
        itinerary.forEach((day, i) => {
          const isActive = i === activeDay
          const icon = L.divIcon({
            className: '',
            html: buildDayPinHtml(day.dayNumber, isActive),
            iconSize: [isActive ? 38 : 30, isActive ? 38 : 30],
            iconAnchor: [isActive ? 19 : 15, isActive ? 19 : 15],
          })
          const marker = L.marker(day.coordinates as [number, number], {
            icon,
          }).addTo(map)

          const dateLabel = new Date(day.date).toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })
          marker.bindPopup(
            `<div style="min-width:130px;font-family:system-ui,sans-serif;">` +
              `<strong style="font-size:13px;">Jour ${escHtml(String(day.dayNumber))} · ${escHtml(day.city)}</strong><br/>` +
              `<span style="color:#666;font-size:11px;">${escHtml(dateLabel)}</span>` +
              `</div>`,
          )

          // Clicking a day pin switches to day view for that day
          marker.on('click', () => {
            setActiveDay(i)
            onSelectDay(i)
            setViewMode('day')
          })

          dayMarkersRef.current.push(marker)
        })

        // fitBounds to all day coordinates
        if (coords.length > 0) {
          map.fitBounds(L.latLngBounds(coords), { padding: [48, 48] })
        }
      } else {
        // ── day view: activity pins for the active day ────────────────────────

        clearMarkers(dayMarkersRef.current)
        polylineRef.current?.remove()
        polylineRef.current = null
        clearMarkers(activityMarkersRef.current)

        const day = itinerary[activeDay]
        if (!day) return

        const activitiesWithCoords = day.activities.filter(
          (a): a is Activity & { coordinates: [number, number] } =>
            Array.isArray(a.coordinates) && a.coordinates.length === 2,
        )

        // No activity coordinates — show the day pin and zoom to it
        if (activitiesWithCoords.length === 0) {
          const icon = L.divIcon({
            className: '',
            html: buildDayPinHtml(day.dayNumber, true),
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          })
          const marker = L.marker(day.coordinates as [number, number], {
            icon,
          }).addTo(map)
          marker.bindPopup(
            `<strong style="font-family:system-ui,sans-serif;">${escHtml(day.city)}</strong>`,
          )
          activityMarkersRef.current.push(marker)
          map.setView(day.coordinates as [number, number], 13, {
            animate: true,
          })
          return
        }

        // Add one coloured pin per activity that has coordinates
        activitiesWithCoords.forEach((activity, i) => {
          const color = ACTIVITY_COLOR[activity.type] ?? '#6B7280'
          const icon = L.divIcon({
            className: '',
            html: buildActivityPinHtml(String(i + 1), color),
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          })
          const marker = L.marker(activity.coordinates, { icon }).addTo(map)
          marker.bindPopup(
            `<div style="min-width:140px;font-family:system-ui,sans-serif;">` +
              `<strong style="font-size:13px;">${escHtml(activity.name)}</strong>` +
              (activity.duration
                ? `<br/><span style="color:#666;font-size:11px;">${escHtml(activity.duration)}</span>`
                : '') +
              `</div>`,
          )
          activityMarkersRef.current.push(marker)
        })

        // When only one activity exists, also show the day coordinate pin for context
        if (activitiesWithCoords.length <= 1) {
          const icon = L.divIcon({
            className: '',
            html: buildDayPinHtml(day.dayNumber, true),
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          })
          const marker = L.marker(day.coordinates as [number, number], {
            icon,
          }).addTo(map)
          marker.bindPopup(
            `<strong style="font-family:system-ui,sans-serif;">${escHtml(day.city)}</strong>`,
          )
          activityMarkersRef.current.push(marker)
        }

        // Collect all coordinates for bounds calculation
        const allCoords: [number, number][] = activitiesWithCoords.map(
          (a) => a.coordinates,
        )
        if (activitiesWithCoords.length <= 1) {
          allCoords.push(day.coordinates as [number, number])
        }

        if (allCoords.length === 1) {
          map.setView(allCoords[0], 13, { animate: true })
        } else {
          map.fitBounds(L.latLngBounds(allCoords), { padding: [48, 48] })
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [isLoaded, viewMode, activeDay, itinerary])

  // ── auto-scroll active chip into view ─────────────────────────────────────

  useEffect(() => {
    if (!chipListRef.current) return
    const chip = chipListRef.current.querySelector<HTMLElement>(
      '[data-active="true"]',
    )
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeDay])

  // ── event handlers ─────────────────────────────────────────────────────────

  const handleSelectDay = (index: number) => {
    setActiveDay(index)
    onSelectDay(index)
  }

  const handleChipClick = (index: number) => {
    handleSelectDay(index)
    setViewMode('day')
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      {/* Top bar */}
      <header
        className="bg-card/90 border-border/60 z-10 shrink-0 border-b backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Title + close button row */}
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-foreground text-sm font-semibold">
            Carte du voyage
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="hover:bg-muted/70 h-8 w-8 rounded-full"
            aria-label="Fermer la carte"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {/* View mode toggle tabs */}
        <div className="flex justify-center gap-2 px-4 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('global')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'global'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'border-border bg-muted text-muted-foreground border',
            )}
          >
            <IconMap2 className="h-3.5 w-3.5" />
            Itinéraire
          </button>
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'day'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'border-border bg-muted text-muted-foreground border',
            )}
          >
            <IconMapPin className="h-3.5 w-3.5" />
            Jour {activeDay + 1}
          </button>
        </div>
      </header>

      {/* Map area — fills all remaining space between header and footer */}
      <div className="relative min-h-0 flex-1">
        <div ref={mapRef} className="h-full w-full" />
        {!isLoaded && (
          <div className="bg-muted/50 pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-2">
              <IconMapPin className="h-5 w-5 animate-pulse" />
              <span className="text-sm">Chargement de la carte…</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <footer
        className="bg-card/90 border-border/40 z-10 shrink-0 border-t backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Info hint */}
        <p className="text-muted-foreground px-4 pt-2.5 pb-1 text-center text-[10px] font-medium tracking-widest">
          {itinerary.length} JOURS · TOUCHEZ UN MARQUEUR POUR ZOOMER
        </p>

        {/* Horizontal scrollable day chip selector */}
        <div
          ref={chipListRef}
          className="flex gap-2 overflow-x-auto px-4 py-2 snap-x snap-mandatory [scrollbar-width:none]"
        >
          {itinerary.map((day, index) => {
            const isActive = activeDay === index
            return (
              <button
                key={index}
                type="button"
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleChipClick(index)}
                className={cn(
                  'flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 snap-center transition-colors',
                  isActive
                    ? 'border-blue-500 bg-white shadow-sm'
                    : 'border-border bg-muted/50 hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'text-sm font-bold leading-none',
                    isActive ? 'text-orange-500' : 'text-muted-foreground',
                  )}
                >
                  {day.dayNumber}
                </span>
                <span
                  className={cn(
                    'mt-1 max-w-[64px] truncate text-[10px] leading-none',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {day.city}
                </span>
              </button>
            )
          })}
        </div>
      </footer>
    </div>
  )
}
