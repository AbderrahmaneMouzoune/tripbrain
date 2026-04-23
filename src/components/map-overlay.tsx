'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from 'leaflet'
import type { Activity, DayItinerary } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import {
  IconMap2,
  IconMapPin,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconArrowLeft,
  IconArrowRight,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// ── types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'global' | 'day'
type DayStatus = 'past' | 'today' | 'future'

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

const ACTIVITY_BG_CLASS: Record<Activity['type'], string> = {
  visit: 'bg-violet-500',
  transport: 'bg-blue-500',
  food: 'bg-red-500',
  experience: 'bg-emerald-500',
  shopping: 'bg-amber-500',
}

// ── activity type → emoji ─────────────────────────────────────────────────────

const ACTIVITY_EMOJI: Record<Activity['type'], string> = {
  visit: '📍',
  transport: '🚗',
  food: '🍜',
  experience: '✨',
  shopping: '🛍',
}

// ── activity type → French label ──────────────────────────────────────────────

const ACTIVITY_LABEL: Record<Activity['type'], string> = {
  visit: 'Visite',
  transport: 'Transport',
  food: 'Repas',
  experience: 'Expérience',
  shopping: 'Shopping',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getDayStatus(dateStr: string): DayStatus {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  if (d < today) return 'past'
  if (d.getTime() === today.getTime()) return 'today'
  return 'future'
}

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

// ── pin HTML builders ─────────────────────────────────────────────────────────

function buildDayPinHtml(
  dayNum: number,
  status: DayStatus,
  isActive: boolean,
): string {
  let size: number
  let bg: string
  let textColor: string
  let borderCss: string
  let shadowCss: string

  if (status === 'past') {
    size = isActive ? 38 : 32
    bg = '#9CA3AF'
    textColor = '#ffffff'
    borderCss = isActive ? '2.5px solid #F97316' : '2.5px solid #9CA3AF'
    shadowCss = isActive
      ? '0 0 0 2px #F97316,0 2px 8px rgba(0,0,0,.28)'
      : '0 2px 8px rgba(0,0,0,.28)'
  } else if (status === 'today') {
    size = isActive ? 44 : 42
    bg = '#3B82F6'
    textColor = '#ffffff'
    borderCss = isActive ? '2.5px solid #F97316' : '2.5px solid #3B82F6'
    shadowCss = isActive
      ? '0 0 0 2px #F97316,0 2px 8px rgba(0,0,0,.28)'
      : '0 2px 8px rgba(0,0,0,.28)'
  } else {
    // future
    size = isActive ? 38 : 32
    bg = isActive ? '#F97316' : '#ffffff'
    textColor = isActive ? '#ffffff' : '#111827'
    borderCss = '2.5px solid #F97316'
    shadowCss = isActive
      ? '0 0 0 2px #F97316,0 2px 8px rgba(0,0,0,.28)'
      : '0 2px 8px rgba(0,0,0,.28)'
  }

  const fontSize = size >= 42 ? 16 : size >= 38 ? 14 : 11

  return (
    `<div style="width:${size}px;height:${size}px;background:${bg};` +
    `border:${borderCss};border-radius:50%;` +
    `box-shadow:${shadowCss};display:flex;align-items:center;` +
    `justify-content:center;font-family:system-ui,sans-serif;font-weight:700;` +
    `font-size:${fontSize}px;color:${textColor};">${dayNum}</div>`
  )
}

function buildActivityPinHtml(
  emoji: string,
  num: number,
  color: string,
): string {
  return (
    `<div style="position:relative;width:36px;height:36px;background:#fff;` +
    `border:2.5px solid ${color};border-radius:10px;` +
    `box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;` +
    `justify-content:center;">` +
    `<span style="font-size:16px;line-height:1;">${emoji}</span>` +
    `<span style="position:absolute;bottom:-5px;right:-5px;background:${color};` +
    `color:#fff;font-size:8px;font-weight:700;border-radius:50%;` +
    `width:14px;height:14px;display:flex;align-items:center;justify-content:center;` +
    `font-family:system-ui,sans-serif;border:1.5px solid #fff;">${num}</span>` +
    `</div>`
  )
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
  const activityPolylineRef = useRef<LeafletPolyline | null>(null)
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
        itinerary[selectedDay]?.coordinates ?? [40.5, 65]

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
      activityPolylineRef.current = null
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
        activityPolylineRef.current?.remove()
        activityPolylineRef.current = null
        polylineRef.current?.remove()
        polylineRef.current = null
        clearMarkers(dayMarkersRef.current)

        const coords = itinerary.map((d) => d.coordinates)

        // Dashed blue polyline through every day in order
        polylineRef.current = L.polyline(coords, {
          color: '#3B82F6',
          weight: 2,
          opacity: 0.85,
          dashArray: '8 8',
        }).addTo(map)

        // One circular numbered pin per day, colored by status
        itinerary.forEach((day, i) => {
          const isActive = i === activeDay
          const status = getDayStatus(day.date)
          const pinSize =
            status === 'today' ? (isActive ? 44 : 42) : isActive ? 38 : 32
          const icon = L.divIcon({
            className: '',
            html: buildDayPinHtml(day.dayNumber, status, isActive),
            iconSize: [pinSize, pinSize],
            iconAnchor: [pinSize / 2, pinSize / 2],
          })
          const marker = L.marker(day.coordinates, {
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
        if (coords.length === 1) {
          map.setView(coords[0], 10, { animate: true })
        } else if (coords.length > 1) {
          map.fitBounds(L.latLngBounds(coords), { padding: [48, 48] })
        }
      } else {
        // ── day view: emoji activity pins + dashed orange polyline ────────────

        clearMarkers(dayMarkersRef.current)
        polylineRef.current?.remove()
        polylineRef.current = null
        activityPolylineRef.current?.remove()
        activityPolylineRef.current = null
        clearMarkers(activityMarkersRef.current)

        const day = itinerary[activeDay]
        if (!day) return

        const activitiesWithCoords = day.activities.filter(
          (a): a is Activity & { coordinates: [number, number] } =>
            Array.isArray(a.coordinates) && a.coordinates.length === 2,
        )

        // No activity coordinates — show the day pin and zoom to it
        if (activitiesWithCoords.length === 0) {
          const status = getDayStatus(day.date)
          const icon = L.divIcon({
            className: '',
            html: buildDayPinHtml(day.dayNumber, status, true),
            iconSize: [42, 42],
            iconAnchor: [21, 21],
          })
          const marker = L.marker(day.coordinates, {
            icon,
          }).addTo(map)
          marker.bindPopup(
            `<strong style="font-family:system-ui,sans-serif;">${escHtml(day.city)}</strong>`,
          )
          activityMarkersRef.current.push(marker)
          map.setView(day.coordinates, 13, {
            animate: true,
          })
          return
        }

        // Add one emoji pin per activity that has coordinates
        activitiesWithCoords.forEach((activity, i) => {
          const color = ACTIVITY_COLOR[activity.type] ?? '#6B7280'
          const emoji = ACTIVITY_EMOJI[activity.type] ?? '📍'
          const icon = L.divIcon({
            className: '',
            html: buildActivityPinHtml(emoji, i + 1, color),
            iconSize: [36, 36],
            iconAnchor: [18, 18],
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
          const status = getDayStatus(day.date)
          const icon = L.divIcon({
            className: '',
            html: buildDayPinHtml(day.dayNumber, status, true),
            iconSize: [42, 42],
            iconAnchor: [21, 21],
          })
          const marker = L.marker(day.coordinates, {
            icon,
          }).addTo(map)
          marker.bindPopup(
            `<strong style="font-family:system-ui,sans-serif;">${escHtml(day.city)}</strong>`,
          )
          activityMarkersRef.current.push(marker)
        }

        // Orange dashed polyline connecting activity pins in order
        if (activitiesWithCoords.length >= 2) {
          activityPolylineRef.current = L.polyline(
            activitiesWithCoords.map((a) => a.coordinates),
            {
              color: '#F97316',
              weight: 2,
              opacity: 0.7,
              dashArray: '6 6',
            },
          ).addTo(map)
        }

        // Collect all coordinates for bounds calculation
        const allCoords: [number, number][] = activitiesWithCoords.map(
          (a) => a.coordinates,
        )
        if (activitiesWithCoords.length <= 1) {
          allCoords.push(day.coordinates)
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
  }, [isLoaded, viewMode, activeDay, itinerary, onSelectDay])

  // ── auto-scroll active chip into view (global view) ───────────────────────

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

  const handlePrevDay = () => {
    if (activeDay > 0) {
      handleSelectDay(activeDay - 1)
    }
  }

  const handleNextDay = () => {
    if (activeDay < itinerary.length - 1) {
      handleSelectDay(activeDay + 1)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const currentDay = itinerary[activeDay]
  const shownActivities = currentDay?.activities.slice(0, 3) ?? []
  const extraActivities = Math.max(
    0,
    (currentDay?.activities.length ?? 0) - 3,
  )

  const shortDateLabel = currentDay
    ? new Date(currentDay.date).toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : ''

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

      {/* Bottom panel — chip strip (global) or day card (day) */}
      <footer
        className="bg-card/90 border-border/40 z-10 shrink-0 border-t backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {viewMode === 'global' ? (
          <>
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
          </>
        ) : (
          /* ── Day view compact card ──────────────────────────────────────── */
          <div className="flex flex-col">
            {/* Row 1: back button + prev/next arrows */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
              <button
                type="button"
                onClick={() => setViewMode('global')}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
              >
                <IconArrowLeft className="h-3.5 w-3.5" />
                Retour à l&apos;itinéraire
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevDay}
                  disabled={activeDay === 0}
                  className="disabled:text-muted-foreground/40 text-muted-foreground hover:text-foreground flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none"
                  aria-label="Jour précédent"
                >
                  <IconChevronLeft className="h-3.5 w-3.5" />
                  {activeDay > 0 && (
                    <span>Jour {itinerary[activeDay - 1]?.dayNumber}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleNextDay}
                  disabled={activeDay === itinerary.length - 1}
                  className="disabled:text-muted-foreground/40 text-muted-foreground hover:text-foreground flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none"
                  aria-label="Jour suivant"
                >
                  {activeDay < itinerary.length - 1 && (
                    <span>Jour {itinerary[activeDay + 1]?.dayNumber}</span>
                  )}
                  <IconChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-border/50 border-t" />

            {/* Row 2: day summary */}
            {currentDay && (
              <div className="flex items-start justify-between px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                    Jour {currentDay.dayNumber} · {currentDay.city}
                  </p>
                  <p className="text-foreground mt-0.5 truncate text-sm font-semibold">
                    {currentDay.title}
                  </p>
                </div>
                <span className="text-muted-foreground ml-3 shrink-0 text-[10px]">
                  {shortDateLabel}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-border/50 border-t" />

            {/* Row 3: activity list (max 3) */}
            {shownActivities.length > 0 && (
              <ul className="flex flex-col px-3 py-1.5">
                {shownActivities.map((activity) => {
                  const emoji = ACTIVITY_EMOJI[activity.type] ?? '📍'
                  const label = ACTIVITY_LABEL[activity.type] ?? activity.type
                  return (
                    <li key={activity.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-sm leading-none">{emoji}</span>
                      <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                        {activity.name}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white',
                          ACTIVITY_BG_CLASS[activity.type],
                        )}
                      >
                        {label}
                      </span>
                    </li>
                  )
                })}
                {extraActivities > 0 && (
                  <li className="text-muted-foreground py-0.5 text-[10px]">
                    +{extraActivities} autre{extraActivities > 1 ? 's' : ''} activité
                    {extraActivities > 1 ? 's' : ''}
                  </li>
                )}
              </ul>
            )}

            {/* Divider */}
            <div className="border-border/50 border-t" />

            {/* Row 4: "Voir plus d'info" full-width button */}
            <div className="px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onSelectDay(activeDay)
                  onClose()
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
              >
                Voir plus d&apos;info
                <IconArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}
