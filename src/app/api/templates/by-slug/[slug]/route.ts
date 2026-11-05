// Le modèle d'une page tripbrain.fr/itineraires/<slug>, lu par le site
// vitrine côté serveur.
//
// Seuls les modèles listés (visibles et d'au moins 2 jours) répondent : un
// slug se devine, et un modèle « lien seulement » ne doit être joignable que
// par son id, via /m/<id>. Retiré après avoir été listé : 410, pour que la
// page disparaisse aussi des moteurs de recherche.

import { isTemplateSlug } from '@/lib/template-model'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  RETIRED_BODY,
  TEMPLATE_LISTING_CACHE_CONTROL,
  openTemplateStore,
  templateErrorResponse,
  templateRejection,
} from '@/lib/template-request'
import { readTemplateBySlug } from '@/lib/template-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MISSING = 'Ce modèle n’existe pas.'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!isTemplateSlug(slug)) return templateRejection(404, MISSING)
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const result = await readTemplateBySlug(store, slug)
    if (result.status === 'missing') return templateRejection(404, MISSING)
    const headers = { 'Cache-Control': TEMPLATE_LISTING_CACHE_CONTROL }
    if (result.status === 'retired') {
      return Response.json(RETIRED_BODY, { status: 410, headers })
    }
    return Response.json({ template: result.template }, { headers })
  } catch (error) {
    return templateErrorResponse(
      error,
      'Lecture du modèle impossible. Réessaie.',
    )
  }
}
