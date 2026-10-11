/**
 * Mise en forme du résultat d'une génération pour l'écran « Votre itinéraire
 * est prêt » : points à vérifier, regroupement par ville, dates lisibles.
 *
 * Fonctions pures : l'écran ne fait que les afficher, les tests les vérifient.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import { addDays, type QualityReport } from '@/lib/generator/itinerary-quality'

/** Un point à vérifier, tel qu'il s'affiche dans la carte orange. */
export interface ReviewPoint {
  id: string
  /** Début en gras : « Jour 5 · Hakone », « 3 activités »… */
  heading: string
  /** Le reste de la ligne, toujours visible. */
  summary: string
  /** Détail déplié au toucher : un message par défaut relevé. */
  details: string[]
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

/**
 * Les points à vérifier, du plus grave au plus anodin.
 *
 * Le rapport de qualité relève chaque défaut un par un : sur un long voyage,
 * les durées non estimées se comptent par dizaines et noieraient l'essentiel.
 * Les défauts de fond sont donc regroupés par journée, et les détails
 * d'agrément (coordonnées, durées) réunis en une seule ligne chacun.
 */
export function reviewPoints(
  report: QualityReport,
  days: readonly DayItinerary[],
  {
    truncated = false,
    droppedDays = 0,
    expectedDays,
  }: { truncated?: boolean; droppedDays?: number; expectedDays?: number } = {},
): ReviewPoint[] {
  const points: ReviewPoint[] = []

  if (truncated) {
    points.push({
      id: 'truncated',
      heading: 'Génération incomplète :',
      summary:
        expectedDays && expectedDays > days.length
          ? `${plural(days.length, 'jour')} sur ${expectedDays} ont été écrits`
          : 'la réponse s’est arrêtée avant la fin',
      details: [
        'Relancez la génération pour obtenir le voyage complet, ou enregistrez ces journées et complétez-les à la main.',
      ],
    })
  }
  if (droppedDays > 0) {
    points.push({
      id: 'dropped',
      heading: `${plural(droppedDays, 'journée')} écartée${droppedDays > 1 ? 's' : ''} :`,
      summary: 'mal formée par le modèle',
      details: [
        'Ces journées ne respectaient pas le format attendu. Les dates des suivantes ont été recalées.',
      ],
    })
  }

  const blockingByDay = new Map<number, string[]>()
  const dayCoordinates: string[] = []
  const activityDetails: string[] = []
  for (const issue of report.issues) {
    if (issue.blocking && issue.dayNumber !== undefined) {
      const known = blockingByDay.get(issue.dayNumber) ?? []
      blockingByDay.set(issue.dayNumber, [...known, issue.message])
    } else if (issue.field === 'coordinates') {
      dayCoordinates.push(
        issue.dayNumber
          ? `Jour ${issue.dayNumber} : ${issue.message}`
          : issue.message,
      )
    } else if (issue.field.startsWith('activities[')) {
      activityDetails.push(
        issue.dayNumber
          ? `Jour ${issue.dayNumber} : ${issue.message}`
          : issue.message,
      )
    }
  }

  for (const [dayNumber, messages] of [...blockingByDay].sort(
    ([a], [b]) => a - b,
  )) {
    const city = days[dayNumber - 1]?.city?.trim()
    points.push({
      id: `day-${dayNumber}`,
      heading: `Jour ${dayNumber}${city ? ` · ${city}` : ''} :`,
      summary: lowerFirst(messages[0]),
      details: messages,
    })
  }

  if (dayCoordinates.length > 0) {
    points.push({
      id: 'day-coordinates',
      heading: `${plural(dayCoordinates.length, 'journée')} hors carte :`,
      summary: 'coordonnées de la ville manquantes',
      details: dayCoordinates,
    })
  }
  if (activityDetails.length > 0) {
    const count = new Set(
      report.issues
        .filter((issue) => issue.field.startsWith('activities['))
        .map((issue) => `${issue.dayNumber}-${issue.field.split('.')[0]}`),
    ).size
    points.push({
      id: 'activities',
      heading: `${plural(count, 'activité')} à préciser :`,
      summary: 'durée ou position estimée',
      details: activityDetails,
    })
  }

  return points
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** Confiance sur cinq barres, pour la jauge de la carte. */
export function confidenceBars(confidence: number): number {
  return Math.max(0, Math.min(5, Math.round(confidence / 20)))
}

/** Une étape du voyage : des journées consécutives dans la même ville. */
export interface CityStop {
  city: string
  /** Index (0-based) des journées de l'étape, dans l'ordre. */
  dayIndexes: number[]
}

/**
 * Regroupe les journées consécutives passées dans la même ville. Une ville
 * quittée puis retrouvée forme deux étapes : c'est l'ordre du voyage qui
 * compte, pas l'inventaire des villes.
 */
export function groupByCity(days: readonly DayItinerary[]): CityStop[] {
  const stops: CityStop[] = []
  days.forEach((day, index) => {
    const city = day.city?.trim() || 'Ville à compléter'
    const last = stops[stops.length - 1]
    if (last && last.city === city) last.dayIndexes.push(index)
    else stops.push({ city, dayIndexes: [index] })
  })
  return stops
}

/** « J1–J4 » ou « J5 ». */
export function dayRangeLabel(dayIndexes: readonly number[]): string {
  const first = dayIndexes[0] + 1
  const last = dayIndexes[dayIndexes.length - 1] + 1
  return first === last ? `J${first}` : `J${first}–J${last}`
}

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/**
 * « 12 → 25 avril 2027 », « 28 avril → 3 mai 2027 », « 30 déc. 2026 → 4 janv.
 * 2027 » : l'année et le mois ne sont répétés que s'ils changent.
 */
export function formatTripRange(startDate: string, dayCount: number): string {
  const start = parseIso(startDate)
  if (Number.isNaN(start.getTime()) || dayCount < 1) return ''
  const end = parseIso(addDays(startDate, dayCount - 1))
  const full: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }
  const endLabel = end.toLocaleDateString('fr-FR', full)
  if (dayCount === 1) return endLabel
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const startLabel = sameMonth
    ? String(start.getDate())
    : start.toLocaleDateString(
        'fr-FR',
        sameYear ? { day: 'numeric', month: 'long' } : full,
      )
  return `${startLabel} → ${endLabel}`
}

/** « 12 avr. 2027 », pour les champs de date. */
export function formatShortDate(iso: string): string {
  const date = parseIso(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Jour du mois, pour la colonne « J1 · 12 ». */
export function dayOfMonth(iso: string): string {
  const date = parseIso(iso)
  return Number.isNaN(date.getTime()) ? '' : String(date.getDate())
}
