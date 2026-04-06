'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  formatDate,
  getDayStatus,
  type DayItinerary,
} from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import { Lightbox } from '@/components/lightbox'
import { Badge } from '@/components/ui/badge'
import { useClipboard } from '@/hooks/use-clipboard'
import {
  MapPin,
  Hotel,
  Train,
  Car,
  Plane,
  Bus,
  Camera,
  Utensils,
  ShoppingBag,
  Sparkles,
  ExternalLink,
  Clock,
  Navigation,
  Images,
  Star,
  Footprints,
  StickyNote,
  Backpack,
  Lightbulb,
  Tag,
  Copy,
  Check,
  Banknote,
  Hash,
  Armchair,
  Ticket,
  BookCheck,
  CalendarDays,
} from 'lucide-react'

interface DayDetailProps {
  day: DayItinerary
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'visit':
      return Camera
    case 'transport':
      return Train
    case 'food':
      return Utensils
    case 'shopping':
      return ShoppingBag
    case 'experience':
      return Sparkles
    default:
      return MapPin
  }
}

function getTransportIcon(type: string) {
  switch (type) {
    case 'train':
      return Train
    case 'car':
      return Car
    case 'plane':
      return Plane
    case 'bus':
      return Bus
    default:
      return Train
  }
}

type TransportStatus = 'planned' | 'booked' | 'checked-in' | 'completed'
type ActivityStatus = 'planned' | 'done' | 'skipped'
type AccommodationStatus = 'planned' | 'booked' | 'checked-in' | 'completed'

function getStatusBadgeClass(
  status: TransportStatus | ActivityStatus | AccommodationStatus,
) {
  switch (status) {
    case 'booked':
      return 'border-blue-200 bg-blue-500/10 text-blue-600 dark:border-blue-800 dark:text-blue-400'
    case 'checked-in':
    case 'done':
      return 'border-green-200 bg-green-500/10 text-green-600 dark:border-green-800 dark:text-green-400'
    case 'completed':
      return 'bg-muted text-muted-foreground border-border/60'
    case 'skipped':
      return 'border-red-200 bg-red-500/10 text-red-500 dark:border-red-800 dark:text-red-400'
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

export function DayDetail({ day }: DayDetailProps) {
  const status = getDayStatus(day.date)
  const accommodation = day.accommodation
  const images = day.accommodation?.images ?? []
  const dayImages = day.images ?? []

  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [accommodationLightboxOpen, setAccommodationLightboxOpen] =
    useState(false)
  const [dayLightboxOpen, setDayLightboxOpen] = useState(false)
  const { copied: copiedName, copy: copyName } = useClipboard()
  const { copied: copiedAddress, copy: copyAddress } = useClipboard()
  const { copied: copiedActivity, copy: copyActivity } = useClipboard()
  const [copiedActivityId, setCopiedActivityId] = useState<string | null>(null)

  const accommodationLightboxImages = images.map((src, i) => ({
    url: src,
    alt: `${day.accommodation?.name ?? ''} – photo ${i + 1}`,
  }))

  const dayLightboxImages = dayImages.map((img) => ({
    url: img.url,
    alt: img.caption,
  }))

  const accommodationMapUrl = accommodation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${accommodation.name} ${accommodation.address}`,
      )}`
    : ''
  const accommodationDirectionsUrl = accommodation
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${accommodation.name} ${accommodation.address}`,
      )}`
    : ''
  const accommodationNightCount = accommodation
    ? getNightCount(accommodation.checkIn, accommodation.checkOut)
    : null

  useEffect(() => {
    if (!carouselApi) return

    setCurrentSlide(carouselApi.selectedScrollSnap())

    const handleSelect = () => {
      setCurrentSlide(carouselApi.selectedScrollSnap())
    }

    carouselApi.on('select', handleSelect)

    return () => {
      carouselApi.off('select', handleSelect)
    }
  }, [carouselApi])

  return (
    <>
      <Lightbox
        images={accommodationLightboxImages}
        isOpen={accommodationLightboxOpen}
        onClose={() => setAccommodationLightboxOpen(false)}
      />
      <Lightbox
        images={dayLightboxImages}
        isOpen={dayLightboxOpen}
        onClose={() => setDayLightboxOpen(false)}
      />
      <div className="animate-fade-up flex flex-col gap-5">
        {/* Header — editorial style */}
        <div className="border-border/60 flex flex-col gap-1.5 border-b pb-4">
          <div className="space-x-1.5">
            {day.dayType && (
              <Badge variant="outline" className="gap-1 font-medium capitalize">
                <Tag className="h-3 w-3" strokeWidth={1.75} />
                {day.dayType}
              </Badge>
            )}
            {day.walkingDistance && (
              <Badge variant="outline" className="gap-1 font-medium">
                <Footprints className="h-3 w-3" strokeWidth={1.75} />
                {day.walkingDistance}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase',
                status === 'current'
                  ? 'bg-primary text-primary-foreground'
                  : status === 'past'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-secondary/20 text-secondary border-secondary/30 border',
              )}
            >
              Jour {day.dayNumber}
            </span>
            <span className="text-muted-foreground text-xs tracking-widest uppercase">
              {formatDate(day.date)}
            </span>
          </div>
          <h2 className="text-foreground font-display text-2xl leading-tight font-bold tracking-[0.03em]">
            {day.title}
          </h2>
          <div className="text-muted-foreground flex items-center gap-1.5">
            <MapPin className="text-secondary h-3.5 w-3.5" />
            <span className="text-sm font-medium">{day.city}</span>
          </div>
        </div>

        {/* Notes */}
        {day.notes && (
          <div className="border-border/60 border-l pl-3">
            <p className="text-muted-foreground/75 mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
              <StickyNote className="h-3.5 w-3.5" strokeWidth={1.75} />
              Note
            </p>
            <p className="text-foreground/85 text-sm leading-relaxed">
              {day.notes}
            </p>
          </div>
        )}

        {/* Day places & activities carousel */}
        {dayImages.length > 0 && (
          <Card className="border-border/60 bg-card/80 gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                <Images
                  className="text-secondary h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
                Photos du jour
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pt-0 pb-0">
              <div className="relative">
                <Carousel
                  opts={{ loop: true }}
                  setApi={setCarouselApi}
                  className="w-full"
                >
                  <CarouselContent>
                    {dayImages.map((img, i) => (
                      <CarouselItem key={i}>
                        <div
                          className="relative aspect-video w-full cursor-zoom-in overflow-hidden"
                          onClick={() => setDayLightboxOpen(true)}
                        >
                          <img
                            src={img.url}
                            alt={img.caption}
                            className="h-full w-full object-cover"
                          />
                          <div className="bg-primary/70 absolute inset-x-0 bottom-0 px-4 py-3">
                            <p className="text-primary-foreground text-xs leading-snug font-medium drop-shadow">
                              {img.caption}
                            </p>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {dayImages.length > 1 && (
                    <>
                      <CarouselPrevious className="border-border/70 bg-background/70 text-foreground hover:bg-background/90 hover:text-foreground left-2 h-7 w-7 backdrop-blur-sm" />
                      <CarouselNext className="border-border/70 bg-background/70 text-foreground hover:bg-background/90 hover:text-foreground right-2 h-7 w-7 backdrop-blur-sm" />
                    </>
                  )}
                </Carousel>
                {dayImages.length > 1 && (
                  <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-1.5">
                    {dayImages.map((_, i) => (
                      <Button
                        key={i}
                        variant="ghost"
                        size="icon"
                        onClick={() => carouselApi?.scrollTo(i)}
                        className={cn(
                          'h-1.5 rounded-full transition-all duration-200',
                          i === currentSlide
                            ? 'bg-primary w-4'
                            : 'bg-primary/35 w-1.5',
                        )}
                        aria-label={`Aller à la photo ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Highlights */}
        {/* Highlights */}
        {day.highlights && day.highlights.length > 0 && (
          <Card className="border-border/70 bg-card/90 bg-tile-pattern relative overflow-hidden shadow-none">
            <div className="bg-background/55 pointer-events-none absolute inset-0" />
            <CardHeader className="relative px-5 pt-4 pb-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
                <Star
                  className="text-secondary h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
                Points forts
              </CardTitle>
            </CardHeader>
            <CardContent className="relative px-5 pt-0 pb-5">
              <ol className="divide-border/45 flex flex-col divide-y">
                {day.highlights.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-muted-foreground/75 font-display mt-0.5 text-xs tracking-[0.16em] tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-foreground text-sm leading-relaxed">
                      {item}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Transport info */}
        {day.transport && (
          <div className="border-border/60 bg-card/80 rounded-xl border px-4 py-3">
            {(() => {
              const transport = day.transport!
              const Icon = getTransportIcon(transport.type)
              const hasRoute = Boolean(transport.from && transport.to)
              const transportPickupUrl = transport.from
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    transport.from,
                  )}`
                : null

              return (
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="text-primary h-4 w-4" strokeWidth={1.75} />
                  </div>

                  <div className="min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
                        Transport
                      </p>
                      {transport.status && (
                        <span
                          className={cn(
                            'rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                            getStatusBadgeClass(transport.status),
                          )}
                        >
                          {transport.status}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-foreground text-sm leading-snug font-semibold">
                          {hasRoute
                            ? `${transport.from} → ${transport.to}`
                            : transport.details}
                        </p>
                        {transport.details && hasRoute && (
                          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                            {transport.details}
                          </p>
                        )}
                      </div>

                      {transportPickupUrl && (
                        <Button
                          asChild
                          size="sm"
                          className="h-7 shrink-0 rounded-full px-2.5 text-[11px]"
                        >
                          <a
                            href={transportPickupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Navigation className="h-3 w-3" strokeWidth={1.5} />
                            Point de départ
                          </a>
                        </Button>
                      )}
                    </div>

                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {(transport.departureTime ||
                        transport.arrivalTime ||
                        transport.duration) && (
                        <span className="inline-flex items-center gap-1">
                          <Clock
                            className="h-3 w-3 shrink-0"
                            strokeWidth={1.75}
                          />
                          {transport.departureTime && transport.arrivalTime ? (
                            <>
                              {transport.departureTime} →{' '}
                              {transport.arrivalTime}
                            </>
                          ) : (
                            <>
                              {transport.departureTime ?? transport.arrivalTime}
                            </>
                          )}
                          {transport.duration && (
                            <span className="text-muted-foreground/70">
                              ({transport.duration})
                            </span>
                          )}
                        </span>
                      )}

                      {transport.provider && <span>{transport.provider}</span>}

                      {transport.seat && (
                        <span className="inline-flex items-center gap-1">
                          <Armchair
                            className="h-3 w-3 shrink-0"
                            strokeWidth={1.5}
                          />
                          {transport.seat}
                        </span>
                      )}

                      {transport.gate && <span>Gate {transport.gate}</span>}

                      {transport.terminal && (
                        <span>Terminal {transport.terminal}</span>
                      )}

                      {transport.bookingReference && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Hash
                            className="h-3 w-3 shrink-0"
                            strokeWidth={1.5}
                          />
                          <span className="truncate font-mono">
                            {transport.bookingReference}
                          </span>
                        </span>
                      )}

                      {transport.price !== undefined && (
                        <span className="inline-flex items-center gap-1">
                          <Banknote
                            className="h-3 w-3 shrink-0"
                            strokeWidth={1.5}
                          />
                          {formatPrice(transport.price, transport.currency)}
                        </span>
                      )}

                      {transport.bookingUrl && (
                        <a
                          href={transport.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors hover:underline"
                        >
                          <Ticket className="h-3 w-3" strokeWidth={1.5} />
                          Billet
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {transport.notes && (
                      <p className="text-muted-foreground/70 mt-1 text-[11px] leading-relaxed italic">
                        {transport.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Accommodation */}
        {accommodation && (
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
                            onClick={() => setAccommodationLightboxOpen(true)}
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
                      <Hotel
                        className="text-secondary h-3 w-3"
                        strokeWidth={1.75}
                      />
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
                      className="text-muted-foreground/60 hover:text-primary h-7 w-7 shrink-0 rounded-full"
                    >
                      {copiedName ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
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
                            <Check className="h-3 w-3 text-green-500" />
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
                            href={accommodationDirectionsUrl}
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
                    <CalendarDays
                      className="h-3 w-3 shrink-0"
                      strokeWidth={1.5}
                    />
                    {formatCompactDate(accommodation.checkIn)} →{' '}
                    {formatCompactDate(accommodation.checkOut)}
                  </span>

                  {accommodationNightCount && (
                    <span>
                      {accommodationNightCount} nuit
                      {accommodationNightCount > 1 ? 's' : ''}
                    </span>
                  )}

                  {accommodation.price !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      <Banknote
                        className="h-3 w-3 shrink-0"
                        strokeWidth={1.5}
                      />
                      {formatPrice(accommodation.price, accommodation.currency)}
                    </span>
                  )}

                  {accommodation.bookingReference && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <BookCheck
                        className="h-3 w-3 shrink-0"
                        strokeWidth={1.5}
                      />
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

                  {!accommodation.bookingUrl && accommodationMapUrl && (
                    <a
                      href={accommodationMapUrl}
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
        )}

        {/* Activities */}
        <Card className="border-border/60 bg-card/80 shadow-none">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <Sparkles
                className="text-secondary h-3.5 w-3.5"
                strokeWidth={1.75}
              />
              Programme
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-4">
            <Accordion
              type="single"
              collapsible
              className="divide-border/40 divide-y"
            >
              {day.activities.map((activity, index) => {
                const Icon = getActivityIcon(activity.type)
                const activityItemId = activity.id ?? `activity-${index}`
                const hasDetails = Boolean(
                  activity.description ||
                  activity.address ||
                  activity.rating !== undefined ||
                  (activity.tags && activity.tags.length > 0) ||
                  activity.price !== undefined ||
                  activity.bookingUrl ||
                  activity.tips,
                )

                return (
                  <AccordionItem
                    key={activityItemId}
                    value={activityItemId}
                    className="border-b-0 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex gap-3">
                      <div className="bg-primary/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                        <Icon
                          className="text-primary h-3.5 w-3.5"
                          strokeWidth={1.75}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <AccordionTrigger
                            className={cn(
                              'min-w-0 flex-1 py-0 pr-0 text-left hover:no-underline [&>svg]:mt-1 [&>svg]:size-3.5',
                              !hasDetails &&
                                'pointer-events-none [&>svg]:hidden',
                            )}
                          >
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <p className="text-foreground text-sm leading-snug font-semibold">
                                  {activity.name}
                                </p>
                                {activity.status && (
                                  <span
                                    className={cn(
                                      'rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                                      getStatusBadgeClass(activity.status),
                                    )}
                                  >
                                    {activity.status}
                                  </span>
                                )}
                              </div>

                              {(activity.duration ||
                                activity.startTime ||
                                activity.endTime) && (
                                <div className="text-muted-foreground/70 flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <Clock
                                    className="h-3 w-3 shrink-0"
                                    strokeWidth={1.75}
                                  />
                                  {activity.startTime || activity.endTime ? (
                                    <span>
                                      {[activity.startTime, activity.endTime]
                                        .filter(Boolean)
                                        .join(' – ')}
                                      {activity.duration &&
                                        ` (${activity.duration})`}
                                    </span>
                                  ) : (
                                    <span>{activity.duration}</span>
                                  )}
                                </div>
                              )}

                              {activity.description && (
                                <p className="text-muted-foreground line-clamp-1 text-xs leading-relaxed">
                                  {activity.description}
                                </p>
                              )}
                            </div>
                          </AccordionTrigger>

                          {activity.coordinates && (
                            <a
                              href={`https://www.google.com/maps?q=${activity.coordinates[0]},${activity.coordinates[1]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground/50 hover:text-primary mt-0.5 shrink-0 pt-1.5 pr-1.5 transition-colors"
                              aria-label={`Voir ${activity.name} sur la carte`}
                            >
                              <Navigation
                                className="h-3.5 w-3.5"
                                strokeWidth={1.5}
                              />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              void copyActivity(activity.name)
                              setCopiedActivityId(activityItemId)
                            }}
                            title={
                              activity.address
                                ? "Copier l'adresse"
                                : "Copier le nom de l'activité"
                            }
                            aria-label={
                              activity.address
                                ? `Copier l'adresse de ${activity.name}`
                                : `Copier le nom de ${activity.name}`
                            }
                            className="text-muted-foreground/50 hover:text-primary mt-0.5 shrink-0 pt-1.5 pr-1.5 transition-colors"
                          >
                            {copiedActivity &&
                            copiedActivityId === activityItemId ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                            )}
                          </button>
                        </div>

                        {hasDetails && (
                          <AccordionContent className="pt-2 pb-0">
                            {activity.address && (
                              <div className="text-muted-foreground/70 mt-1 flex items-start gap-1 text-[11px]">
                                <MapPin
                                  className="mt-0.5 h-3 w-3 shrink-0"
                                  strokeWidth={1.5}
                                />
                                <span className="leading-relaxed">
                                  {activity.address}
                                </span>
                              </div>
                            )}

                            {activity.rating !== undefined && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
                                <Star
                                  className="h-3 w-3 fill-current"
                                  strokeWidth={0}
                                />
                                <span className="font-medium">
                                  {activity.rating}
                                </span>
                              </div>
                            )}

                            {activity.tags && activity.tags.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {activity.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="border-border/50 text-muted-foreground/70 rounded-full border px-1.5 py-0.5 text-[10px]"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}

                            {activity.price !== undefined && (
                              <div className="text-muted-foreground/70 mt-1 flex items-center gap-1 text-[11px]">
                                <Banknote
                                  className="h-3 w-3 shrink-0"
                                  strokeWidth={1.5}
                                />
                                <span>
                                  {activity.price} {activity.currency ?? ''}
                                </span>
                                {activity.reservationRequired && (
                                  <span className="text-muted-foreground/50">
                                    · réservation requise
                                  </span>
                                )}
                              </div>
                            )}

                            {activity.bookingUrl && (
                              <a
                                href={activity.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 mt-1 inline-flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
                              >
                                Réserver
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}

                            {activity.tips && (
                              <p className="text-muted-foreground/70 mt-1 text-[11px] leading-relaxed italic">
                                💡 {activity.tips}
                              </p>
                            )}
                          </AccordionContent>
                        )}
                      </div>
                    </div>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </CardContent>
        </Card>

        {/* Food recommendations */}
        {day.foodRecommendations && day.foodRecommendations.length > 0 && (
          <Card className="border-border/60 bg-card/80 shadow-none">
            <CardHeader className="px-4 py-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                <Utensils
                  className="text-secondary h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
                À goûter
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-4">
              <div className="flex flex-wrap gap-2">
                {day.foodRecommendations.map((item, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {item}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Packing tips */}
        {day.packingTips && day.packingTips.length > 0 && (
          <Card className="border-border/60 bg-card/80 shadow-none">
            <CardHeader className="px-4 py-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                <Backpack
                  className="text-secondary h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
                Bagages
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-4">
              <ul className="divide-border/40 flex flex-col divide-y">
                {day.packingTips.map((tip, i) => (
                  <li
                    key={i}
                    className="text-foreground flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="bg-secondary/20 h-1.5 w-1.5 shrink-0 rounded-full" />
                    {tip}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        {day.tips && day.tips.length > 0 && (
          <Card className="border-border/60 bg-card/80 shadow-none">
            <CardHeader className="px-4 py-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                <Lightbulb
                  className="text-secondary h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
                Conseils pratiques
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-4">
              <ul className="flex flex-col gap-2">
                {day.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-secondary mt-0.5 shrink-0">→</span>
                    <span className="text-foreground leading-snug">{tip}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
