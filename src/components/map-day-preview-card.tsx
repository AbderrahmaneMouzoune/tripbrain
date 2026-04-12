import { type DayItinerary } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MapDayPreviewCardProps {
  day: DayItinerary
  isActive: boolean
  isPast: boolean
  onSelect: () => void
  onViewMore: () => void
}

function getPreviewItems(day: DayItinerary): string[] {
  if (day.highlights?.length) {
    return day.highlights.slice(0, 2)
  }

  return day.activities.slice(0, 2).map((activity) => activity.name)
}

export function MapDayPreviewCard({
  day,
  isActive,
  isPast,
  onSelect,
  onViewMore,
}: MapDayPreviewCardProps) {
  const previewItems = getPreviewItems(day)

  return (
    <div
      data-active={isActive}
      style={{ scrollSnapAlign: 'center' }}
      className={cn(
        'w-55 shrink-0 rounded-xl border p-3 transition-colors flex flex-col',
        isActive
          ? 'border-primary bg-primary/10 shadow-sm'
          : 'border-border/60 bg-background/95',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left"
        aria-label={`Sélectionner le jour ${day.dayNumber}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Jour {day.dayNumber} · {day.city}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(day.date).toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
          <span
            className={cn(
              'mt-1 h-2 w-2 shrink-0 rounded-full',
              isActive
                ? 'bg-primary'
                : isPast
                  ? 'bg-muted-foreground'
                  : 'bg-secondary',
            )}
          />
        </div>

        <p className="mt-2 truncate text-xs font-medium text-foreground/90">
          {day.title}
        </p>

        <div className="mt-2 flex min-h-5 flex-wrap gap-1">
          {previewItems.map((item) => (
            <span
              key={item}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{day.activities.length} activités</span>
          {day.walkingDistance && <span>{day.walkingDistance}</span>}
        </div>
      </button>

      <Button
        type="button"
        size="sm"
        variant={isActive ? 'default' : 'secondary'}
        onClick={onViewMore}
        className="mt-auto h-8 w-full text-xs"
      >
        Voir plus
      </Button>
    </div>
  )
}
