'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  formatDate,
  getDayStatus,
  type Accommodation,
  type Activity,
  type DayItinerary,
  type Transport,
} from '@/lib/itinerary-data'
import {
  accommodationForm,
  activityForm,
  dayForm,
  transportForm,
} from '@/lib/edit-fields'
import {
  createEmptyAccommodation,
  createEmptyActivity,
  createEmptyTransport,
  moveActivity,
  removeActivity,
  setAccommodation,
  setTransport,
  upsertActivity,
} from '@/lib/itinerary-edit'
import { EntityEditSheet } from '@/components/edit/entity-edit-sheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion } from '@/components/ui/accordion'
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
import { TransportCard } from '@/components/transport-card'
import { AccommodationCard } from '@/components/accommodation-card'
import { TipsCard } from '@/components/tips-card'
import { DayActivityItem } from '@/components/day-activity-item'
import {
  MapPin,
  Utensils,
  Sparkles,
  Images,
  Star,
  Footprints,
  StickyNote,
  Backpack,
  Tag,
  Pencil,
  Plus,
} from 'lucide-react'
import { CachedImage } from '@/components/cached-image'

type EditorKind = 'day' | 'activity' | 'transport' | 'accommodation'

interface DayDetailProps {
  day: DayItinerary
  /** Active les boutons d'édition sur les différentes sections */
  isEditing?: boolean
  /** Reçoit la journée modifiée ; la persistance est gérée par l'appelant */
  onDayChange?: (day: DayItinerary) => void
}

export function DayDetail({
  day,
  isEditing = false,
  onDayChange,
}: DayDetailProps) {
  const status = getDayStatus(day.date)
  const dayImages = day.images ?? []
  const { transport, accommodation } = day

  // Chaque formulaire garde l'entité en cours d'édition : le panneau reste
  // monté après fermeture pour conserver l'animation de sortie.
  const [openEditor, setOpenEditor] = useState<EditorKind | null>(null)
  const [dayDraft, setDayDraft] = useState<DayItinerary | null>(null)
  const [activityDraft, setActivityDraft] = useState<Activity | null>(null)
  const [transportDraft, setTransportDraft] = useState<Transport | null>(null)
  const [accommodationDraft, setAccommodationDraft] =
    useState<Accommodation | null>(null)

  const closeEditor = (open: boolean) => {
    if (!open) setOpenEditor(null)
  }

  const editDay = () => {
    setDayDraft(day)
    setOpenEditor('day')
  }

  const editActivity = (activity: Activity) => {
    setActivityDraft(activity)
    setOpenEditor('activity')
  }

  const editTransport = (value: Transport) => {
    setTransportDraft(value)
    setOpenEditor('transport')
  }

  const editAccommodation = (value: Accommodation) => {
    setAccommodationDraft(value)
    setOpenEditor('accommodation')
  }

  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [dayLightboxOpen, setDayLightboxOpen] = useState(false)

  const dayLightboxImages = dayImages.map((img) => ({
    url: img.url,
    alt: img.caption,
  }))

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
        images={dayLightboxImages}
        isOpen={dayLightboxOpen}
        onClose={() => setDayLightboxOpen(false)}
      />
      <div className="flex flex-col gap-5">
        {/* Header — editorial style */}
        <div className="border-border/60 flex flex-col gap-1.5 border-b pb-4">
          <div className="flex items-start gap-2">
            <div className="space-x-1.5">
              {day.dayType && (
                <Badge
                  variant="outline"
                  className="gap-1 font-medium capitalize"
                >
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

            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={editDay}
                className="ml-auto h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-[11px]"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.75} />
                Modifier la journée
              </Button>
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
                          <CachedImage
                            src={img.url}
                            alt={img.caption}
                            className="h-full w-full object-cover"
                            fallbackClassName="h-full w-full aspect-video"
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
        {transport ? (
          <TransportCard
            transport={transport}
            onEdit={isEditing ? () => editTransport(transport) : undefined}
          />
        ) : (
          isEditing && (
            <AddEntityButton
              label="Ajouter un transport"
              onClick={() => editTransport(createEmptyTransport())}
            />
          )
        )}

        {/* Accommodation */}
        {accommodation ? (
          <AccommodationCard
            accommodation={accommodation}
            onEdit={
              isEditing ? () => editAccommodation(accommodation) : undefined
            }
          />
        ) : (
          isEditing && (
            <AddEntityButton
              label="Ajouter un hébergement"
              onClick={() => editAccommodation(createEmptyAccommodation(day))}
            />
          )
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
              {day.activities.map((activity, index) => (
                <DayActivityItem
                  key={activity.id ?? `activity-${index}`}
                  activity={activity}
                  index={index}
                  onEdit={isEditing ? () => editActivity(activity) : undefined}
                  onMove={
                    isEditing
                      ? (offset) =>
                          onDayChange?.(moveActivity(day, activity.id, offset))
                      : undefined
                  }
                  canMoveUp={index > 0}
                  canMoveDown={index < day.activities.length - 1}
                />
              ))}
            </Accordion>

            {isEditing && (
              <div className="mt-3">
                <AddEntityButton
                  label="Ajouter une activité"
                  onClick={() => editActivity(createEmptyActivity())}
                />
              </div>
            )}
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
        {day.tips && day.tips.length > 0 && <TipsCard tips={day.tips} />}
      </div>

      {dayDraft && (
        <EntityEditSheet
          open={openEditor === 'day'}
          onOpenChange={closeEditor}
          title="Modifier la journée"
          schema={dayForm}
          value={dayDraft}
          onSubmit={(next) => onDayChange?.(next)}
        />
      )}

      {activityDraft && (
        <EntityEditSheet
          open={openEditor === 'activity'}
          onOpenChange={closeEditor}
          title={
            day.activities.some((current) => current.id === activityDraft.id)
              ? "Modifier l'activité"
              : 'Nouvelle activité'
          }
          schema={activityForm}
          value={activityDraft}
          onSubmit={(next) => onDayChange?.(upsertActivity(day, next))}
          onDelete={
            day.activities.some((current) => current.id === activityDraft.id)
              ? () => onDayChange?.(removeActivity(day, activityDraft.id))
              : undefined
          }
        />
      )}

      {transportDraft && (
        <EntityEditSheet
          open={openEditor === 'transport'}
          onOpenChange={closeEditor}
          title={transport ? 'Modifier le transport' : 'Nouveau transport'}
          schema={transportForm}
          value={transportDraft}
          onSubmit={(next) => onDayChange?.(setTransport(day, next))}
          onDelete={
            transport
              ? () => onDayChange?.(setTransport(day, undefined))
              : undefined
          }
        />
      )}

      {accommodationDraft && (
        <EntityEditSheet
          open={openEditor === 'accommodation'}
          onOpenChange={closeEditor}
          title={
            accommodation ? "Modifier l'hébergement" : 'Nouvel hébergement'
          }
          schema={accommodationForm}
          value={accommodationDraft}
          onSubmit={(next) => onDayChange?.(setAccommodation(day, next))}
          onDelete={
            accommodation
              ? () => onDayChange?.(setAccommodation(day, undefined))
              : undefined
          }
        />
      )}
    </>
  )
}

interface AddEntityButtonProps {
  label: string
  onClick: () => void
}

/** Bouton en pointillés proposé en mode édition pour créer une entité. */
function AddEntityButton({ label, onClick }: AddEntityButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="border-border/70 text-muted-foreground hover:text-foreground h-auto w-full justify-center gap-1.5 border-dashed py-3 text-xs"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </Button>
  )
}
