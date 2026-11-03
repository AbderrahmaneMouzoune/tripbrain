// Un modèle : lecture publique, et gestion par son auteur.
//
// GET est public et jamais mis en cache : c'est ce que l'app lit pour
// l'aperçu et la reprise, et un modèle retiré ne doit pas rester repris
// pendant des minutes. Le site vitrine ne lit que l'index et les modèles par
// slug, eux en cache.
// PUT (nouvelle version), PATCH (visibilité, prénom) et DELETE (retrait)
// exigent le jeton propriétaire dans `Authorization: Bearer`.

import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import { isTemplateId } from '@/lib/template-model'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  NO_STORE,
  RETIRED_BODY,
  openTemplateStore,
  parseTemplatePatch,
  parseTemplateUpdate,
  readJsonBody,
  templateErrorResponse,
  templateRejection,
  tooManyTemplateRequests,
} from '@/lib/template-request'
import {
  assertTemplateOwner,
  patchTemplate,
  readTemplate,
  retireTemplate,
  updateTemplate,
} from '@/lib/template-store'
import { readBearerToken } from '@/lib/template-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Écritures seulement. La lecture n'a pas de limiteur : une ouverture de
 * modèle n'en fait qu'une, et une page serveur qui la ferait passer par
 * l'API arriverait de quelques IP partagées.
 */
const checkWriteRateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 })

const MISSING = 'Ce modèle n’existe pas.'
// Même message sans jeton (401) et avec un mauvais jeton (403) : la réponse
// ne dit pas ce qui manquait.
const NOT_ALLOWED = 'Cet appareil n’est pas autorisé à modifier ce modèle.'
const WRITE_FAILED = 'La mise à jour du modèle a échoué. Réessayez.'

type Context = { params: Promise<{ id: string }> }

/** Limiteur, jeton puis id : ce que toute écriture vérifie avant le bucket. */
async function authorizeWrite(
  request: Request,
  params: Context['params'],
): Promise<{ id: string; token: string } | Response> {
  const verdict = checkWriteRateLimit(getClientKey(request))
  if (!verdict.allowed) return tooManyTemplateRequests(verdict.retryAfter)
  const token = readBearerToken(request)
  if (!token) return templateRejection(401, NOT_ALLOWED)
  const { id } = await params
  if (!isTemplateId(id)) return templateRejection(404, MISSING)
  return { id, token }
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  if (!isTemplateId(id)) return templateRejection(404, MISSING)
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const result = await readTemplate(store, id)
    if (result.status === 'missing') return templateRejection(404, MISSING)
    const headers = { 'Cache-Control': NO_STORE }
    if (result.status === 'retired') {
      return Response.json(RETIRED_BODY, { status: 410, headers })
    }
    return Response.json({ template: result.template }, { headers })
  } catch (error) {
    return templateErrorResponse(
      error,
      'Lecture du modèle impossible. Réessayez.',
    )
  }
}

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeWrite(request, params)
  if (access instanceof Response) return access
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store
  // Le jeton est vérifié contre son empreinte avant de lire le corps :
  // `authorizeWrite` n'en contrôle que la forme, et la décompression de
  // l'itinéraire est le travail le plus coûteux de la route.
  try {
    await assertTemplateOwner(store, access.id, access.token)
  } catch (error) {
    return templateErrorResponse(error, WRITE_FAILED)
  }
  const body = await readJsonBody(request)
  if (!body.ok) return templateRejection(body.status, body.error)
  const parsed = parseTemplateUpdate(body.data)
  if (!parsed.ok) return templateRejection(parsed.status, parsed.error)

  try {
    const { template } = await updateTemplate(
      store,
      access.id,
      access.token,
      parsed.data,
    )
    return Response.json(
      { template },
      { headers: { 'Cache-Control': NO_STORE } },
    )
  } catch (error) {
    return templateErrorResponse(error, WRITE_FAILED)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const access = await authorizeWrite(request, params)
  if (access instanceof Response) return access
  const body = await readJsonBody(request)
  if (!body.ok) return templateRejection(body.status, body.error)
  const parsed = parseTemplatePatch(body.data)
  if (!parsed.ok) return templateRejection(parsed.status, parsed.error)
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const { template } = await patchTemplate(
      store,
      access.id,
      access.token,
      parsed.data,
    )
    return Response.json(
      { template },
      { headers: { 'Cache-Control': NO_STORE } },
    )
  } catch (error) {
    return templateErrorResponse(error, WRITE_FAILED)
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const access = await authorizeWrite(request, params)
  if (access instanceof Response) return access
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    await retireTemplate(store, access.id, access.token)
    return Response.json(
      { status: 'retired' },
      { headers: { 'Cache-Control': NO_STORE } },
    )
  } catch (error) {
    return templateErrorResponse(
      error,
      'Le retrait du modèle a échoué. Réessayez.',
    )
  }
}
