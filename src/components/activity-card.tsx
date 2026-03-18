'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDuration, type Activity } from '@/lib/itinerary-data'
import { Lightbox } from '@/components/lightbox'
import {
  Camera,
  Train,
  Utensils,
  ShoppingBag,
  Sparkles,
  MapPin,
  Navigation,
  ExternalLink,
  Timer,
  Banknote,
  ClipboardList,
  DoorOpen,
} from 'lucide-react'

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

function getPriorityLabel(priority: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high':
      return 'Incontournable'
    case 'medium':
      return 'Recommandé'
    case 'low':
      return 'Facultatif'
  }
}

function getPriorityClassName(priority: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high':
      return 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900'
    case 'medium':
      return 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900'
    case 'low':
      return 'bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800'
  }
}

interface ActivityCardProps {
  activity: Activity
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const Icon = getActivityIcon(activity.type)
  const hasTimeWindow = activity.timeWindow?.start || activity.timeWindow?.end
  const hasMeta =
    hasTimeWindow ||
    activity.duration !== undefined ||
    activity.budget !== undefined

  const lightboxImages = (activity.images ?? []).map((url, i) => ({
    url,
    alt: `${activity.name} – photo ${i + 1}`,
  }))

  function openLightbox(index: number) {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  return (
    <>
      {lightboxImages.length > 0 && (
        <Lightbox
          images={lightboxImages}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          initialIndex={lightboxIndex}
        />
      )}

      <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
        <div className="bg-primary/10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-primary h-3.5 w-3.5" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1 leading-none">
          {/* Name + priority badge + map link */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="text-foreground text-sm leading-snug font-semibold">
                {activity.name}
              </p>
              {activity.priority && (
                <span
                  className={cn(
                    'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
                    getPriorityClassName(activity.priority),
                  )}
                >
                  {getPriorityLabel(activity.priority)}
                </span>
              )}
            </div>
            {activity.coordinates && (
              <a
                href={`https://www.google.com/maps?q=${activity.coordinates[0]},${activity.coordinates[1]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/50 hover:text-primary mt-0.5 shrink-0 pt-1.5 pr-1.5 transition-colors"
              >
                <Navigation className="h-3.5 w-3.5" strokeWidth={1.5} />
              </a>
            )}
          </div>

          {/* Description */}
          {activity.description && (
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {activity.description}
            </p>
          )}

          {/* Notes */}
          {activity.notes && (
            <p className="text-muted-foreground/70 mt-0.5 text-[11px] leading-relaxed italic">
              {activity.notes}
            </p>
          )}

          {/* Meta row: opening hours · duration · budget */}
          {hasMeta && (
            <div className="text-muted-foreground/70 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {hasTimeWindow && (
                <span className="flex items-center gap-1">
                  <DoorOpen className="h-3 w-3" strokeWidth={1.75} />
                  <span className="font-medium">Horaires :</span>
                  {activity.timeWindow!.start}
                  {activity.timeWindow!.start &&
                    activity.timeWindow!.end &&
                    ` – ${activity.timeWindow!.end}`}
                  {!activity.timeWindow!.start && activity.timeWindow!.end}
                </span>
              )}
              {activity.duration !== undefined && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" strokeWidth={1.75} />
                  {formatDuration(activity.duration)}
                </span>
              )}
              {activity.budget !== undefined && (
                <span className="flex items-center gap-1">
                  <Banknote className="h-3 w-3" strokeWidth={1.75} />
                  {activity.budget} €
                </span>
              )}
            </div>
          )}

          {/* Prerequisites */}
          {activity.preRequisites && activity.preRequisites.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-start gap-1">
              <ClipboardList
                className="text-muted-foreground/60 mt-0.5 h-3 w-3 shrink-0"
                strokeWidth={1.75}
              />
              {activity.preRequisites.map((req, i) => (
                <span
                  key={i}
                  className="bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 text-[10px]"
                >
                  {req}
                </span>
              ))}
            </div>
          )}

          {/* External link */}
          {activity.link && (
            <a
              href={activity.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium transition-colors hover:underline"
            >
              Site officiel
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Activity images — click to open lightbox */}
          {activity.images && activity.images.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {activity.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => openLightbox(i)}
                  className="h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md focus:outline-none"
                >
                  <img
                    src={img}
                    alt={`${activity.name} – photo ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
