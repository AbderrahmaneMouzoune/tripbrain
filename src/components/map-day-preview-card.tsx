import { type DayItinerary } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Footprints, Sparkles, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MapDayPreviewCardProps {
  day: DayItinerary
  isActive: boolean
  isPast: boolean
  onSelect: () => void
  onViewMore: () => void
}

function getPreviewItems(day: DayItinerary): string[] {
  return day.activities.map((activity) => activity.name)
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
    <Card
      data-active={isActive}
      style={{ scrollSnapAlign: 'center' }}
      className={cn(
        'w-55 shrink-0 p-3 transition-colors',
        { 'border-primary bg-primary/10 shadow-sm': isActive },
        { 'border-border/60 bg-background/95': !isActive },
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left"
        aria-label={`Sélectionner le jour ${day.dayNumber}`}
      >
        <CardHeader className="px-0 gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm text-foreground">
                Jour {day.dayNumber} · {day.city}
              </CardTitle>
              <CardDescription className="text-xs">
                {new Date(day.date).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </CardDescription>
            </div>
            <span
              className={cn(
                'mt-1 h-2 w-2 shrink-0 rounded-full',
                { 'bg-primary': isActive },
                { 'bg-muted-foreground': isPast },
                { 'bg-secondary': !isActive && !isPast },
              )}
            />
          </div>
        </CardHeader>

        <CardContent className="px-0">
          <p className="truncate text-xs font-medium text-foreground/90">
            {day.title}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

          <ul className="list-disc mt-2 ml-4 flex flex-col gap-1 text-foreground/80">
            {previewItems.map((item) => (
              <li
                key={item}
                className="text-[10px]"
              >
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </button>

      <CardFooter className="px-0 mt-auto">
        <Button
          type="button"
          size="sm"
          variant={isActive ? 'default' : 'secondary'}
          onClick={onViewMore}
          className="h-8 w-full text-xs"
        >
          Voir plus
        </Button>
      </CardFooter>
    </Card>
  )
}
