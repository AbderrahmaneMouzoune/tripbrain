/**
 * Volumes tirés d'un itinéraire, pour la mesure d'audience.
 *
 * On compte, on ne lit pas : ces fonctions ne renvoient que des nombres, jamais
 * un nom de ville, un hébergement ou une note.
 */

import type { DayItinerary } from '@/lib/itinerary-data'

export interface ItineraryVolume {
  days_count: number
  activities_count: number
}

export function itineraryVolume(
  itinerary: readonly DayItinerary[],
): ItineraryVolume {
  return {
    days_count: itinerary.length,
    activities_count: itinerary.reduce(
      (total, day) => total + (day.activities?.length ?? 0),
      0,
    ),
  }
}

/** Famille de fichier, sans jamais retenir le nom ni le contenu. */
export function documentKind(
  mimeType: string | undefined,
): 'pdf' | 'image' | 'other' {
  if (!mimeType) return 'other'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

/** Famille commune à un lot de fichiers, ou « mixed » s'ils diffèrent. */
export function documentKindOf(
  mimeTypes: readonly (string | undefined)[],
): 'pdf' | 'image' | 'other' | 'mixed' {
  const kinds = new Set(mimeTypes.map(documentKind))
  if (kinds.size === 1) return [...kinds][0]
  return 'mixed'
}

/** Nature de l'échec d'un import, ramenée à une liste fermée de causes. */
export function importFailureReason(
  error: unknown,
): 'invalid_format' | 'empty_file' | 'network_error' | 'unknown' {
  if (error instanceof SyntaxError) return 'invalid_format'

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!message) return 'unknown'
  if (message.includes('vide') || message.includes('aucune journée')) {
    return 'empty_file'
  }
  if (message.includes('format') || message.includes('invalide')) {
    return 'invalid_format'
  }
  if (message.includes('réseau') || message.includes('fetch')) {
    return 'network_error'
  }
  return 'unknown'
}

/** Nature de l'échec d'un partage, ramenée à une liste fermée de causes. */
export function shareFailureReason(
  error: unknown,
): 'too_large' | 'network_error' | 'unavailable' | 'unknown' {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!message) return 'unknown'
  // « trop volumineux » pour un itinéraire, « trop volumineuse » pour une
  // sélection de documents : la racine couvre les deux.
  if (message.includes('volumineu')) return 'too_large'
  if (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('réseau')
  ) {
    return 'network_error'
  }
  if (
    message.includes('pas configuré') ||
    message.includes('trop de partages')
  ) {
    return 'unavailable'
  }
  return 'unknown'
}

/** Nature de l'échec d'une réception de partage. */
export function shareImportFailureReason(
  error: unknown,
):
  | 'invalid_code'
  | 'expired'
  | 'invalid_payload'
  | 'network_error'
  | 'unknown' {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (!message) return 'unknown'
  if (message.includes('expir')) return 'expired'
  if (message.includes('introuvable') || message.includes('code')) {
    return 'invalid_code'
  }
  if (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('réseau')
  ) {
    return 'network_error'
  }
  if (
    message.includes('illisible') ||
    message.includes('journée') ||
    message.includes('aucun document')
  ) {
    return 'invalid_payload'
  }
  return 'unknown'
}
