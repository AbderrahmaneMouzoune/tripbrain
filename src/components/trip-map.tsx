'use client'

import { useEffect, useRef, useState } from 'react'
import { type DayItinerary } from '@/lib/itinerary-data'
import { Card } from '@/components/ui/card'
import { MapPin } from 'lucide-react'

interface TripMapProps {
  itinerary: DayItinerary[]
  selectedDay: number
  onSelectDay?: (index: number) => void
}

export function TripMap({ itinerary, selectedDay, onSelectDay }: TripMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    // Dynamically import Leaflet
    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }

      // Initialize map centered on Uzbekistan
      const map = L.map(mapRef.current!, {
        center: [40.5, 65],
        zoom: 6,
        zoomControl: true,
        scrollWheelZoom: true,
      })

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      mapInstanceRef.current = map

      // Create custom icon
      const createIcon = (isSelected: boolean, isPast: boolean) => {
        return L.divIcon({
          className: 'custom-marker',
          html: `
            <div style="
              width: ${isSelected ? '32px' : '24px'};
              height: ${isSelected ? '32px' : '24px'};
              background-color: ${isSelected ? '#8B5A2B' : isPast ? '#9CA3AF' : '#D4A574'};
              border: 3px solid ${isSelected ? '#5C3D1E' : '#FFFFFF'};
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.3s ease;
            ">
              <svg width="${isSelected ? '16' : '12'}" height="${isSelected ? '16' : '12'}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
          `,
          iconSize: [isSelected ? 32 : 24, isSelected ? 32 : 24],
          iconAnchor: [isSelected ? 16 : 12, isSelected ? 16 : 12],
        })
      }

      // Add markers for each unique city
      const citiesAdded = new Set<string>()

      itinerary.forEach((day, index) => {
        if (citiesAdded.has(day.city) && day.city !== 'Tachkent') return
        citiesAdded.add(day.city)

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const dayDate = new Date(day.date)
        dayDate.setHours(0, 0, 0, 0)
        const isPast = dayDate < today
        const isSelected = selectedDay === index

        const marker = L.marker(day.coordinates as [number, number], {
          icon: createIcon(isSelected, isPast),
        }).addTo(map)

        marker.bindPopup(`
          <div style="min-width: 150px;">
            <strong style="font-size: 14px;">${day.city}</strong>
            <br/>
            <span style="color: #666; font-size: 12px;">Jour ${day.dayNumber} - ${new Date(day.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          </div>
        `)

        marker.on('click', () => {
          if (onSelectDay) {
            onSelectDay(index)
          }
        })

        markersRef.current.push(marker)
      })

      // Draw route line
      const routeCoordinates = itinerary.map(
        (day) => day.coordinates as [number, number],
      )
      L.polyline(routeCoordinates, {
        color: '#8B5A2B',
        weight: 3,
        opacity: 0.6,
        dashArray: '10, 10',
      }).addTo(map)

      setIsLoaded(true)
    }

    loadLeaflet()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Update markers when selected day changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return

    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default

      const selectedDayData = itinerary[selectedDay]
      if (selectedDayData) {
        mapInstanceRef.current?.setView(
          selectedDayData.coordinates as [number, number],
          8,
          {
            animate: true,
            duration: 0.5,
          },
        )
      }

      // Update marker styles
      markersRef.current.forEach((marker, index) => {
        const day = itinerary.find((d, i) => {
          const citiesFound = new Set<string>()
          for (let j = 0; j <= i; j++) {
            if (
              !citiesFound.has(itinerary[j].city) ||
              itinerary[j].city === 'Tachkent'
            ) {
              citiesFound.add(itinerary[j].city)
              if (j === i) return true
            }
          }
          return false
        })

        if (day) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const dayDate = new Date(day.date)
          dayDate.setHours(0, 0, 0, 0)
          const isPast = dayDate < today
          const isSelected = selectedDay === itinerary.indexOf(day)

          marker.setIcon(
            L.divIcon({
              className: 'custom-marker',
              html: `
              <div style="
                width: ${isSelected ? '32px' : '24px'};
                height: ${isSelected ? '32px' : '24px'};
                background-color: ${isSelected ? '#8B5A2B' : isPast ? '#9CA3AF' : '#D4A574'};
                border: 3px solid ${isSelected ? '#5C3D1E' : '#FFFFFF'};
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
              ">
                <svg width="${isSelected ? '16' : '12'}" height="${isSelected ? '16' : '12'}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
            `,
              iconSize: [isSelected ? 32 : 24, isSelected ? 32 : 24],
              iconAnchor: [isSelected ? 16 : 12, isSelected ? 16 : 12],
            }),
          )
        }
      })
    }

    loadLeaflet()
  }, [selectedDay, isLoaded])

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <div
          ref={mapRef}
          className="h-64 w-full md:h-80 lg:h-96"
          style={{ background: '#f3f4f6' }}
        />
        {!isLoaded && (
          <div className="bg-muted/50 absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-2">
              <MapPin className="h-5 w-5 animate-pulse" />
              <span>Chargement de la carte...</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
