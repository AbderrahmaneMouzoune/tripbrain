'use client'

import { useEffect, useRef, useState } from 'react'
import { type DayItinerary } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  X,
  Globe,
  CalendarDays,
  Home,
  MapPin,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewMode = 'global' | 'day'
type FilterType = 'accommodation' | 'activities' | 'highlights'

// Cities that may legitimately appear multiple times in the route
// (e.g. a hub visited at the start and end of the trip)
const MULTI_VISIT_CITIES = new Set(['Tachkent'])

// Fallback map centre when no itinerary coordinates are available yet
// (central Asia / Uzbekistan default from the original trip template)
const DEFAULT_MAP_CENTER: [number, number] = [40.5, 65]

export interface ImmersiveMapProps {
  itinerary: DayItinerary[]
  selectedDay: number
  onSelectDay: (index: number) => void
  onClose: () => void
}

interface DayStep {
  id: string
  type: 'accommodation' | 'activity' | 'highlight'
  activityType?: string
  title: string
  subtitle?: string
  coordinates?: [number, number]
}

function buildDaySteps(day: DayItinerary, filters: Set<FilterType>): DayStep[] {
  const steps: DayStep[] = []

  if (day.accommodation && filters.has('accommodation')) {
    steps.push({
      id: 'accommodation',
      type: 'accommodation',
      title: day.accommodation.name,
      subtitle: `Check-in : ${day.accommodation.checkIn}`,
      coordinates: day.coordinates,
    })
  }

  if (filters.has('activities')) {
    day.activities.forEach((activity, i) => {
      steps.push({
        id: `activity-${i}`,
        type: 'activity',
        activityType: activity.type,
        title: activity.name,
        subtitle: activity.duration,
        coordinates: activity.coordinates ?? day.coordinates,
      })
    })
  }

  if (filters.has('highlights') && day.highlights?.length) {
    day.highlights.forEach((hl, i) => {
      steps.push({
        id: `highlight-${i}`,
        type: 'highlight',
        title: hl,
        coordinates: day.coordinates,
      })
    })
  }

  return steps
}

function getStepColor(step: DayStep): string {
  if (step.type === 'accommodation') return '#2268c7'
  if (step.type === 'highlight') return '#f59e0b'
  switch (step.activityType) {
    case 'transport':
      return '#6366f1'
    case 'food':
      return '#ef4444'
    case 'shopping':
      return '#8b5cf6'
    case 'experience':
      return '#f97316'
    default:
      return '#10b981'
  }
}

function getStepLabel(step: DayStep): string {
  if (step.type === 'accommodation') return 'H'
  if (step.type === 'highlight') return '★'
  switch (step.activityType) {
    case 'transport':
      return 'T'
    case 'food':
      return 'R'
    case 'shopping':
      return 'S'
    case 'experience':
      return 'E'
    default:
      return 'V'
  }
}

function getStepTypeName(step: DayStep): string {
  if (step.type === 'accommodation') return 'Logement'
  if (step.type === 'highlight') return 'Point fort'
  switch (step.activityType) {
    case 'transport':
      return 'Transport'
    case 'food':
      return 'Restauration'
    case 'shopping':
      return 'Shopping'
    case 'experience':
      return 'Expérience'
    default:
      return 'Visite'
  }
}

function buildMarkerHtml(
  label: string,
  color: string,
  size: number,
  isActive: boolean,
  shape: 'circle' | 'rounded',
): string {
  const borderColor = isActive ? 'white' : 'rgba(255,255,255,0.6)'
  const radius = shape === 'rounded' ? '6px' : '50%'
  return `<div style="
    width:${size}px;height:${size}px;
    background:${color};
    border:2.5px solid ${borderColor};
    border-radius:${radius};
    box-shadow:0 2px 8px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;
    color:white;font-size:${isActive ? 13 : 10}px;font-weight:bold;
    font-family:system-ui,sans-serif;
  ">${label}</div>`
}

export function ImmersiveMap({
  itinerary,
  selectedDay,
  onSelectDay,
  onClose,
}: ImmersiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('global')
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(
    new Set(['accommodation', 'activities', 'highlights']),
  )
  const [activeStep, setActiveStep] = useState(0)

  const currentDay = itinerary[selectedDay]
  const daySteps = currentDay ? buildDaySteps(currentDay, activeFilters) : []
  const currentStep = viewMode === 'day' ? daySteps[activeStep] : undefined

  // Reset step index when selected day changes
  useEffect(() => {
    setActiveStep(0)
  }, [selectedDay])

  // Initialise Leaflet map once on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    let cancelled = false

    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (cancelled || !mapRef.current || mapInstanceRef.current) return

      const initialCoords =
        (itinerary[selectedDay]?.coordinates as [number, number]) ??
        DEFAULT_MAP_CENTER

      const map = L.map(mapRef.current, {
        center: initialCoords,
        zoom: 6,
        zoomControl: false,
        scrollWheelZoom: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      mapInstanceRef.current = map
      setIsLoaded(true)
    }

    initMap()

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render markers whenever relevant state changes
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current) return

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default
      const map = mapInstanceRef.current!

      // Compute today once for the whole marker pass
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Remove all non-tile layers
      map.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) {
          map.removeLayer(layer)
        }
      })

      if (viewMode === 'global') {
        // ── Route polyline ──────────────────────────────────────────────
        const coords = itinerary.map((d) => d.coordinates as [number, number])
        L.polyline(coords, {
          color: '#8B5A2B',
          weight: 2.5,
          opacity: 0.5,
          dashArray: '8, 8',
        }).addTo(map)

        // ── City markers ────────────────────────────────────────────────
        const citiesAdded = new Set<string>()

        itinerary.forEach((day, index) => {
          if (citiesAdded.has(day.city) && !MULTI_VISIT_CITIES.has(day.city))
            return
          citiesAdded.add(day.city)

          const dayDate = new Date(day.date)
          dayDate.setHours(0, 0, 0, 0)
          const isPast = dayDate < today
          const isSelected = selectedDay === index
          const size = isSelected ? 38 : 26
          const bg = isSelected ? '#2268c7' : isPast ? '#9CA3AF' : '#D4A574'

          const marker = L.marker(day.coordinates as [number, number], {
            icon: L.divIcon({
              className: 'custom-marker',
              html: buildMarkerHtml(
                String(day.dayNumber),
                bg,
                size,
                isSelected,
                'circle',
              ),
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            }),
          }).addTo(map)

          marker.bindTooltip(
            `<strong>${day.city}</strong><br/>Jour ${day.dayNumber}`,
            { direction: 'top', offset: [0, -(size / 2 + 4)] },
          )
          marker.on('click', () => onSelectDay(index))
        })

        // Pan to selected day
        if (itinerary[selectedDay]) {
          map.setView(
            itinerary[selectedDay].coordinates as [number, number],
            7,
            { animate: true, duration: 0.5 },
          )
        }
      } else {
        // ── Day view ────────────────────────────────────────────────────
        if (!currentDay) return

        const steps = buildDaySteps(currentDay, activeFilters)

        if (steps.length === 0) {
          // All filters off – show city marker only
          const size = 38
          L.marker(currentDay.coordinates as [number, number], {
            icon: L.divIcon({
              className: 'custom-marker',
              html: buildMarkerHtml(
                String(currentDay.dayNumber),
                '#2268c7',
                size,
                true,
                'circle',
              ),
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            }),
          }).addTo(map)
          map.setView(currentDay.coordinates as [number, number], 12, {
            animate: true,
            duration: 0.5,
          })
          return
        }

        steps.forEach((step, i) => {
          if (!step.coordinates) return
          const isActive = i === activeStep
          const color = getStepColor(step)
          const label = getStepLabel(step)
          const size = isActive ? 38 : 26
          const shape = step.type === 'accommodation' ? 'rounded' : 'circle'

          const marker = L.marker(step.coordinates, {
            icon: L.divIcon({
              className: 'custom-marker',
              html: buildMarkerHtml(label, color, size, isActive, shape),
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            }),
          }).addTo(map)

          marker.bindTooltip(step.title, {
            direction: 'top',
            offset: [0, -(size / 2 + 4)],
          })

          const stepIdx = i
          marker.on('click', () => setActiveStep(stepIdx))
        })

        // Pan to active step
        const activeCoords = steps[activeStep]?.coordinates
        const fallback = currentDay.coordinates as [number, number]
        map.setView(activeCoords ?? fallback, 13, {
          animate: true,
          duration: 0.5,
        })
      }
    }

    updateMarkers()
  }, [
    isLoaded,
    viewMode,
    selectedDay,
    activeFilters,
    activeStep,
    itinerary,
    currentDay,
    onSelectDay,
  ])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleFilter = (filter: FilterType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(filter)) {
        next.delete(filter)
      } else {
        next.add(filter)
      }
      return next
    })
  }

  const handleResetView = async () => {
    const map = mapInstanceRef.current
    if (!map) return
    if (viewMode === 'global') {
      const L = (await import('leaflet')).default
      const bounds = L.latLngBounds(
        itinerary.map((d) => d.coordinates as [number, number]),
      )
      map.fitBounds(bounds, { padding: [50, 50], animate: true })
    } else if (currentDay) {
      map.setView(currentDay.coordinates as [number, number], 12, {
        animate: true,
      })
    }
  }

  const handlePrev = () => {
    if (viewMode === 'day') {
      setActiveStep((prev) => Math.max(0, prev - 1))
    } else {
      onSelectDay(Math.max(0, selectedDay - 1))
    }
  }

  const handleNext = () => {
    if (viewMode === 'day') {
      setActiveStep((prev) => Math.min(daySteps.length - 1, prev + 1))
    } else {
      onSelectDay(Math.min(itinerary.length - 1, selectedDay + 1))
    }
  }

  const prevDisabled =
    viewMode === 'day' ? activeStep === 0 : selectedDay === 0
  const nextDisabled =
    viewMode === 'day'
      ? activeStep >= daySteps.length - 1
      : selectedDay >= itinerary.length - 1

  const filters: {
    id: FilterType
    label: string
    icon: typeof Home
    activeClass: string
  }[] = [
    {
      id: 'accommodation',
      label: 'Logements',
      icon: Home,
      activeClass: 'bg-blue-500 text-white',
    },
    {
      id: 'activities',
      label: 'Programme',
      icon: MapPin,
      activeClass: 'bg-emerald-500 text-white',
    },
    {
      id: 'highlights',
      label: 'Points forts',
      icon: Star,
      activeClass: 'bg-amber-500 text-white',
    },
  ]

  return (
    <div className="fixed inset-0 z-50">
      {/* ── Map layer ── z-0 creates a stacking context so Leaflet's
           internal pane z-indices (200-700) stay inside it and
           don't bleed above the toolbar/bottom-panel (z-20). */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── Loading overlay ── */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/90">
          <div className="flex items-center gap-2 text-white">
            <MapPin className="h-5 w-5 animate-pulse" />
            <span className="text-sm">Chargement de la carte…</span>
          </div>
        </div>
      )}

      {/* ── Top toolbar ── */}
      <div
        className="absolute top-0 right-0 left-0 z-20 px-3 pt-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        {/* Row 1: close · view-mode toggle · reset */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={onClose}
            aria-label="Fermer la carte"
            className="h-9 w-9 shrink-0 rounded-full bg-white/90 shadow-md backdrop-blur-sm hover:bg-white"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* View-mode pill */}
          <div className="flex gap-0.5 rounded-full bg-black/45 p-1 shadow-md backdrop-blur-sm">
            <button
              onClick={() => setViewMode('global')}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all',
                viewMode === 'global'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-white/80 hover:text-white',
              )}
            >
              <Globe className="h-3 w-3" />
              Global
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all',
                viewMode === 'day'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-white/80 hover:text-white',
              )}
            >
              <CalendarDays className="h-3 w-3" />
              Jour {currentDay?.dayNumber ?? '–'}
            </button>
          </div>

          <div className="flex-1" />

          <Button
            variant="secondary"
            size="icon"
            onClick={handleResetView}
            aria-label="Réinitialiser la vue"
            className="h-9 w-9 shrink-0 rounded-full bg-white/90 shadow-md backdrop-blur-sm hover:bg-white"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Row 2: filter chips */}
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {filters.map(({ id, label, icon: Icon, activeClass }) => (
            <button
              key={id}
              onClick={() => toggleFilter(id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm transition-all',
                activeFilters.has(id)
                  ? activeClass
                  : 'bg-black/40 text-white/70 hover:text-white',
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom panel ── */}
      <div
        className="absolute right-0 bottom-0 left-0 z-20 px-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Step-dot indicator (day view only) */}
        {viewMode === 'day' && daySteps.length > 1 && (
          <div className="mb-2 flex justify-center gap-1.5">
            {daySteps.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={cn(
                  'rounded-full transition-all',
                  i === activeStep
                    ? 'h-2 w-5 bg-white shadow'
                    : 'h-2 w-2 bg-white/45 hover:bg-white/70',
                )}
                aria-label={`Étape ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Mini-detail card */}
        <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {/* Prev */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              disabled={prevDisabled}
              aria-label="Précédent"
              className="h-8 w-8 shrink-0 rounded-full"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Content */}
            <div className="min-w-0 flex-1">
              {viewMode === 'global' ? (
                /* Global view – day summary */
                <div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      Jour {currentDay?.dayNumber}
                    </Badge>
                    {currentDay?.transport && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] capitalize"
                      >
                        {currentDay.transport.type}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
                    {currentDay?.title}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {currentDay?.city}
                    {currentDay &&
                      ` • ${currentDay.activities.length} activité${currentDay.activities.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              ) : currentStep ? (
                /* Day view – step details */
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium text-white"
                      style={{ background: getStepColor(currentStep) }}
                    >
                      {getStepTypeName(currentStep)}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {activeStep + 1}/{daySteps.length}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
                    {currentStep.title}
                  </p>
                  {currentStep.subtitle && (
                    <p className="text-muted-foreground text-xs">
                      {currentStep.subtitle}
                    </p>
                  )}
                </div>
              ) : (
                /* Day view – no steps (all filters off) */
                <div>
                  <p className="text-sm font-semibold">
                    {currentDay?.city} — Jour {currentDay?.dayNumber}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Aucune étape à afficher
                  </p>
                </div>
              )}
            </div>

            {/* Next */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              disabled={nextDisabled}
              aria-label="Suivant"
              className="h-8 w-8 shrink-0 rounded-full"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
