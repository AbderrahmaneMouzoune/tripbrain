// Création d'un voyage de groupe : le téléphone envoie l'itinéraire compressé,
// le serveur le range sous un identifiant secret, à partager en lien.

import { isS3ndError, type Bucket } from '@s3nd/core'
import { createGroupId } from '@/lib/group-sync'
import { parseGroupWrite } from '@/lib/group-request'
import {
  GROUP_SNAPSHOT_OPTIONS,
  getGroupStore,
  groupKey,
} from '@/lib/group-store'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const checkRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 })

export async function POST(request: Request) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) {
    return Response.json(
      { error: 'Trop de tentatives. Réessayez dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfter) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Requête illisible.' }, { status: 400 })
  }
  const parsed = parseGroupWrite(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status })
  }

  let store: Bucket
  try {
    store = getGroupStore()
  } catch (error) {
    console.error('Configuration de la synchronisation incomplète', error)
    return Response.json(
      { error: 'La synchronisation n’est pas configurée sur ce serveur.' },
      { status: 503 },
    )
  }

  try {
    const id = createGroupId()
    const result = await store.putSnapshot(groupKey(id), parsed.data, {
      ...GROUP_SNAPSHOT_OPTIONS,
      ifAbsent: true,
    })
    return Response.json({
      id,
      data: parsed.data.payload,
      title: parsed.data.title,
      author: parsed.data.author,
      etag: result.etag ?? '',
      updatedAt: result.createdAt.toISOString(),
    })
  } catch (error) {
    if (isS3ndError(error) && error.code === 'PRECONDITION_FAILED') {
      // 128 bits tirés deux fois de suite : un défaut de l'aléa, pas un hasard.
      console.error('Identifiant de groupe déjà pris', error)
    } else {
      console.error('Création du groupe impossible', error)
    }
    return Response.json(
      { error: 'La synchronisation n’a pas pu démarrer. Réessayez.' },
      { status: 500 },
    )
  }
}
