'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { type Accommodation } from '@/lib/itinerary-data'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Lightbox } from '@/components/lightbox'
import { useClipboard } from '@/hooks/use-clipboard'
import {
  Hotel,
  MapPin,
  Navigation,
  CalendarDays,
  Banknote,
  BookCheck,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'

function getStatusBadgeClass(status: Accommodation['status']) {
  switch (status) {
    case 'booked':
      return 'border-blue-200 bg-blue-500/10 text-blue-600 dark:border-blue-800 dark:text-blue-400'
    case 'checked-in':
      return 'border-green-200 bg-green-500/10 text-green-600 dark:border-green-800 dark:text-green-400'
    case 'completed':
      return 'bg-muted text-muted-foreground border-border/60'
    default:
      return 'bg-muted/60 text-muted-foreground border-border/40'
  }
}

function getNightCount(checkIn: string, checkOut: string) {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  const millisecondsPerDay = 1000 * 60 * 60 * 24
  const difference = end.getTime() - start.getTime()

  if (Number.isNaN(difference) || difference <= 0) return null

  return Math.round(difference / millisecondsPerDay)
}

function formatCompactDate(dateString: string, locale: string = 'fr-FR') {
  const date = new Date(dateString)

  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  })
}

function formatPrice(value: number, currency?: string) {
  return [value.toLocaleString('fr-FR'), currency].filter(Boolean).join(' ')
}

interface AccommodationCardProps {
  accommodation: Accommodation
}

export function AccommodationCard({ accommodation }: AccommodationCardProps) {
  const images = accommodation.images ?? []
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const { copied: copiedName, copy: copyName } = useClipboard()
  const { copied: copiedAddress, copy: copyAddress } = useClipboard()

  const nightCount = getNightCount(accommodation.checkIn, accommodation.checkOut)

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${accommodation.name} ${accommodation.address}`,
  )}`

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${accommodation.name} ${accommodation.address}`,
  )}`

  const lightboxImages = images.map((src, i) => ({
    url: src,
    alt: `${accommodation.name} – photo ${i + 1}`,
  }))

  return (
    <>
      <Lightbox
        images={lightboxImages}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      <Card className="border-border/60 bg-card/80 overflow-hidden shadow-none">
        <div className="flex gap-3 p-3">
          {images.length > 0 && (
            <div className="hidden aspect-square w-24 shrink-0 overflow-hidden rounded-xl sm:block">
              <Carousel opts={{ loop: true }} className="h-full w-full">
                <CarouselContent className="h-full">
                  {images.map((src, i) => (
                    <CarouselItem key={i} className="aspect-square h-full">
                      <div
                        className="h-full w-full cursor-zoom-in overflow-hidden"
                        onClick={() => setLightboxOpen(true)}
                      >
                        <img
                          src={src}
                          alt={`${accommodation.name} – photo ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {images.length > 1 && (
                  <>
                    <CarouselPrevious
                      className="left-1 h-5 w-5"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <CarouselNext
                      className="right-1 h-5 w-5"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </>
                )}
              </Carousel>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                  <Hotel className="text-secondary h-3 w-3" strokeWidth={1.75} />
                  Hébergement
                </p>
                {accommodation.status && (
                  <span
                    className={cn(
                      'w-fit rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                      getStatusBadgeClass(accommodation.status),
                    )}
                  >
                    {accommodation.status}
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground min-w-0 text-sm leading-snug font-semibold">
                  {accommodation.name}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyName(accommodation.name)}
                  title="Copier le nom"
                  className="h-7 w-7 shrink-0 rounded-full"
                >
                  {copiedName ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-muted/35 border-border/50 rounded-xl border px-3 py-2.5">
              <div className="flex items-start gap-2">
                <MapPin
                  className="text-secondary mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm leading-snug font-medium">
                    {accommodation.address}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyAddress(accommodation.address)}
                      className="h-7 rounded-full px-2.5 text-[11px]"
                    >
                      {copiedAddress ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" strokeWidth={1.5} />
                      )}
                      Copier l'adresse
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[11px]"
                    >
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Navigation className="h-3 w-3" strokeWidth={1.5} />
                        Itinéraire
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                {formatCompactDate(accommodation.checkIn)} →{' '}
                {formatCompactDate(accommodation.checkOut)}
              </span>

              {nightCount && (
                <span>
                  {nightCount} nuit{nightCount > 1 ? 's' : ''}
                </span>
              )}

              {accommodation.price !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Banknote className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  {formatPrice(accommodation.price, accommodation.currency)}
                </span>
              )}

              {accommodation.bookingReference && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <BookCheck className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate font-mono">
                    {accommodation.bookingReference}
                  </span>
                </span>
              )}

              {accommodation.bookingUrl && (
                <a
                  href={accommodation.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors hover:underline"
                >
                  Réservation
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {!accommodation.bookingUrl && mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors hover:underline"
                >
                  Voir sur la carte
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
