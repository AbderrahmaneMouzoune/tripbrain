/**
 * Import d'un programme existant : le voyageur a déjà son voyage ailleurs
 * (PDF d'agence, réponse de ChatGPT, notes, tableur) et veut le retrouver ici
 * sans le ressaisir.
 *
 * Ce module porte ce que l'app et la route `/api/generate/import` partagent :
 * la forme de la requête, la lecture de la réponse, et le relevé de ce qui
 * manquait dans le document d'origine. Fonctions pures, sans accès réseau.
 *
 * La règle du parcours : rien n'est inventé. Le modèle recopie ; ce qui n'était
 * pas dans le programme reste vide, et c'est `importGaps` — un contrôle du
 * résultat, pas une déclaration du modèle — qui le signale au voyageur.
 */

import { z } from 'zod'
import type { DayItinerary } from '@/lib/itinerary-data'
import { parseAiJson } from '@/lib/generator/itinerary-json'
import {
  addDays,
  isValidIsoDate,
  todayIso,
} from '@/lib/generator/itinerary-quality'
import {
  parseGeneratedItinerary,
  type GeneratedDay,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import {
  dayRangeLabel,
  formatShortDate,
  type ReviewPoint,
} from '@/lib/generator/review'

// ── Bornes ───────────────────────────────────────────────────────────────────

/** En dessous, il n'y a pas de quoi faire une journée. */
export const MIN_PROGRAM_TEXT_LENGTH = 30
/**
 * Un mois de voyage détaillé tient en vingt à trente mille caractères. Au-delà
 * le texte est coupé côté app, et la route refuse : chaque caractère est
 * facturé à la lecture.
 */
export const MAX_PROGRAM_TEXT_LENGTH = 40_000
/**
 * Taille maximale d'un fichier. Un PDF part tel quel au serveur, encodé en
 * base64 (un tiers de plus) dans une requête que l'hébergement plafonne à
 * 4,5 Mo.
 */
export const MAX_PROGRAM_FILE_BYTES = 3 * 1024 * 1024
/** Longueur maximale du PDF une fois encodé. */
const MAX_PDF_BASE64_LENGTH = Math.ceil(MAX_PROGRAM_FILE_BYTES / 3) * 4
/** Taille maximale du corps de la requête, marge comprise. */
export const MAX_IMPORT_BODY = MAX_PDF_BASE64_LENGTH + 4096
/** Au-delà, les journées en trop sont écartées : deux mois de voyage. */
export const MAX_IMPORT_DAYS = 60

/** Début de tout PDF (« %PDF- ») une fois encodé en base64. */
const PDF_BASE64_MAGIC = 'JVBERi0'

// ── Requête ──────────────────────────────────────────────────────────────────

const MESSAGES = {
  shortText:
    'Ce texte est trop court pour être un programme : collez-le en entier.',
  longText: `Programme trop long : ${MAX_PROGRAM_TEXT_LENGTH.toLocaleString('fr-FR')} caractères au maximum.`,
  notPdf: 'Ce fichier n’est pas un PDF lisible.',
  bigPdf: 'Ce PDF est trop lourd : 3 Mo au maximum.',
  invalidDate: 'Date de départ illisible : attendu AAAA-MM-JJ.',
} as const

const OWN_MESSAGES = new Set<string>(Object.values(MESSAGES))

const programSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z
      .string()
      .trim()
      .min(MIN_PROGRAM_TEXT_LENGTH, MESSAGES.shortText)
      .max(MAX_PROGRAM_TEXT_LENGTH, MESSAGES.longText),
  }),
  z.object({
    kind: z.literal('pdf'),
    /** Le PDF, encodé en base64 sans préfixe `data:`. */
    data: z
      .string()
      .max(MAX_PDF_BASE64_LENGTH, MESSAGES.bigPdf)
      .refine((value) => value.startsWith(PDF_BASE64_MAGIC), MESSAGES.notPdf),
  }),
])

export type ProgramSource = z.infer<typeof programSourceSchema>

export const importRequestSchema = z.object({
  mode: z.literal('import'),
  source: programSourceSchema,
  /**
   * Date de départ donnée par le voyageur, pour un programme sans dates. Une
   * date passée est acceptée : on importe aussi un voyage déjà fait.
   */
  startDate: z.string().refine(isValidIsoDate, MESSAGES.invalidDate).optional(),
  /** Nom du fichier d'origine, pour l'écran seulement : jamais envoyé au modèle. */
  fileName: z.string().max(200).optional(),
})

export type ImportRequest = z.infer<typeof importRequestSchema>

/** Premier message lisible d'une requête d'import refusée. */
export function importIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue && OWN_MESSAGES.has(issue.message)
    ? issue.message
    : 'Requête invalide.'
}

// ── Lecture de la réponse ────────────────────────────────────────────────────

export interface ImportedResult {
  /** L'itinéraire recopié, ou `null` quand la réponse était inexploitable. */
  itinerary: GeneratedItinerary | null
  droppedDays: number
  truncated: boolean
  /** Vrai quand le modèle dit que le document n'est pas un programme de voyage. */
  notAProgram: boolean
  /**
   * Vrai quand le programme ne portait pas de dates et que le voyageur n'en a
   * pas donné : le voyage commence alors aujourd'hui, faute de mieux.
   */
  datesAssumed: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Lit la réponse du modèle à un import.
 *
 * Les dates suivent cet ordre de confiance : celles du programme (le modèle
 * les recopie et le dit avec `datesFound`), puis la date de départ saisie par
 * le voyageur, puis aujourd'hui. Dans tous les cas les journées sortent d'ici
 * consécutives à partir de la première : le modèle a pour consigne d'écrire
 * une entrée par jour calendaire, et un calendrier à trous casserait le
 * roadbook comme l'affinage.
 */
export function readImportedItinerary(
  text: string,
  {
    startDate,
    today = todayIso(),
  }: { startDate?: string; today?: string } = {},
): ImportedResult {
  const empty: ImportedResult = {
    itinerary: null,
    droppedDays: 0,
    truncated: false,
    notAProgram: false,
    datesAssumed: false,
  }

  let parsed: ReturnType<typeof parseAiJson>
  try {
    parsed = parseAiJson(text)
  } catch {
    return empty
  }
  const { value, truncated } = parsed

  if (isRecord(value) && value.error === 'not_a_program') {
    return { ...empty, notAProgram: true }
  }

  const result = parseGeneratedItinerary(value, { truncated })
  if (!result.itinerary) {
    return { ...empty, droppedDays: result.droppedDays, truncated }
  }

  const kept = result.itinerary.days.slice(0, MAX_IMPORT_DAYS)
  const firstDate = kept[0]?.date
  const datesFound =
    isRecord(value) && value.datesFound === true && isValidIsoDate(firstDate)
  const start = datesFound
    ? firstDate
    : startDate && isValidIsoDate(startDate)
      ? startDate
      : today

  const dated = kept.map((day, index) => ({
    ...day,
    date: addDays(start, index),
  }))

  return {
    itinerary: { ...result.itinerary, days: alignStays(dated) },
    droppedDays:
      result.droppedDays + (result.itinerary.days.length - kept.length),
    truncated,
    notAProgram: false,
    datesAssumed: !datesFound && !(startDate && isValidIsoDate(startDate)),
  }
}

/**
 * Cale les dates d'hébergement sur le calendrier retenu : des nuits
 * consécutives dans le même établissement forment un seul séjour, de la
 * première journée au lendemain de la dernière. Une date d'hôtel recopiée
 * d'un autre calendrier contredirait la journée qui la porte.
 */
function alignStays(days: GeneratedDay[]): GeneratedDay[] {
  const stayKey = (day: GeneratedDay | undefined) =>
    day?.accommodation?.name.trim().toLowerCase()
  return days.map((day, index) => {
    if (!day.accommodation) return day
    const key = stayKey(day)
    let first = index
    while (first > 0 && stayKey(days[first - 1]) === key) first -= 1
    let last = index
    while (last < days.length - 1 && stayKey(days[last + 1]) === key) last += 1
    return {
      ...day,
      accommodation: {
        ...day.accommodation,
        checkIn: days[first].date,
        checkOut: addDays(days[last].date, 1),
      },
    }
  })
}

// ── Ce qui manquait dans le programme ────────────────────────────────────────

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

function hasCoordinates(value: [number, number] | undefined): boolean {
  return Boolean(value && (value[0] !== 0 || value[1] !== 0))
}

/** « J4 à J7, J9 » : les suites de journées, regroupées. */
function dayRanges(indexes: readonly number[]): string {
  const groups: number[][] = []
  for (const index of indexes) {
    const last = groups[groups.length - 1]
    if (last && last[last.length - 1] === index - 1) last.push(index)
    else groups.push([index])
  }
  return groups
    .map((group) => dayRangeLabel(group).replace('–', ' à '))
    .join(', ')
}

/**
 * Ce que le programme d'origine ne disait pas, du plus gênant sur place au
 * plus anodin. Chaque point se complète ensuite dans le mode édition : rien
 * n'empêche d'enregistrer.
 */
export function importGaps(
  days: readonly DayItinerary[],
  {
    datesAssumed = false,
    truncated = false,
    droppedDays = 0,
  }: { datesAssumed?: boolean; truncated?: boolean; droppedDays?: number } = {},
): ReviewPoint[] {
  const points: ReviewPoint[] = []

  if (truncated) {
    points.push({
      id: 'truncated',
      heading: 'Lecture incomplète :',
      summary: `le programme s’arrête au jour ${days.length}`,
      details: [
        'Le document était trop long pour être lu d’une traite. Relancez la lecture, ou importez la suite à part.',
      ],
    })
  }
  if (droppedDays > 0) {
    points.push({
      id: 'dropped',
      heading: `${plural(droppedDays, 'journée')} non reprise${droppedDays > 1 ? 's' : ''} :`,
      summary: 'illisibles dans le document',
      details: [
        'Ces journées n’ont pas pu être recopiées. Ajoutez-les à la main dans le mode édition.',
      ],
    })
  }

  if (datesAssumed && days[0]) {
    points.push({
      id: 'dates',
      heading: 'Dates absentes :',
      summary: `le voyage commence le ${formatShortDate(days[0].date)} par défaut`,
      details: [
        'Votre programme ne donnait pas de dates. Revenez en arrière pour indiquer la date de départ, ou corrigez-la après l’enregistrement.',
      ],
    })
  }

  const emptyDays = days.flatMap((day, index) =>
    day.activities.length === 0 && !day.transport ? [index] : [],
  )
  if (emptyDays.length > 0) {
    points.push({
      id: 'empty-days',
      heading: `${plural(emptyDays.length, 'journée')} vide${emptyDays.length > 1 ? 's' : ''} :`,
      summary: `${dayRanges(emptyDays)} sans activité`,
      details: emptyDays.map(
        (index) =>
          `Jour ${index + 1}${days[index].city ? ` · ${days[index].city}` : ''} : rien n’était prévu dans le programme.`,
      ),
    })
  }

  // La dernière journée est celle du retour : pas de nuit à prévoir.
  const nightsWithout = days
    .slice(0, -1)
    .flatMap((day, index) => (day.accommodation ? [] : [index]))
  if (nightsWithout.length > 0) {
    points.push({
      id: 'lodging',
      heading: 'Hébergement :',
      summary: `manquant pour ${plural(nightsWithout.length, 'nuit')} (${dayRanges(nightsWithout)})`,
      details: nightsWithout.map(
        (index) =>
          `Nuit du jour ${index + 1}${days[index].city ? ` · ${days[index].city}` : ''} : aucun hébergement dans le programme.`,
      ),
    })
  }

  const untimed = days.flatMap((day, index) =>
    // Une heure d'arrivée seule (« arrivée 10h40 ») suffit à s'organiser.
    day.transport &&
    !day.transport.departureTime?.trim() &&
    !day.transport.arrivalTime?.trim()
      ? [
          `Jour ${index + 1} : ${day.transport.from} → ${day.transport.to}, aucune heure dans le programme.`,
        ]
      : [],
  )
  if (untimed.length > 0) {
    points.push({
      id: 'transport-times',
      heading: 'Horaires :',
      summary: `${plural(untimed.length, 'trajet')} sans horaire`,
      details: untimed,
    })
  }

  const noCity = days.flatMap((day, index) => (day.city?.trim() ? [] : [index]))
  if (noCity.length > 0) {
    points.push({
      id: 'cities',
      heading: 'Ville :',
      summary: `non précisée pour ${dayRanges(noCity)}`,
      details: ['Le programme ne disait pas où se passent ces journées.'],
    })
  }

  const offMap = days.flatMap((day, index) =>
    day.city?.trim() && !hasCoordinates(day.coordinates) ? [index] : [],
  )
  if (offMap.length > 0) {
    points.push({
      id: 'day-coordinates',
      heading: `${plural(offMap.length, 'journée')} hors carte :`,
      summary: 'lieu non reconnu',
      details: offMap.map(
        (index) =>
          `Jour ${index + 1} · ${days[index].city} : ce lieu n’a pas pu être placé sur la carte.`,
      ),
    })
  }

  return points
}

/** « 7 jours, 23 activités, 2 trajets » : ce qui a été repris du programme. */
export function importSummary(days: readonly DayItinerary[]): string {
  const activities = days.reduce((sum, day) => sum + day.activities.length, 0)
  const transfers = days.filter((day) => day.transport).length
  const nights = days.filter((day) => day.accommodation).length
  return [
    plural(days.length, 'jour'),
    plural(activities, 'activité'),
    transfers > 0 ? plural(transfers, 'trajet') : '',
    nights > 0 ? `${plural(nights, 'nuit')} d’hébergement` : '',
  ]
    .filter(Boolean)
    .join(', ')
}
