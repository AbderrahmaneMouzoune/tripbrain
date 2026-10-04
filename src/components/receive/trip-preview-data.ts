/**
 * Ce que l'aperçu d'un voyage reçu montre, calculé à partir de l'itinéraire
 * lui-même : tracé de la mini-carte, compteurs, dates et contenu inclus.
 *
 * Rien n'est supposé : un compteur vaut ce que contiennent les journées, et un
 * élément « inclus » n'apparaît que s'il existe vraiment dans le voyage.
 * Logique pure, testée dans `src/lib/__tests__/receive-trip-preview.test.ts`.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import { parseDayDate, tripCities } from '@/lib/trips'

// ── Mini-carte ────────────────────────────────────────────────────────────────

export interface RouteStop {
  x: number
  y: number
  /** Ville de l'étape, affichée à sa première apparition seulement. */
  label: string | null
}

export interface ProjectedRoute {
  /** Points du tracé, dans l'ordre du voyage (allers-retours compris). */
  points: { x: number; y: number }[]
  /** Étapes distinctes à marquer d'un point. */
  stops: RouteStop[]
}

export interface RouteBox {
  width: number
  height: number
  /** Marge intérieure, pour que points et étiquettes ne touchent pas le bord. */
  padding: number
}

/** Coordonnées utilisables : nombres finis, dans les bornes, et pas l'origine (0, 0) par défaut. */
function isUsable([lat, lng]: [number, number]): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * Projette les coordonnées des journées dans une boîte SVG.
 *
 * Projection équirectangulaire corrigée de la latitude moyenne : à l'échelle
 * d'un voyage, c'est assez fidèle pour reconnaître la forme du parcours. Les
 * proportions sont conservées (le tracé est centré, jamais étiré), et le nord
 * reste en haut. Deux journées consécutives au même endroit ne font qu'un
 * point.
 */
export function projectRoute(
  days: readonly Pick<DayItinerary, 'coordinates' | 'city'>[],
  box: RouteBox,
): ProjectedRoute {
  const sequence: { lat: number; lng: number; city: string }[] = []
  for (const day of days) {
    if (!Array.isArray(day.coordinates) || !isUsable(day.coordinates)) continue
    const [lat, lng] = day.coordinates
    const previous = sequence[sequence.length - 1]
    if (previous && previous.lat === lat && previous.lng === lng) continue
    sequence.push({ lat, lng, city: day.city?.trim() ?? '' })
  }
  if (sequence.length === 0) return { points: [], stops: [] }

  const meanLat =
    sequence.reduce((total, point) => total + point.lat, 0) / sequence.length
  const xScale = Math.cos((meanLat * Math.PI) / 180)
  const raw = sequence.map((point) => ({
    x: point.lng * xScale,
    y: -point.lat,
  }))

  const minX = Math.min(...raw.map((p) => p.x))
  const maxX = Math.max(...raw.map((p) => p.x))
  const minY = Math.min(...raw.map((p) => p.y))
  const maxY = Math.max(...raw.map((p) => p.y))
  const spanX = maxX - minX
  const spanY = maxY - minY

  const innerWidth = Math.max(box.width - box.padding * 2, 0)
  const innerHeight = Math.max(box.height - box.padding * 2, 0)
  // Un seul lieu (ou des lieux alignés) : pas de division par zéro, on centre.
  const scale =
    spanX === 0 && spanY === 0
      ? 0
      : Math.min(
          spanX === 0 ? Infinity : innerWidth / spanX,
          spanY === 0 ? Infinity : innerHeight / spanY,
        )
  const offsetX = box.padding + (innerWidth - spanX * scale) / 2
  const offsetY = box.padding + (innerHeight - spanY * scale) / 2

  const points = raw.map((p) => ({
    x: round(offsetX + (p.x - minX) * scale),
    y: round(offsetY + (p.y - minY) * scale),
  }))

  const seenPlaces = new Set<string>()
  const seenCities = new Set<string>()
  const stops: RouteStop[] = []
  points.forEach((point, index) => {
    const key = `${point.x},${point.y}`
    if (seenPlaces.has(key)) return
    seenPlaces.add(key)
    const city = sequence[index].city
    const label = city && !seenCities.has(city) ? city : null
    if (city) seenCities.add(city)
    stops.push({ ...point, label })
  })

  return { points, stops }
}

// ── Compteurs ─────────────────────────────────────────────────────────────────

export interface TripPreviewStats {
  days: number
  cities: number
  /** Hébergements distincts : une nuit sur deux au même hôtel ne compte qu'une fois. */
  accommodations: number
  /** Journées avec un trajet (train, vol, voiture, bus). */
  transports: number
  activities: number
}

export function previewStats(days: readonly DayItinerary[]): TripPreviewStats {
  const accommodations = new Set<string>()
  let transports = 0
  let activities = 0
  for (const day of days) {
    const stay = day.accommodation
    if (stay) {
      const key = stay.id || `${stay.name}|${stay.address}`
      if (key.trim() && key !== '|') accommodations.add(key)
    }
    if (day.transport) transports += 1
    activities += day.activities?.length ?? 0
  }
  return {
    days: days.length,
    cities: tripCities([...days]).length,
    accommodations: accommodations.size,
    transports,
    activities,
  }
}

/** Accord simple : « 1 jour », « 20 jours ». */
export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count > 1 ? (pluralForm ?? `${singular}s`) : singular}`
}

// ── Contenu inclus ────────────────────────────────────────────────────────────

/** Énumération française : « A », « A et B », « A, B et C ». */
export function joinFrench(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/** Les lignes « ce qui est inclus » de l'aperçu, seulement pour ce qui existe. */
export function previewIncludes(days: readonly DayItinerary[]): string[] {
  const has = (test: (day: DayItinerary) => boolean) => days.some(test)
  const lines: string[] = []

  const activities = days.flatMap((day) => day.activities ?? [])
  if (activities.length > 0) {
    const details: string[] = []
    if (activities.some((a) => a.openAt)) details.push('horaires')
    if (activities.some((a) => a.address)) details.push('adresses')
    lines.push(
      details.length > 0
        ? `Programme jour par jour, avec ${joinFrench(details)}`
        : 'Programme jour par jour',
    )
  }

  const extras: string[] = []
  if (has((d) => Boolean(d.tips?.length) || activities.some((a) => a.tips))) {
    extras.push('conseils')
  }
  if (has((d) => Boolean(d.foodRecommendations?.length))) {
    extras.push('plats à goûter')
  }
  if (has((d) => Boolean(d.packingTips?.length))) {
    extras.push('liste de bagages')
  }
  if (extras.length > 0) lines.push(capitalize(joinFrench(extras)))

  if (
    has(
      (d) =>
        Boolean(d.transport?.bookingReference) ||
        Boolean(d.accommodation?.bookingReference),
    )
  ) {
    lines.push('Références de réservation des trajets et hébergements')
  }

  if (
    has((d) => Boolean(d.images?.length || d.accommodation?.images?.length))
  ) {
    lines.push('Photos des étapes, gardées pour le hors-ligne')
  }

  return lines
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/**
 * Période du voyage, au plus court : « 10 → 29 mai 2026 »,
 * « 28 avril → 3 mai 2026 », « 28 déc. 2026 → 3 janv. 2027 ».
 */
export function formatTripRange(startIso: string, endIso: string): string {
  const start = parseDayDate(startIso)
  const end = parseDayDate(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''

  const full = (date: Date) =>
    date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  if (start.getTime() === end.getTime()) return full(start)

  if (start.getFullYear() !== end.getFullYear()) {
    const short = (date: Date) =>
      date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    return `${short(start)} → ${short(end)}`
  }
  if (start.getMonth() !== end.getMonth()) {
    const dayMonth = start.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    })
    return `${dayMonth} → ${full(end)}`
  }
  return `${start.getDate()} → ${full(end)}`
}
