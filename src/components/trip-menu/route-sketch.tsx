import { useMemo } from 'react'
import { buildRouteSketch } from '@/components/trip-menu/trip-format'
import { cn } from '@/lib/utils'

/**
 * Mini-tracé du voyage : les étapes reliées dans l'ordre, sans fond de carte.
 * Les couleurs suivent `currentColor` (le trait) ; l'étape du jour ressort en
 * orange. Purement décoratif : le texte voisin dit déjà où l'on va.
 */
export function RouteSketch({
  coordinates,
  width,
  height,
  padding = 8,
  currentIndex,
  dashed,
  className,
  dotClassName,
}: {
  coordinates: Array<[number, number] | undefined>
  width: number
  height: number
  padding?: number
  /** Index (dans `coordinates`) de la journée à mettre en avant. */
  currentIndex?: number | null
  /** Trait pointillé : voyage pas encore commencé. */
  dashed?: boolean
  className?: string
  dotClassName?: string
}) {
  const sketch = useMemo(
    () => buildRouteSketch(coordinates, { width, height, padding }),
    [coordinates, width, height, padding],
  )
  if (!sketch) return null
  const highlighted =
    currentIndex === null || currentIndex === undefined
      ? -1
      : (sketch.pointIndexByInput[currentIndex] ?? -1)

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
    >
      {sketch.points.length > 1 && (
        <path
          d={sketch.path}
          fill="none"
          stroke="currentColor"
          strokeWidth={dashed ? 2.5 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? '2 5' : undefined}
        />
      )}
      {sketch.points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={index === highlighted ? 6 : 3.5}
          className={cn(
            index === highlighted ? 'fill-secondary' : 'fill-current',
            index !== highlighted && dotClassName,
          )}
        />
      ))}
    </svg>
  )
}
