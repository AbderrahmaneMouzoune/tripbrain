// Validation commune des écritures de voyage de groupe (création et mise à jour).

import { cleanAuthor, MAX_GROUP_TITLE_LENGTH } from '@/lib/group-sync'
import {
  GROUP_MAX_PAYLOAD_CHARS,
  type GroupSnapshotData,
} from '@/lib/group-store'

export type ParsedGroupWrite =
  | { ok: true; data: GroupSnapshotData }
  | { ok: false; status: number; error: string }

export function parseGroupWrite(body: unknown): ParsedGroupWrite {
  const value = body as {
    data?: unknown
    title?: unknown
    author?: unknown
  } | null
  const payload = value?.data
  if (typeof payload !== 'string' || payload.length === 0) {
    return { ok: false, status: 400, error: 'Aucun itinéraire à enregistrer.' }
  }
  if (payload.length > GROUP_MAX_PAYLOAD_CHARS) {
    return {
      ok: false,
      status: 413,
      error: 'Itinéraire trop volumineux pour être synchronisé.',
    }
  }
  const title =
    typeof value?.title === 'string'
      ? value.title.trim().slice(0, MAX_GROUP_TITLE_LENGTH)
      : ''
  return {
    ok: true,
    data: { payload, title, author: cleanAuthor(value?.author) },
  }
}
