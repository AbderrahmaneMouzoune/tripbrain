import { z } from 'zod'
import {
  addDays,
  isPastDate,
  isValidIsoDate,
} from '@/lib/generator/itinerary-quality'
import { generatedItinerarySchema } from '@/lib/generator/itinerary-schema'
import type { TripBrief } from '@/lib/generator/trip-brief'

/**
 * Corps des requêtes du générateur, partagés par l'app (qui les construit) et
 * les routes `/api/generate` (qui les valident).
 *
 * Chaque appel coûte une génération facturée : tout ce qui n'a pas la bonne
 * forme s'arrête ici, avant d'atteindre le modèle. Les bornes de longueur
 * empêchent aussi d'utiliser la route comme un accès gratuit à Claude.
 */

/** Durée d'un voyage, en jours : de quoi couvrir un tour du monde raisonnable. */
export const MIN_DURATION_DAYS = 1
export const MAX_DURATION_DAYS = 30
/** Longueur de la description express. Le champ en affiche le compteur. */
export const MIN_DESCRIPTION_LENGTH = 10
export const MAX_DESCRIPTION_LENGTH = 300
/** Longueur d'une demande d'affinage. */
export const MAX_INSTRUCTION_LENGTH = 300
/** Un champ libre du questionnaire. */
const MAX_FREE_TEXT = 300

/** Messages montrés au voyageur quand sa demande est refusée. */
const MESSAGES = {
  invalidDate: 'Date de départ illisible : attendu AAAA-MM-JJ.',
  pastDate: 'La date de départ est déjà passée.',
  shortDescription: 'Décrivez votre voyage en quelques mots de plus.',
  longDescription: `Description trop longue : ${MAX_DESCRIPTION_LENGTH} caractères au maximum.`,
  shortInstruction: 'Dites en quelques mots ce que vous voulez changer.',
  longInstruction: `Demande trop longue : ${MAX_INSTRUCTION_LENGTH} caractères au maximum.`,
} as const

const OWN_MESSAGES = new Set<string>(Object.values(MESSAGES))

/**
 * Date de départ : une vraie date, pas dans le passé. On tolère la veille
 * parce que le serveur et le téléphone ne sont pas forcément dans le même
 * fuseau : à 0 h 30 à Paris, le serveur peut encore vivre la veille, et
 * inversement à Tokyo.
 */
const startDateSchema = z
  .string()
  .refine(isValidIsoDate, MESSAGES.invalidDate)
  .refine((value) => !isPastDate(addDays(value, 1)), MESSAGES.pastDate)

const durationSchema = z
  .number()
  .int()
  .min(MIN_DURATION_DAYS)
  .max(MAX_DURATION_DAYS)

const freeText = z.string().max(MAX_FREE_TEXT)
const idList = z.array(z.string().max(40)).max(20)
const optionId = z.string().max(40)

/** Le questionnaire, tel que `trip-brief.ts` le décrit. */
export const tripBriefSchema = z.object({
  destination: z.string().trim().min(2).max(MAX_FREE_TEXT),
  origin: freeText,
  durationDays: durationSchema,
  shape: optionId,
  group: optionId,
  adults: z.number().int().min(0).max(30),
  children: z.number().int().min(0).max(30),
  childrenAges: freeText,
  familiarity: optionId,
  pace: optionId,
  dayStart: optionId,
  maxTravelTime: optionId,
  budget: optionId,
  splurges: idList,
  interests: idList,
  mustSee: freeText,
  avoid: freeText,
  occasion: optionId,
  diets: idList,
  mobility: idList,
  transports: idList,
  booked: freeText,
  extra: freeText,
}) satisfies z.ZodType<TripBrief>

export const generateRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('express'),
    description: z
      .string()
      .trim()
      .min(MIN_DESCRIPTION_LENGTH, MESSAGES.shortDescription)
      .max(MAX_DESCRIPTION_LENGTH, MESSAGES.longDescription),
    startDate: startDateSchema,
    durationDays: durationSchema.optional(),
  }),
  z.object({
    mode: z.literal('brief'),
    brief: tripBriefSchema,
    startDate: startDateSchema,
  }),
])

export type GenerateRequest = z.infer<typeof generateRequestSchema>

export const refineRequestSchema = z.object({
  itinerary: generatedItinerarySchema.extend({
    days: generatedItinerarySchema.shape.days.min(1).max(MAX_DURATION_DAYS * 2),
  }),
  instruction: z
    .string()
    .trim()
    .min(3, MESSAGES.shortInstruction)
    .max(MAX_INSTRUCTION_LENGTH, MESSAGES.longInstruction),
  startDate: startDateSchema,
})

export type RefineRequest = z.infer<typeof refineRequestSchema>

/** Nombre de journées attendues : c'est le « N » de « Jour n sur N ». */
export function expectedDays(request: GenerateRequest): number | undefined {
  return request.mode === 'brief'
    ? request.brief.durationDays
    : request.durationDays
}

/** Premier message d'erreur lisible d'une validation ratée. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Requête invalide.'
  // Les messages par défaut de Zod sont en anglais et techniques : on ne
  // montre que les nôtres, écrits pour le voyageur.
  return OWN_MESSAGES.has(issue.message) ? issue.message : 'Requête invalide.'
}
