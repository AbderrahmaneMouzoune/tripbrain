'use client'

import { type Activity, type DayItinerary } from '@/lib/itinerary-data'
import { cn } from '@/lib/utils'
import { useClipboard } from '@/hooks/use-clipboard'
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Banknote,
  Camera,
  Check,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  Navigation,
  ShoppingBag,
  Sparkles,
  Star,
  Train,
  Utensils,
} from 'lucide-react'

interface DayActivityItemProps {
  activity: DayItinerary['activities'][number]
  index: number
}

type ActivityStatus = Activity['status']

function getActivityIcon(type: Activity['type']) {
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

function getActivityStatusClass(status: Exclude<ActivityStatus, undefined>) {
  switch (status) {
    case 'done':
      return 'border-green-200 bg-green-500/10 text-green-600 dark:border-green-800 dark:text-green-400'
    case 'skipped':
      return 'border-red-200 bg-red-500/10 text-red-500 dark:border-red-800 dark:text-red-400'
    default:
      return 'bg-muted/60 text-muted-foreground border-border/40'
  }
}

function formatPrice(value: number, currency?: string) {
  return [value.toLocaleString('fr-FR'), currency].filter(Boolean).join(' ')
}

export function DayActivityItem({ activity, index }: DayActivityItemProps) {
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

  const { copied, copy } = useClipboard()

  return (
    <AccordionItem
      value={activityItemId}
      className="border-b-0 py-3 first:pt-0 last:pb-0"
    >
      <div className="flex gap-3">
        <div className="bg-primary/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-primary h-3.5 w-3.5" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <AccordionTrigger
              className={cn(
                'min-w-0 flex-1 py-0 pr-0 text-left hover:no-underline [&>svg]:mt-1 [&>svg]:size-3.5',
                !hasDetails && 'pointer-events-none [&>svg]:hidden',
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
                        getActivityStatusClass(activity.status),
                      )}
                    >
                      {activity.status}
                    </span>
                  )}
                </div>

                {(activity.duration || activity.openAt) && (
                  <div className="text-muted-foreground/70 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                    {activity.openAt ? (
                      <span>
                        {activity.openAt}
                        {activity.duration && ` · ${activity.duration}`}
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
                <Navigation className="h-3.5 w-3.5" strokeWidth={1.5} />
              </a>
            )}

            <button
              type="button"
              onClick={() => {
                void copy(activity.name)
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
              {copied ? (
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
                  <span className="leading-relaxed">{activity.address}</span>
                </div>
              )}

              {activity.rating !== undefined && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
                  <Star className="h-3 w-3 fill-current" strokeWidth={0} />
                  <span className="font-medium">{activity.rating}</span>
                </div>
              )}

              {activity.tags && activity.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {activity.tags.map((tag) => (
                    <span
                      key={tag}
                      className="border-border/50 text-muted-foreground/70 rounded-full border px-1.5 py-0.5 text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {activity.price !== undefined && (
                <div className="text-muted-foreground/70 mt-1 flex items-center gap-1 text-[11px]">
                  <Banknote className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>{formatPrice(activity.price, activity.currency)}</span>
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
}
