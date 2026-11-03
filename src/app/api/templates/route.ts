// Publication d'un itinéraire modèle : le téléphone envoie l'itinéraire
// compressé et les choix de l'écran A3 ; le serveur le renettoie, le range
// sous un id public et renvoie le jeton qui permettra à l'auteur de le
// mettre à jour ou de le retirer.
//
// Le téléphone tire ce jeton lui-même et l'envoie dans `Authorization:
// Bearer` : une publication dont la réponse s'est perdue (tunnel, app en
// arrière-plan) se rejoue alors sans créer de doublon, et répond 200 avec le
// modèle déjà publié. Sans l'en-tête, le serveur tire le jeton (201), et
// chaque envoi publie un nouveau modèle.

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
import { readBearerToken } from '@/lib/template-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** De quoi publier plusieurs voyages, pas de quoi remplir le bucket. */
const checkRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 })

// Le message des écritures refusées faute de jeton valable (`[id]/route.ts`).
const NOT_ALLOWED = 'Cet appareil n’est pas autorisé à modifier ce modèle.'

export async function POST(request: Request) {
  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) return tooManyTemplateRequests(verdict.retryAfter)

  // Facultatif, mais bien formé s'il est là : un jeton illisible ne doit pas
  // retomber en silence sur un jeton tiré par le serveur, que le téléphone
  // n'attendrait pas.
  const ownerToken = readBearerToken(request)
  if (!ownerToken && request.headers.has('authorization')) {
    return templateRejection(401, NOT_ALLOWED)
  }

  const body = await readJsonBody(request)
  if (!body.ok) return templateRejection(body.status, body.error)
  const parsed = parseTemplatePublish(body.data)
  if (!parsed.ok) return templateRejection(parsed.status, parsed.error)

  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const result = await publishTemplate(
      store,
      ownerToken ? { ...parsed.data, ownerToken } : parsed.data,
    )
    return Response.json(
      { template: result.template, ownerToken: result.ownerToken },
      {
        status: result.created ? 201 : 200,
        headers: { 'Cache-Control': NO_STORE },
      },
    )
  } catch (error) {
    return templateErrorResponse(
      error,
      'La publication du modèle a échoué. Réessayez.',
    )
  }
}
