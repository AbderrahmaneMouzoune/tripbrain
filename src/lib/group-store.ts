// Stockage serveur des voyages de groupe, dans le même bucket que les
// partages (`share-store.ts`), sous `groups/<id>`.
//
// Le contenu reste opaque : l'itinéraire arrive compressé du navigateur et
// repart tel quel. Le serveur ne fait que garder la dernière version et
// refuser une écriture qui ne part pas d'elle.

import type { Bucket } from '@s3nd/core'
import { getShareStore, SHARE_APP } from '@/lib/share-store'

/** Version du format de `data` : à incrémenter si sa forme change. */
export const GROUP_SCHEMA_VERSION = 1

/**
 * Un voyage de groupe sans aucune écriture pendant ce délai disparaît.
 * Chaque modification repousse l'échéance : un voyage vivant ne s'efface pas.
 */
export const GROUP_EXPIRES_IN = 400 * 24 * 60 * 60

/** Taille maximale de l'itinéraire compressé (base64url). */
export const GROUP_MAX_PAYLOAD_CHARS = 2 * 1024 * 1024

export interface GroupSnapshotData {
  payload: string
  title: string
  author: string | null
}

export function groupKey(id: string): string {
  return `groups/${id}`
}

export function getGroupStore(): Bucket {
  return getShareStore()
}

export const GROUP_SNAPSHOT_OPTIONS = {
  app: SHARE_APP,
  version: GROUP_SCHEMA_VERSION,
  expiresIn: GROUP_EXPIRES_IN,
} as const
