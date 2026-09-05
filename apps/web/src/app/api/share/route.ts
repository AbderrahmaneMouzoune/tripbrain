// Création d'un partage : le client envoie l'itinéraire compressé, le serveur
// le range dans le bucket sous un code que la personne pourra recopier ailleurs.

import { isBucketCodeError, type Bucket } from 'bucketcode'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import {
  SHARE_APP,
  SHARE_EXPIRES_IN,
  SHARE_MAX_PAYLOAD_CHARS,
  SHARE_SCHEMA_VERSION,
  getShareStore,
  type SharedSnapshotData,
} from '@/lib/share-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** De quoi partager plusieurs fois de suite, pas de quoi remplir le bucket. */
const checkRateLimit = createRateLimiter({ limit: 20, windowMs: 60_000 })

/** Codes tirés avant d'abandonner, si le tirage tombe sur un code déjà pris. */
const CODE_ATTEMPTS = 5

export async function POST(request: Request) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) {
    return Response.json(
      { error: 'Trop de partages en peu de temps. Réessayez dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfter) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Requête illisible.' }, { status: 400 })
  }

  const payload = (body as { data?: unknown } | null)?.data
  if (typeof payload !== 'string' || payload.length === 0) {
    return Response.json(
      { error: 'Aucune donnée à partager.' },
      { status: 400 },
    )
  }
  if (payload.length > SHARE_MAX_PAYLOAD_CHARS) {
    return Response.json(
      { error: 'Itinéraire trop volumineux pour être partagé.' },
      { status: 413 },
    )
  }

  let store: Bucket
  try {
    store = getShareStore()
  } catch (error) {
    console.error('Configuration du partage incomplète', error)
    return Response.json(
      { error: 'Le partage n’est pas configuré sur ce serveur.' },
      { status: 503 },
    )
  }

  const data: SharedSnapshotData = { payload }

  try {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = store.codes.create()

      try {
        const snapshot = await store.putSnapshot(code, data, {
          app: SHARE_APP,
          version: SHARE_SCHEMA_VERSION,
          expiresIn: SHARE_EXPIRES_IN,
          // Ne jamais écraser un code déjà réclamé par quelqu'un d'autre.
          ifAbsent: true,
        })

        return Response.json({
          code,
          expiresAt: snapshot.expiresAt?.toISOString() ?? null,
        })
      } catch (error) {
        if (
          isBucketCodeError(error) &&
          error.code === 'PRECONDITION_FAILED' &&
          attempt < CODE_ATTEMPTS - 1
        ) {
          continue
        }
        throw error
      }
    }

    return Response.json(
      { error: 'Impossible de générer un code libre. Réessayez.' },
      { status: 503 },
    )
  } catch (error) {
    console.error('Création du partage impossible', error)
    return Response.json(
      { error: 'Le partage a échoué. Réessayez dans quelques instants.' },
      { status: 500 },
    )
  }
}
