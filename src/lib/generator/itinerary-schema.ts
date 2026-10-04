import { z } from 'zod'
import type { Activity, DayItinerary, Transport } from '@/lib/itinerary-data'

/**
 * Schémas de l'itinéraire produit par le modèle à partir du prompt du
 * générateur, et conversion vers le modèle de l'app (`DayItinerary`).
 *
 * Porté du générateur du site vitrine (`tripbrain-landing`), où le visiteur
 * collait la réponse de ChatGPT ou de Claude. Ici la réponse arrive
 * directement de l'API, mais elle reste écrite par un modèle : la même
 * tolérance s'applique. `generatedItinerarySchema` valide la réponse ;
 * `toDayItineraries` produit les journées telles que l'app les stocke — le
 * site, lui, passait par un export `{ itinerary }` transmis dans l'URL.
 *
 * Le schéma dit si la réponse est un itinéraire, pas s'il est complet. Un
 * modèle omet volontiers un champ — les activités d'une journée de trajet, où
 * la route *est* le programme, les coordonnées d'une ville — et refuser tout
 * le voyage pour une journée lacunaire fait perdre les autres, valides. Les
 * champs qui ont un repli sont donc acceptés vides ici, puis signalés par
 * `analyzeItinerary` : ils pèsent sur l'indice de confiance et apparaissent
 * dans les « points à vérifier » du résultat.
 */

// ── Itinéraire généré ────────────────────────────────────────────────────────

const coordinatesSchema = z
  .object({
    lat: z.number().describe('Latitude en degrés décimaux'),
    lng: z.number().describe('Longitude en degrés décimaux'),
  })
  .describe('Coordonnées GPS approximatives')

const generatedActivitySchema = z.object({
  name: z.string().describe("Nom de l'activité ou du lieu"),
  description: z
    .string()
    .optional()
    .describe('Une ou deux phrases sur ce qui rend ce lieu intéressant'),
  type: z
    .enum(['visit', 'food', 'experience', 'shopping', 'transport'])
    .describe("Type d'activité"),
  duration: z.string().optional().describe('Durée estimée, ex. "1h30" ou "2h"'),
  address: z.string().optional().describe('Adresse ou quartier'),
  coordinates: coordinatesSchema.optional(),
  openAt: z
    .string()
    .optional()
    .describe('Horaires d’ouverture indicatifs, ex. "09:00–18:00"'),
  price: z.number().optional().describe('Prix indicatif par personne'),
  currency: z.string().optional().describe('Devise du prix, ex. "EUR"'),
  reservationRequired: z
    .boolean()
    .optional()
    .describe('Vrai si une réservation à l’avance est recommandée'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Étiquettes courtes, ex. ["musée", "incontournable"]'),
  tips: z
    .string()
    .optional()
    .describe('Conseil pratique pour profiter au mieux de cette activité'),
})

const generatedTransportSchema = z.object({
  type: z.enum(['train', 'car', 'plane', 'bus']).describe('Moyen de transport'),
  from: z.string().describe('Ville ou lieu de départ'),
  to: z.string().describe("Ville ou lieu d'arrivée"),
  details: z
    .string()
    .optional()
    .describe('Détails utiles : ligne, compagnie, fréquence…'),
  departureTime: z
    .string()
    .optional()
    .describe('Heure de départ indicative, ex. "09:15"'),
  arrivalTime: z.string().optional().describe("Heure d'arrivée indicative"),
  duration: z.string().optional().describe('Durée du trajet, ex. "2h10"'),
})

export const generatedDaySchema = z.object({
  date: z.string().describe('Date du jour au format ISO 8601 (YYYY-MM-DD)'),
  city: z.string().describe('Ville principale de la journée'),
  title: z
    .string()
    .describe('Titre court et évocateur de la journée, ex. "Kyoto impérial"'),
  dayType: z
    .enum(['arrival', 'sightseeing', 'travel', 'rest', 'departure'])
    .optional()
    .describe('Nature de la journée'),
  // Absentes, elles retombent sur [0, 0] à la conversion : la journée
  // n'apparaît pas sur la carte, ce que l'indice de confiance signale.
  coordinates: coordinatesSchema
    .optional()
    .describe('Coordonnées GPS de la ville du jour'),
  highlights: z
    .array(z.string())
    .optional()
    .describe('2 à 4 points forts de la journée'),
  foodRecommendations: z
    .array(z.string())
    .optional()
    .describe('Plats ou adresses typiques à essayer ce jour-là'),
  walkingDistance: z
    .string()
    .optional()
    .describe('Distance de marche estimée sur la journée, ex. "7 km"'),
  tips: z
    .array(z.string())
    .optional()
    .describe('Conseils pratiques propres à cette journée'),
  notes: z
    .string()
    .optional()
    .describe('Note libre sur l’esprit de la journée'),
  transport: generatedTransportSchema
    .optional()
    .describe(
      'Trajet inter-villes du jour, uniquement s’il y a un déplacement notable',
    ),
  // Une journée sans activité s'enregistre, mais elle est signalée : c'est une
  // journée à compléter, pas un itinéraire à jeter.
  activities: z
    .array(generatedActivitySchema)
    .default([])
    .describe('3 à 6 activités ordonnées chronologiquement'),
})

export const generatedItinerarySchema = z.object({
  tripTitle: z
    .string()
    .describe(
      'Titre du voyage, ex. "10 jours au Japon entre temples et néons"',
    ),
  summary: z
    .string()
    .describe('Résumé du voyage en 2 ou 3 phrases, adressé au voyageur'),
  days: z
    .array(generatedDaySchema)
    .describe('Un élément par jour de voyage, dans l’ordre chronologique'),
})

export type GeneratedItinerary = z.infer<typeof generatedItinerarySchema>
export type GeneratedDay = z.infer<typeof generatedDaySchema>
export type GeneratedActivity = z.infer<typeof generatedActivitySchema>
export type GeneratedTransport = z.infer<typeof generatedTransportSchema>

// ── Lecture tolérante d'une réponse imparfaite ───────────────────────────────

/** Un défaut relevé à la lecture, tel qu'il part dans le suivi d'erreurs. */
export interface ParseIssue {
  /**
   * Rang de la journée fautive dans la réponse, 1-indexé. Absent quand le
   * défaut porte sur le voyage lui-même.
   */
  dayNumber?: number
  /** Chemin du champ à l'intérieur de la journée, ex. `activities.2.type`. */
  path: string
  /** Code Zod (`invalid_type`, `invalid_enum_value`…), ou `truncated_stub`. */
  code: string
  message: string
}

export interface ParsedGeneratedItinerary {
  /** L'itinéraire retenu, ou `null` quand rien n'était exploitable. */
  itinerary: GeneratedItinerary | null
  /** Journées écartées : mal formées, ou moignon d'une réponse coupée. */
  droppedDays: number
  /** Pourquoi elles l'ont été. Vide quand tout est passé. */
  issues: ParseIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toIssues(error: z.ZodError, dayNumber?: number): ParseIssue[] {
  return error.issues.map((issue) => ({
    dayNumber,
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }))
}

/**
 * Valide l'itinéraire généré, journée par journée.
 *
 * Une seule journée mal formée — un type d'activité inventé, une coordonnée en
 * toutes lettres — ne doit pas emporter les autres : le voyage est validé
 * d'abord, puis chaque journée pour elle-même, et celles qui échouent sont
 * écartées là où elles sont. Retirer par la fin, comme on le faisait, perdait
 * aussi tout ce qui suivait le trou.
 *
 * La position ne compte que pour une réponse coupée par la limite de longueur
 * du modèle : sa dernière journée est un moignon, refermé mécaniquement par
 * `parseAiJson`, qui passe la validation sans avoir la moindre activité.
 * Celle-là s'écarte parce qu'elle est en fin de liste — une journée sans
 * activité au milieu est sincère, on la garde et l'indice de confiance la
 * signale.
 *
 * `itinerary` vaut `null` quand il ne reste rien : ce n'était pas un
 * itinéraire, ou aucune journée n'a survécu. `issues` dit pourquoi dans les
 * deux cas, sans jamais recopier le contenu du voyage.
 */
export function parseGeneratedItinerary(
  value: unknown,
  { truncated = false }: { truncated?: boolean } = {},
): ParsedGeneratedItinerary {
  if (!isRecord(value) || !Array.isArray(value.days)) {
    return {
      itinerary: null,
      droppedDays: 0,
      issues: [
        {
          path: 'days',
          code: 'invalid_type',
          message: 'Objet sans tableau « days ».',
        },
      ],
    }
  }

  // Le voyage lui-même : titre et résumé. Sans eux, aucune journée valide ne
  // rattrapera la réponse.
  const trip = generatedItinerarySchema.safeParse({ ...value, days: [] })
  if (!trip.success) {
    return {
      itinerary: null,
      droppedDays: value.days.length,
      issues: toIssues(trip.error),
    }
  }

  const issues: ParseIssue[] = []
  const kept: { rank: number; day: GeneratedDay }[] = []

  value.days.forEach((day, index) => {
    const parsed = generatedDaySchema.safeParse(day)
    if (parsed.success) kept.push({ rank: index + 1, day: parsed.data })
    else issues.push(...toIssues(parsed.error, index + 1))
  })

  if (truncated) {
    while (
      kept.length > 0 &&
      kept[kept.length - 1].day.activities.length === 0
    ) {
      const stub = kept.pop()
      issues.push({
        dayNumber: stub?.rank,
        path: 'activities',
        code: 'truncated_stub',
        message:
          'Journée refermée par la coupure de la réponse, sans activité.',
      })
    }
  }

  const days = kept.map((entry) => entry.day)

  return {
    itinerary: days.length > 0 ? { ...trip.data, days } : null,
    droppedDays: value.days.length - days.length,
    issues,
  }
}

// ── Conversion vers le modèle de l'app ───────────────────────────────────────

function toCoords(
  c: { lat: number; lng: number } | undefined,
): [number, number] | undefined {
  return c ? [c.lat, c.lng] : undefined
}

/**
 * Retire les clés laissées à `undefined` : tout ce que le modèle n'a pas
 * fourni. Les garder ne change rien à la lecture, mais IndexedDB, le partage
 * (msgpack) et le comparateur avant/après traîneraient des cases vides.
 */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

/**
 * Convertit l'itinéraire généré en journées de l'app. Les identifiants sont
 * générés ici, de façon déterministe (`day-1`, `act-1-2`…), plutôt que
 * demandés au modèle : deux versions d'un même voyage — avant et après
 * « Affiner » — se comparent ainsi journée par journée.
 *
 * Même conversion que `toTripbrainExport` sur le site vitrine, dont le
 * résultat est relu par l'app à travers le partage (`share.ts`) : un voyage
 * généré ici ou là-bas arrive identique dans l'app.
 */
export function toDayItineraries(
  generated: GeneratedItinerary,
): DayItinerary[] {
  return generated.days.map((day, dayIndex) => {
    const activities: Activity[] = day.activities.map(
      (activity, activityIndex) =>
        compact<Activity>({
          id: `act-${dayIndex + 1}-${activityIndex + 1}`,
          name: activity.name,
          description: activity.description,
          type: activity.type,
          duration: activity.duration,
          coordinates: toCoords(activity.coordinates),
          openAt: activity.openAt,
          address: activity.address,
          reservationRequired: activity.reservationRequired,
          price: activity.price,
          currency: activity.currency,
          tags: activity.tags,
          status: 'planned',
          tips: activity.tips,
          source: 'ai',
        }),
    )

    const transport: Transport | undefined = day.transport
      ? compact<Transport>({
          id: `transport-${dayIndex + 1}`,
          type: day.transport.type,
          from: day.transport.from,
          to: day.transport.to,
          details: day.transport.details,
          departureTime: day.transport.departureTime,
          arrivalTime: day.transport.arrivalTime,
          duration: day.transport.duration,
          status: 'planned',
          source: 'ai',
        })
      : undefined

    return compact<DayItinerary>({
      id: `day-${dayIndex + 1}`,
      date: day.date,
      dayNumber: dayIndex + 1,
      city: day.city,
      title: day.title,
      highlights: day.highlights,
      foodRecommendations: day.foodRecommendations,
      walkingDistance: day.walkingDistance,
      notes: day.notes,
      dayType: day.dayType,
      tips: day.tips,
      activities,
      transport,
      // Absentes, elles retombent sur l'origine du repère : la journée
      // n'apparaît pas sur la carte, ce que l'indice de confiance signale.
      coordinates: toCoords(day.coordinates) ?? [0, 0],
      source: 'ai',
    })
  })
}
