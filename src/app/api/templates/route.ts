// Publication d'un itinéraire modèle : le téléphone envoie l'itinéraire
// compressé et les choix de l'écran A3 ; le serveur le renettoie, le range
// sous un id public et renvoie, une seule fois, le jeton qui permettra à
// l'auteur de le mettre à jour ou de le retirer.

import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  NO_STORE,
  openTemplateStore,
  parseTemplatePublish,
  readJsonBody,
  templateErrorResponse,
  templateRejection,
  tooManyTemplateRequests,
} from '@/lib/template-request'
import { publishTemplate } from '@/lib/template-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** De quoi publier plusieurs voyages, pas de quoi remplir le bucket. */
const checkRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 })

export async function POST(request: Request) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) return tooManyTemplateRequests(verdict.retryAfter)

  const body = await readJsonBody(request)
  if (!body.ok) return templateRejection(body.status, body.error)
  const parsed = parseTemplatePublish(body.data)
  if (!parsed.ok) return templateRejection(parsed.status, parsed.error)

  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const { template, ownerToken } = await publishTemplate(store, parsed.data)
    return Response.json(
      { template, ownerToken },
      { status: 201, headers: { 'Cache-Control': NO_STORE } },
    )
  } catch (error) {
    return templateErrorResponse(
      error,
      'La publication du modèle a échoué. Réessayez.',
    )
  }
}
