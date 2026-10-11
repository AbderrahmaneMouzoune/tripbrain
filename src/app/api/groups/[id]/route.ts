// Lecture et mise à jour d'un voyage de groupe.
//
// GET : avec `If-None-Match`, répond 304 tant que rien n'a changé — c'est la
// vérification que chaque téléphone fait régulièrement, elle doit coûter peu.
// PUT : n'écrit que si `If-Match` désigne encore la dernière version. Sinon,
// 412 avec la version actuelle, que le téléphone fusionne avant de réessayer.

import { isS3ndError, type Bucket } from '@s3nd/core'
import { isGroupId, sameEtag } from '@/lib/group-sync'
import { parseGroupWrite } from '@/lib/group-request'
import {
  GROUP_SCHEMA_VERSION,
  GROUP_SNAPSHOT_OPTIONS,
  getGroupStore,
  groupKey,
  type GroupSnapshotData,
} from '@/lib/group-store'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Une vérification toutes les 30 s par téléphone, plus les écritures. */
const checkRateLimit = createRateLimiter({ limit: 120, windowMs: 60_000 })

const NOT_FOUND = 'Ce voyage de groupe n’existe plus.'
const NO_STORE = { 'Cache-Control': 'no-store' }

type Context = { params: Promise<{ id: string }> }

function tooMany(retryAfter: number): Response {
  return Response.json(
    { error: 'Trop de requêtes. Réessayez dans un instant.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

function storeOrError(): Bucket | Response {
  try {
    return getGroupStore()
  } catch (error) {
    console.error('Configuration de la synchronisation incomplète', error)
    return Response.json(
      { error: 'La synchronisation n’est pas configurée sur ce serveur.' },
      { status: 503 },
    )
  }
}

async function readState(store: Bucket, id: string) {
  const snapshot = await store.getSnapshot<GroupSnapshotData>(groupKey(id), {
    maxVersion: GROUP_SCHEMA_VERSION,
  })
  const data = snapshot?.data
  if (!snapshot || typeof data?.payload !== 'string') return null
  return {
    data: data.payload,
    title: typeof data.title === 'string' ? data.title : '',
    author: typeof data.author === 'string' ? data.author : null,
    etag: snapshot.etag ?? '',
    updatedAt: snapshot.createdAt.toISOString(),
  }
}

/** Version actuelle, sans télécharger l'itinéraire : l'ETag seul. */
async function currentEtag(store: Bucket, id: string): Promise<string | null> {
  const file = await store.get(groupKey(id))
  if (!file) return null
  // On ne lit pas le corps : seul l'en-tête nous intéresse.
  file.body.destroy()
  return file.etag ?? null
}

export async function GET(request: Request, { params }: Context) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) return tooMany(verdict.retryAfter)

  const { id } = await params
  if (!isGroupId(id)) {
    return Response.json({ error: NOT_FOUND }, { status: 404 })
  }
  const store = storeOrError()
  if (store instanceof Response) return store

  try {
    const known = request.headers.get('if-none-match')
    if (known) {
      const etag = await currentEtag(store, id)
      if (sameEtag(etag, known)) {
        return new Response(null, { status: 304, headers: NO_STORE })
      }
    }
    const state = await readState(store, id)
    if (!state) return Response.json({ error: NOT_FOUND }, { status: 404 })
    return Response.json(state, { headers: NO_STORE })
  } catch (error) {
    if (isS3ndError(error) && error.code === 'SNAPSHOT_TOO_NEW') {
      return Response.json(
        {
          error:
            'Ce voyage a été modifié avec une version plus récente de TripBrain. Mettez l’application à jour.',
        },
        { status: 409 },
      )
    }
    console.error('Lecture du groupe impossible', error)
    return Response.json(
      { error: 'Synchronisation impossible. Réessayez.' },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request, { params }: Context) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) return tooMany(verdict.retryAfter)

  const { id } = await params
  if (!isGroupId(id)) {
    return Response.json({ error: NOT_FOUND }, { status: 404 })
  }
  const ifMatch = request.headers.get('if-match')
  if (!ifMatch) {
    return Response.json(
      { error: 'Version de départ manquante.' },
      { status: 428 },
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

  const store = storeOrError()
  if (store instanceof Response) return store

  try {
    const result = await store.putSnapshot(groupKey(id), parsed.data, {
      ...GROUP_SNAPSHOT_OPTIONS,
      ifMatch,
    })
    return Response.json(
      {
        etag: result.etag ?? '',
        updatedAt: result.createdAt.toISOString(),
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    if (isS3ndError(error) && error.code === 'PRECONDITION_FAILED') {
      // Quelqu'un est passé avant : on lui renvoie sa version à fusionner.
      // Un groupe disparu échoue aussi ici (rien ne correspond à If-Match).
      const current = await readState(store, id).catch(() => null)
      if (!current) return Response.json({ error: NOT_FOUND }, { status: 404 })
      return Response.json({ current }, { status: 412, headers: NO_STORE })
    }
    console.error('Écriture du groupe impossible', error)
    return Response.json(
      { error: 'Synchronisation impossible. Réessayez.' },
      { status: 500 },
    )
  }
}
