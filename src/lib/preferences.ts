/**
 * Réglages de l'appareil : rappels, téléchargements, astuces déjà vues.
 *
 * Ce sont des conforts d'interface, propres à cet appareil : ils vivent dans
 * le stockage local et ne voyagent jamais avec un partage. Il n'y a pas de
 * thème à régler : l'application reste toujours en clair.
 */

export interface Preferences {
  /** Rappel la veille de chaque train ou vol. */
  notifyTransportEve: boolean
  /** Programme du jour, chaque matin. */
  notifyMorning: boolean
  /** Rappel le jour d'un check-in à l'hôtel. */
  notifyCheckIn: boolean
  /** Ne télécharger les photos qu'en Wi-Fi. */
  wifiOnly: boolean
  /** Astuces contextuelles déjà montrées (identifiants libres). */
  tipsSeen: string[]
  /** L'utilisateur a passé toutes les astuces d'un coup. */
  tipsDismissed: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  notifyTransportEve: true,
  notifyMorning: true,
  notifyCheckIn: false,
  wifiOnly: false,
  tipsSeen: [],
  tipsDismissed: false,
}

const STORAGE_KEY = 'tripbrain-preferences'

/** Fusionne une valeur lue avec les défauts : un champ inconnu ou mal typé est ignoré. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return { ...DEFAULT_PREFERENCES }
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof Preferences, unknown>>
    const result = { ...DEFAULT_PREFERENCES }
    for (const key of Object.keys(
      DEFAULT_PREFERENCES,
    ) as (keyof Preferences)[]) {
      const candidate = value[key]
      const expected = DEFAULT_PREFERENCES[key]
      if (Array.isArray(expected)) {
        if (
          Array.isArray(candidate) &&
          candidate.every((item) => typeof item === 'string')
        ) {
          ;(result as Record<string, unknown>)[key] = candidate
        }
      } else if (typeof candidate === typeof expected) {
        ;(result as Record<string, unknown>)[key] = candidate
      }
    }
    return result
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function readPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(STORAGE_KEY))
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

const listeners = new Set<(prefs: Preferences) => void>()

export function writePreferences(next: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Réglage de confort : sans stockage, il vaut pour la visite en cours.
  }
  for (const listener of listeners) listener(next)
}

export function subscribePreferences(
  listener: (prefs: Preferences) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
