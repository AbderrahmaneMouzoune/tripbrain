import type { DayItinerary } from '@/lib/itinerary-data'

/**
 * Contrôle qualité d'un itinéraire généré, avant de l'enregistrer.
 *
 * Porté du générateur du site vitrine ; il travaille ici directement sur le
 * modèle de l'app (`DayItinerary`), puisque la conversion a lieu avant.
 *
 * Un modèle de langage remplit volontiers les champs qu'il ignore : dates
 * plausibles mais fausses (souvent dans le passé, l'année d'entraînement),
 * coordonnées approximatives, titres inventés. On ne peut pas empêcher ça à
 * la source, alors on le mesure ici : chaque défaut devient un avertissement
 * visible, et l'ensemble donne un indice de confiance.
 */

export type IssueKind = 'missing' | 'invalid' | 'estimated' | 'generated'

export interface QualityIssue {
  /** Jour concerné, absent si l'avertissement porte sur le voyage entier. */
  dayNumber?: number
  /** Libellé du champ, tel qu'il apparaît dans le fichier. */
  field: string
  kind: IssueKind
  message: string
  /**
   * Défaut de fond : la journée arrivera amputée dans l'app. On le signale
   * fort et on y conduit, mais on n'interdit rien — le fichier appartient au
   * visiteur, et une journée sans activité reste préférable à un export perdu.
   */
  blocking: boolean
}

export interface QualityReport {
  /** Indice de confiance de 0 à 100. */
  confidence: number
  issues: QualityIssue[]
  /** Vrai tant qu'un champ requis manque. Pèse sur l'indice, ne bloque rien. */
  hasBlockingIssues: boolean
  stats: {
    days: number
    activities: number
    cities: string[]
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formate une date en AAAA-MM-JJ dans le fuseau local.
 *
 * `toISOString()` convertit d'abord en UTC : à l'est de Greenwich, minuit
 * local tombe la veille en UTC et la date recule d'un jour. Ces dates sont
 * civiles (« le 23 septembre »), pas des instants — elles ne doivent jamais
 * passer par UTC.
 */
function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidIsoDate(value: string | undefined): boolean {
  if (!value || !ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  // Le second test rejette les dates impossibles que JavaScript reporte
  // silencieusement, comme le 31 février devenu 3 mars.
  return !isNaN(date.getTime()) && toIsoDate(date) === value
}

/** Aujourd'hui à minuit, pour comparer des dates sans se soucier de l'heure. */
function today(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

export function isPastDate(value: string): boolean {
  return new Date(`${value}T00:00:00`) < today()
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function todayIso(): string {
  return toIsoDate(today())
}

/**
 * Réaligne les dates du voyage sur `startDate`, un jour par journée. Utilisé
 * quand le modèle a produit des dates passées ou incohérentes : l'ordre des
 * journées est fiable, les dates ne le sont pas.
 */
export function realignDates(
  days: DayItinerary[],
  startDate: string,
): DayItinerary[] {
  return days.map((day, index) => ({
    ...day,
    date: addDays(startDate, index),
    dayNumber: index + 1,
  }))
}

/** Coordonnées absentes ou laissées à l'origine du repère. */
function hasCoordinates(coords: [number, number] | undefined): boolean {
  return Boolean(coords && (coords[0] !== 0 || coords[1] !== 0))
}

/**
 * Poids relatif de chaque défaut dans l'indice de confiance. Un champ requis
 * manquant coûte plus cher qu'un détail d'agrément.
 */
const BLOCKING_CEILING = 50

const PENALTY: Record<IssueKind, number> = {
  missing: 12,
  invalid: 12,
  estimated: 4,
  generated: 3,
}

export function analyzeItinerary(days: DayItinerary[]): QualityReport {
  const issues: QualityIssue[] = []

  if (days.length === 0) {
    return {
      confidence: 0,
      issues: [
        {
          field: 'itinerary',
          kind: 'missing',
          message: 'Aucune journée dans l’itinéraire.',
          blocking: true,
        },
      ],
      hasBlockingIssues: true,
      stats: { days: 0, activities: 0, cities: [] },
    }
  }

  let previousDate: string | undefined

  days.forEach((day, index) => {
    const dayNumber = day.dayNumber ?? index + 1

    // ── Date : le champ le plus souvent inventé, et le plus structurant ──
    if (!day.date) {
      issues.push({
        dayNumber,
        field: 'date',
        kind: 'missing',
        message: 'Date absente : renseignez-la avant d’enregistrer.',
        blocking: true,
      })
    } else if (!isValidIsoDate(day.date)) {
      issues.push({
        dayNumber,
        field: 'date',
        kind: 'invalid',
        message: `Date « ${day.date} » illisible : attendu AAAA-MM-JJ.`,
        blocking: true,
      })
    } else {
      if (isPastDate(day.date)) {
        issues.push({
          dayNumber,
          field: 'date',
          kind: 'invalid',
          message: `Date dans le passé (${day.date}) : l’IA l’a probablement inventée.`,
          blocking: true,
        })
      }
      if (previousDate && day.date <= previousDate) {
        issues.push({
          dayNumber,
          field: 'date',
          kind: 'invalid',
          message: `Date non consécutive : ${day.date} ne suit pas ${previousDate}.`,
          blocking: true,
        })
      }
      previousDate = day.date
    }

    // ── Autres champs requis ──
    if (!day.city?.trim()) {
      issues.push({
        dayNumber,
        field: 'city',
        kind: 'missing',
        message: 'Ville absente.',
        blocking: true,
      })
    }
    if (!day.title?.trim()) {
      issues.push({
        dayNumber,
        field: 'title',
        kind: 'missing',
        message: 'Titre de la journée absent.',
        blocking: true,
      })
    }
    if (!day.activities || day.activities.length === 0) {
      issues.push({
        dayNumber,
        field: 'activities',
        kind: 'missing',
        message: 'Aucune activité prévue ce jour-là : ajoutez-en une.',
        blocking: true,
      })
    }

    // ── Champs utiles mais non bloquants ──
    if (!hasCoordinates(day.coordinates)) {
      issues.push({
        dayNumber,
        field: 'coordinates',
        kind: 'estimated',
        message: `Coordonnées manquantes${day.city ? ` pour ${day.city}` : ''} : le point n’apparaîtra pas sur la carte.`,
        blocking: false,
      })
    }

    day.activities?.forEach((activity, activityIndex) => {
      if (!activity.name?.trim()) {
        issues.push({
          dayNumber,
          field: `activities[${activityIndex}].name`,
          kind: 'missing',
          message: `Activité ${activityIndex + 1} sans nom.`,
          blocking: true,
        })
      }
      if (!hasCoordinates(activity.coordinates)) {
        issues.push({
          dayNumber,
          field: `activities[${activityIndex}].coordinates`,
          kind: 'estimated',
          message: `« ${activity.name || `Activité ${activityIndex + 1}`} » sans coordonnées.`,
          blocking: false,
        })
      }
      if (!activity.duration?.trim()) {
        issues.push({
          dayNumber,
          field: `activities[${activityIndex}].duration`,
          kind: 'estimated',
          message: `Durée non estimée pour « ${activity.name || `Activité ${activityIndex + 1}`} ».`,
          blocking: false,
        })
      }
    })
  })

  // ── Indice de confiance ──
  // Base 100, moins le coût des défauts, ramené au nombre de journées pour
  // qu'un long voyage ne soit pas pénalisé deux fois plus qu'un court.
  const penalty = issues.reduce((sum, issue) => sum + PENALTY[issue.kind], 0)
  const hasBlockingIssues = issues.some((issue) => issue.blocking)
  const raw = Math.max(
    0,
    Math.min(100, Math.round(100 - penalty / days.length)),
  )
  // Un fichier incomplet ne doit jamais s'afficher comme sûr : tant qu'un
  // champ requis manque, la confiance reste sous le seuil « à vérifier ».
  const confidence = hasBlockingIssues ? Math.min(raw, BLOCKING_CEILING) : raw

  return {
    confidence,
    issues,
    hasBlockingIssues,
    stats: {
      days: days.length,
      activities: days.reduce(
        (sum, day) => sum + (day.activities?.length ?? 0),
        0,
      ),
      cities: [...new Set(days.map((day) => day.city).filter(Boolean))],
    },
  }
}

/**
 * Étiquette courte d'un défaut, pour une puce de navigation. Le message
 * complet reste dans l'indice de confiance : ici il faut trois mots.
 */
function shortLabel(issue: QualityIssue): string {
  if (issue.field.endsWith('.name')) return 'activité sans nom'
  switch (issue.field) {
    case 'date':
      return 'date à revoir'
    case 'city':
      return 'ville manquante'
    case 'title':
      return 'titre manquant'
    case 'activities':
      return 'aucune activité'
    default:
      return 'à compléter'
  }
}

export interface DayAttention {
  dayNumber: number
  /** Ce qui manque, en trois mots. */
  label: string
  /** Nombre de défauts sur la journée, pour dire « et 2 autres ». */
  count: number
}

/**
 * Les journées à reprendre, prêtes à devenir des raccourcis.
 *
 * Sur trois jours, « corrige les champs en rouge » se suffit à lui-même. Sur
 * vingt, c'est une chasse au trésor : l'aperçu n'affiche qu'une journée à la
 * fois, et rien ne dit laquelle regarder. Il faut nommer les journées et
 * pouvoir sauter dessus.
 */
export function daysNeedingAttention(report: QualityReport): DayAttention[] {
  const byDay = new Map<number, QualityIssue[]>()

  for (const issue of report.issues) {
    if (!issue.blocking || issue.dayNumber === undefined) continue
    const known = byDay.get(issue.dayNumber)
    if (known) known.push(issue)
    else byDay.set(issue.dayNumber, [issue])
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayNumber, issues]) => ({
      dayNumber,
      label: shortLabel(issues[0]),
      count: issues.length,
    }))
}

/** Palier d'affichage de l'indice de confiance. */
export function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 80) return 'high'
  if (confidence >= 55) return 'medium'
  return 'low'
}
