/**
 * Un voyage reçu, en attente de confirmation.
 *
 * Code saisi, QR code scanné, lien ouvert ou fichier choisi : tout aboutit à
 * cette même description, que l'aperçu affiche avant d'enregistrer quoi que ce
 * soit sur l'appareil.
 */

import { fetchGroup, type GroupState } from '@/lib/group-sync'
import type { DayItinerary } from '@/lib/itinerary-data'
import type { TripSource } from '@/lib/trips'
import {
  decompressItinerary,
  fetchShare,
  type IncomingShare,
} from '@/lib/share'

/** Valeurs de `source` des événements `share_import_*` (voir le catalogue). */
export type ShareImportSource =
  | 'code'
  | 'prompt'
  | 'payload'
  | 'generator'
  | 'group'

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
  /** Invitation à un voyage de groupe : on le rejoint au lieu de l'importer. */
  group?: { id: string; state: GroupState }
}

/** Source de mesure d'un partage, selon qu'il a été saisi ou reçu tout fait. */
export function shareAnalyticsSource(
  incoming: IncomingShare,
  via: ReceivedVia,
): ShareImportSource {
  if (incoming.origin === 'generator') return 'generator'
  if (incoming.group) return 'group'
  if (incoming.payload) return 'payload'
  return via === 'typed-code' ? 'prompt' : 'code'
}

/**
 * Ouvre un partage : lecture sur place pour un payload, aller-retour serveur
 * pour un code ou une invitation de groupe.
 */
export async function resolveIncomingShare(
  incoming: IncomingShare,
): Promise<{ days: DayItinerary[]; group?: ReceivedTrip['group'] }> {
  // Un code peut mener à un voyage de groupe : on le rejoint dans son état
  // actuel, pas tel qu'il était quand le code a été créé.
  const viaCode =
    !incoming.group && !incoming.payload && incoming.code
      ? await fetchShare(incoming.code)
      : null
  const groupId = incoming.group ?? viaCode?.group
  if (groupId) {
    const result = await fetchGroup(groupId)
    if (result.status !== 'changed') throw new Error('Invitation illisible.')
    const days = decompressItinerary(result.state.data)
    if (days.length === 0) {
      throw new Error('Ce voyage ne contient aucune journée.')
    }
    return { days, group: { id: groupId, state: result.state } }
  }
  const days = incoming.payload
    ? decompressItinerary(incoming.payload)
    : (viaCode?.days ?? (await fetchShare(incoming.code ?? '')).days)
  if (days.length === 0) {
    throw new Error('Ce partage ne contient aucune journée.')
  }
  return { days }
}
