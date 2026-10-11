import { parseAiJson } from '@/lib/generator/itinerary-json'
import { addDays } from '@/lib/generator/itinerary-quality'
import {
  parseGeneratedItinerary,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'

export interface GeneratedResult {
  /** L'itinéraire retenu, ou `null` quand la réponse était inexploitable. */
  itinerary: GeneratedItinerary | null
  /** Journées écartées : mal formées, ou moignon d'une réponse coupée. */
  droppedDays: number
  /** Vrai quand la réponse s'arrêtait avant la fin et a dû être refermée. */
  truncated: boolean
}

/**
 * Lit la réponse complète du modèle : extraction du JSON, validation journée
 * par journée, puis dates recalées sur le départ choisi.
 *
 * Le recalage n'est pas une précaution de principe : le voyageur a fixé sa
 * date de départ, et l'ordre des journées est fiable là où un modèle invente
 * volontiers une date (souvent dans l'année de son entraînement). Les dates
 * qui sortent d'ici sont donc toujours consécutives à partir de `startDate`.
 */
export function readGeneratedItinerary(
  text: string,
  startDate: string,
): GeneratedResult {
  let parsed: ReturnType<typeof parseAiJson>
  try {
    parsed = parseAiJson(text)
  } catch {
    return { itinerary: null, droppedDays: 0, truncated: false }
  }

  const { itinerary, droppedDays } = parseGeneratedItinerary(parsed.value, {
    truncated: parsed.truncated,
  })
  if (!itinerary) {
    return { itinerary: null, droppedDays, truncated: parsed.truncated }
  }

  return {
    itinerary: {
      ...itinerary,
      days: itinerary.days.map((day, index) => ({
        ...day,
        date: addDays(startDate, index),
      })),
    },
    droppedDays,
    truncated: parsed.truncated,
  }
}
