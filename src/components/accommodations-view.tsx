'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Hotel,
  MapPin,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  CalendarDays,
  BedDouble,
} from 'lucide-react'
import type { DayItinerary, Accommodation } from '@/lib/itinerary-data'
import { formatDate } from '@/lib/itinerary-data'

interface AccommodationsViewProps {
  itinerary: DayItinerary[]
}

interface AccommodationEntry {
  accommodation: Accommodation
  days: DayItinerary[]
}

function groupAccommodations(itinerary: DayItinerary[]): AccommodationEntry[] {
  const entries: AccommodationEntry[] = []

  for (const day of itinerary) {
    if (!day.accommodation) continue

    const existing = entries.find(
      (e) =>
        e.accommodation.name === day.accommodation!.name &&
        e.accommodation.address === day.accommodation!.address,
    )

    if (existing) {
      existing.days.push(day)
    } else {
      entries.push({ accommodation: day.accommodation, days: [day] })
    }
  }

  return entries
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      className="text-muted-foreground/50 hover:text-primary shrink-0 transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" strokeWidth={1.5} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
    </button>
  )
}

function CopyAddressBlock({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="bg-muted/50 hover:bg-muted border-border/60 group flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
    >
      <span className="text-foreground/80 truncate text-xs font-mono">
        {address}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-500" strokeWidth={1.5} />
      ) : (
        <Copy
          className="text-muted-foreground group-hover:text-primary h-3.5 w-3.5 shrink-0 transition-colors"
          strokeWidth={1.5}
        />
      )}
    </button>
  )
}

function nightsCount(acc: Accommodation): number {
  const checkIn = new Date(acc.checkIn)
  const checkOut = new Date(acc.checkOut)
  return Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
  )
}

export function AccommodationsView({ itinerary }: AccommodationsViewProps) {
  const entries = groupAccommodations(itinerary)

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-2xl">
          <Hotel className="text-muted-foreground h-7 w-7" strokeWidth={1.5} />
        </div>
        <p className="text-muted-foreground text-sm">
          Aucun hébergement renseigné dans l&apos;itinéraire.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border/60 flex flex-col gap-1 border-b pb-4">
        <h2 className="text-foreground font-display text-xl font-bold tracking-[0.03em]">
          Hébergements
        </h2>
        <p className="text-muted-foreground text-sm">
          {entries.length} hébergement{entries.length > 1 ? 's' : ''} sur le
          voyage
        </p>
      </div>

      {entries.map((entry, idx) => {
        const { accommodation: acc, days } = entry
        const nights = nightsCount(acc)
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acc.name + ' ' + acc.address)}`
        const stableKey = `${acc.name}-${acc.address}`

        return (
          <Card
            key={stableKey}
            className="border-border/60 bg-card/80 overflow-hidden shadow-none"
          >
            {/* Image strip if available */}
            {acc.images && acc.images.length > 0 && (
              <div className="relative h-36 w-full overflow-hidden">
                <img
                  src={acc.images[0]}
                  alt={acc.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute right-2 bottom-2 flex gap-1">
                  {acc.images.slice(1, 4).map((src, i) => (
                    <div
                      key={i}
                      className="border-border/40 h-10 w-10 overflow-hidden rounded-lg border"
                    >
                      <img
                        src={src}
                        alt={`${acc.name} – ${i + 2}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                  {acc.images.length > 4 && (
                    <div className="border-border/40 bg-background/70 flex h-10 w-10 items-center justify-center rounded-lg border text-xs font-medium">
                      +{acc.images.length - 4}
                    </div>
                  )}
                </div>
              </div>
            )}

            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                <Hotel
                  className="text-secondary h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
                Hébergement {idx + 1}
                <Badge variant="outline" className="ml-auto font-normal text-[11px]">
                  <BedDouble className="mr-1 h-3 w-3" strokeWidth={1.75} />
                  {nights} nuit{nights > 1 ? 's' : ''}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
              {/* Name row */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground text-base leading-snug font-semibold">
                  {acc.name}
                </p>
                <div className="mt-0.5 flex shrink-0 items-center gap-2">
                  <CopyButton text={acc.name} label="Copier le nom" />
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir dans Google Maps"
                    className="text-muted-foreground/50 hover:text-primary transition-colors"
                  >
                    <Navigation className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </a>
                </div>
              </div>

              {/* Address row */}
              <div className="flex items-center gap-2">
                <MapPin
                  className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.75}
                />
                <p className="text-muted-foreground flex-1 text-sm leading-relaxed">
                  {acc.address}
                </p>
                <CopyButton text={acc.address} label="Copier l'adresse" />
              </div>

              {/* Copy address block — large tap target for quick copy */}
              <CopyAddressBlock address={acc.address} />

              {/* Check-in / Check-out */}
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays
                  className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.75}
                />
                <span className="text-muted-foreground text-xs">
                  Check-in{' '}
                  <span className="text-foreground font-medium">
                    {formatDate(acc.checkIn)}
                  </span>{' '}
                  · Check-out{' '}
                  <span className="text-foreground font-medium">
                    {formatDate(acc.checkOut)}
                  </span>
                </span>
              </div>

              {/* Days badges */}
              <div className="flex flex-wrap gap-1.5">
                {days.map((d) => (
                  <Badge
                    key={d.dayNumber}
                    variant="secondary"
                    className="text-[11px] font-normal"
                  >
                    Jour {d.dayNumber} · {d.city}
                  </Badge>
                ))}
              </div>

              {/* Booking link */}
              {acc.bookingUrl && (
                <a
                  href={acc.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
                >
                  Voir la réservation
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

