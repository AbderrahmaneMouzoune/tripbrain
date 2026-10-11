/**
 * Un voyage reçu, en attente de confirmation.
 *
 * Code saisi, QR code scanné, lien ouvert ou fichier choisi : tout aboutit à
 * cette même description, que l'aperçu affiche avant d'enregistrer quoi que ce
 * soit sur l'appareil.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import type { TripSource } from '@/lib/trips'
import {
  decompressItinerary,
  fetchSharedItinerary,
  type IncomingShare,
} from '@/lib/share'

/** Valeurs de `source` des événements `share_import_*` (voir le catalogue). */
export type ShareImportSource = 'code' | 'prompt' | 'payload' | 'generator'

/** Par où le voyage est arrivé : sert la phrase sous le titre de l'aperçu. */
export type ReceivedVia =
  | 'typed-code'
  | 'scan'
  | 'link'
  | 'clipboard'
  | 'generator'
  | 'file'

export interface ReceivedTrip {
  days: DayItinerary[]
  /** Titre fourni par le fichier ; sinon, il est déduit des villes. */
  title?: string
  source: TripSource
  via: ReceivedVia
  /** Pour la mesure : la famille de l'arrivée, jamais son contenu. */
  analytics:
    | { kind: 'share'; source: ShareImportSource }
    | { kind: 'file'; source: 'json' | 'xlsx' | 'csv' }
  /** Nom du fichier importé, montré à l'utilisateur seulement. */
  fileName?: string
}

/** Source de mesure d'un partage, selon qu'il a été saisi ou reçu tout fait. */
export function shareAnalyticsSource(
  incoming: IncomingShare,
  via: ReceivedVia,
): ShareImportSource {
  if (incoming.origin === 'generator') return 'generator'
  if (incoming.payload) return 'payload'
  return via === 'typed-code' ? 'prompt' : 'code'
}

/** Ouvre un partage : lecture sur place pour un payload, aller-retour serveur pour un code. */
export async function resolveIncomingShare(
  incoming: IncomingShare,
): Promise<DayItinerary[]> {
  const days = incoming.payload
    ? decompressItinerary(incoming.payload)
    : await fetchSharedItinerary(incoming.code ?? '')
  if (days.length === 0) {
    throw new Error('Ce partage ne contient aucune journée.')
  }
  return days
}
