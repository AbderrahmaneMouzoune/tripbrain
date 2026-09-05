// Lecture d'un partage : le code saisi (ou scanné) est normalisé puis résolu en
// payload compressé, accompagné de sa nature (itinéraire ou documents). Le
// contenu reste opaque pour le serveur — c'est le navigateur qui le décompresse.

import { isBucketCodeError, type Bucket } from 'bucketcode'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import { DEFAULT_SHARE_KIND, isShareKind } from '@/lib/share'
import {
  SHARE_SCHEMA_VERSION,
  getShareStore,
  type SharedSnapshotData,
} from '@/lib/share-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Le code est un jeton au porteur : on le devine d'autant moins vite. */
const checkRateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 })

const NOT_FOUND = 'Code inconnu ou expiré.'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) {
    return Response.json(
      { error: 'Trop de tentatives. Réessayez dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfter) } },
    )
  }

  const { code: typed } = await params

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

  try {
    // `normalize` recolle ce qui a été tapé : séparateurs, casse, caractères
    // confondus. Il refuse ce que l'alphabet ne peut pas contenir.
    const code = store.codes.normalize(typed)

    const snapshot = await store.getSnapshot<SharedSnapshotData>(code, {
      maxVersion: SHARE_SCHEMA_VERSION,
    })

    // `null` couvre aussi bien l'absence que l'expiration : dans les deux cas
    // il n'y a rien à restaurer, et rien à révéler sur ce qui a existé.
    if (!snapshot) {
      return Response.json({ error: NOT_FOUND }, { status: 404 })
    }

    const payload = snapshot.data?.payload
    if (typeof payload !== 'string' || payload.length === 0) {
      return Response.json({ error: NOT_FOUND }, { status: 404 })
    }

    return Response.json(
      {
        data: payload,
        // Les snapshots écrits avant le partage de documents n'ont pas de
        // nature : ils ne peuvent contenir qu'un itinéraire.
        kind: isShareKind(snapshot.data?.kind)
          ? snapshot.data.kind
          : DEFAULT_SHARE_KIND,
        createdAt: snapshot.createdAt.toISOString(),
        expiresAt: snapshot.expiresAt?.toISOString() ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (isBucketCodeError(error)) {
      if (error.code === 'INVALID_SYNC_CODE') {
        return Response.json({ error: 'Code invalide.' }, { status: 400 })
      }
      // Un snapshot écrit par une version plus récente de l'app : mieux vaut le
      // dire que d'en restaurer une lecture approximative.
      if (error.code === 'SNAPSHOT_TOO_NEW') {
        return Response.json(
          {
            error:
              'Ce partage vient d’une version plus récente de TripBrain. Mettez l’application à jour.',
          },
          { status: 409 },
        )
      }
    }

    console.error('Lecture du partage impossible', error)
    return Response.json(
      { error: 'Lecture du partage impossible. Réessayez.' },
      { status: 500 },
    )
  }
}
