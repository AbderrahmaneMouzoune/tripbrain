'use client'

import { useEffect, useRef, useState } from 'react'
import { type DayItinerary } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { MapDayPreviewCard } from '@/components/map-day-preview-card'
import { X, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'

interface MapOverlayProps {
  itinerary: DayItinerary[]
  selectedDay: number
  onSelectDay: (index: number) => void
  onClose: () => void
}

function startOfDay(date: Date | string): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Returns a compact label for a pin covering multiple days/ranges.
 * Examples: "5"  "5-7"  "5-7+"  "5+"
 */
function formatDayLabel(indices: number[], itinerary: DayItinerary[]): string {
  const dayNums = indices
    .map((i) => itinerary[i].dayNumber)
    .sort((a, b) => a - b)
  if (dayNums.length === 1) return `${dayNums[0]}`

  // Build the first consecutive range
  let rangeEnd = dayNums[0]
  for (let k = 1; k < dayNums.length; k++) {
    if (dayNums[k] === rangeEnd + 1) rangeEnd = dayNums[k]
    else break
  }

  const firstRange =
    rangeEnd > dayNums[0] ? `${dayNums[0]}-${rangeEnd}` : `${dayNums[0]}`
  const hasMore = rangeEnd < dayNums[dayNums.length - 1]
  return hasMore ? `${firstRange}+` : firstRange
}

function buildMarkerHtml(label: string, isActive: boolean, isPast: boolean): string {
  const size = isActive ? 36 : 28
  const baseSize = isActive ? 14 : 11
  // Reduce font size progressively as label gets longer to stay inside the circle
  const fontSize =
    label.length <= 2 ? baseSize : label.length <= 4 ? baseSize - 2 : baseSize - 3
  const bg = isActive
    ? 'var(--color-primary, #8B5A2B)'
    : isPast
      ? '#9CA3AF'
      : '#D4A574'
  const border = isActive ? 'rgba(0,0,0,0.25)' : '#fff'

  return `<div style="width:${size}px;height:${size}px;background:${bg};border:3px solid ${border};border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;transition:all .25s ease;color:white;font-size:${fontSize}px;font-weight:700;line-height:1;letter-spacing:-0.5px;">
    ${label}
  </div>`
}

export function MapOverlay({
  itinerary,
  selectedDay,
  onSelectDay,
  onClose,
}: MapOverlayProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [activeDay, setActiveDay] = useState(selectedDay)
  const cardListRef = useRef<HTMLDivElement>(null)

  // One map marker per unique location (coordinates), grouping all days at the same spot
  // ~10 m tolerance so GPS coords entered with minor precision differences still merge
  const COORD_EPSILON = 0.0001
  const locationGroups = itinerary.reduce<
    { day: DayItinerary; indices: number[] }[]
  >((acc, day, index) => {
    if (!day.coordinates) return acc
    const [lat, lng] = day.coordinates as [number, number]
    const existing = acc.find((g) => {
      const [glat, glng] = g.day.coordinates as [number, number]
      return Math.abs(glat - lat) < COORD_EPSILON && Math.abs(glng - lng) < COORD_EPSILON
    })
    if (existing) {
      existing.indices.push(index)
    } else {
      acc.push({ day, indices: [index] })
    }
    return acc
  }, [])

  const handleSelectDay = (index: number) => {
    setActiveDay(index)
    onSelectDay(index)
  }

  const handleViewMore = (index: number) => {
    handleSelectDay(index)
    onClose()

    requestAnimationFrame(() => {
      document.getElementById('main-content')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  // Scroll the active city card into view
  useEffect(() => {
    if (!cardListRef.current) return
    const activeCard = cardListRef.current.querySelector<HTMLElement>(
      '[data-active="true"]',
    )
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [activeDay])

  // Build / destroy map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markersRef.current = []
      }

      const initialDay = itinerary[activeDay]
      const center: [number, number] = initialDay
        ? (initialDay.coordinates as [number, number])
        : [40.5, 65]

      const map = L.map(mapRef.current!, {
        center,
        zoom: 7,
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

      const createIcon = (label: string, isActive: boolean, isPast: boolean) =>
        L.divIcon({
          className: '',
          html: buildMarkerHtml(label, isActive, isPast),
          iconSize: [isActive ? 36 : 28, isActive ? 36 : 28],
          iconAnchor: [isActive ? 18 : 14, isActive ? 18 : 14],
        })

      const today = startOfDay(new Date())

      locationGroups.forEach(({ day, indices }) => {
        const isPast = indices.every((i) => startOfDay(itinerary[i].date) < today)
        const isActive = indices.includes(activeDay)
        const label = formatDayLabel(indices, itinerary)

        const marker = L.marker(day.coordinates as [number, number], {
          icon: createIcon(label, isActive, isPast),
        }).addTo(map)

        const dayNums = indices
          .map((i) => itinerary[i].dayNumber)
          .sort((a, b) => a - b)
        const daysText =
          dayNums.length === 1
            ? `Jour ${dayNums[0]}`
            : `Jours ${dayNums.join(', ')}`

        marker.bindPopup(
          `<div style="min-width:140px;font-family:sans-serif;">
            <strong style="font-size:13px;">${day.city}</strong><br/>
            <span style="color:#666;font-size:11px;">${daysText}</span>
          </div>`,
        )

        marker.on('click', () => handleSelectDay(indices[0]))
        markersRef.current.push(marker)
      })

      // Route polyline (all days, not just unique)
      L.polyline(
        itinerary.map((d) => d.coordinates as [number, number]),
        { color: '#8B5A2B', weight: 2.5, opacity: 0.55, dashArray: '8 8' },
      ).addTo(map)

      setIsLoaded(true)
    }

    loadLeaflet()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      markersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary])

  // Pan map + refresh icons when active day changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return

    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      const today = startOfDay(new Date())

      const targetDay = itinerary[activeDay]
      if (targetDay) {
        mapInstanceRef.current?.panTo(targetDay.coordinates as [number, number], {
          animate: true,
          duration: 0.6,
        })
      }

      markersRef.current.forEach((marker, i) => {
        const group = locationGroups[i]
        if (!group) return
        const isPast = group.indices.every(
          (idx) => startOfDay(itinerary[idx].date) < today,
        )
        const isActive = group.indices.includes(activeDay)
        const label = formatDayLabel(group.indices, itinerary)

        marker.setIcon(
          L.divIcon({
            className: '',
            html: buildMarkerHtml(label, isActive, isPast),
            iconSize: [isActive ? 36 : 28, isActive ? 36 : 28],
            iconAnchor: [isActive ? 18 : 14, isActive ? 18 : 14],
          }),
        )
      })
    }

    loadLeaflet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, isLoaded])

  const currentDay = itinerary[activeDay]
  const today = startOfDay(new Date())

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#f3f4f6' }}
    >
      {/* Top bar */}
      <div className="bg-card/90 border-border/60 absolute top-0 right-0 left-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <span className="text-foreground font-semibold text-sm">Carte du voyage</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hover:bg-muted/70 h-8 w-8 rounded-full"
          aria-label="Fermer la carte"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Map */}
      <div className="flex-1 pt-14" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}>
        <div ref={mapRef} className="h-full w-full" />
        {!isLoaded && (
          <div className="bg-muted/50 absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-2">
              <MapPin className="h-5 w-5 animate-pulse" />
              <span className="text-sm">Chargement de la carte…</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom city cards panel */}
      <div
        className="bg-card/90 border-border/40 border-t backdrop-blur-md"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {/* Active day summary */}
        {currentDay && (
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-semibold">
                Jour {currentDay.dayNumber} · {currentDay.city}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {new Date(currentDay.date).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={activeDay === 0}
                onClick={() => handleSelectDay(Math.max(0, activeDay - 1))}
                aria-label="Jour précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={activeDay === itinerary.length - 1}
                onClick={() =>
                  handleSelectDay(Math.min(itinerary.length - 1, activeDay + 1))
                }
                aria-label="Jour suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Horizontal city scroll */}
        <div
          ref={cardListRef}
          className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {itinerary.map((day, index) => {
            const isActive = activeDay === index
            const isPast = startOfDay(day.date) < today

            return (
              <MapDayPreviewCard
                key={index}
                day={day}
                isActive={isActive}
                isPast={isPast}
                onSelect={() => handleSelectDay(index)}
                onViewMore={() => handleViewMore(index)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
