// Les modèles listés, du plus récemment modifié au plus ancien : de quoi
// construire le sitemap et les pages pays de tripbrain.fr sans lister le
// bucket. Un modèle non listé ou retiré n'y figure jamais.

import { getTemplateStore } from '@/lib/template-bucket'
import {
  TEMPLATE_LISTING_CACHE_CONTROL,
  openTemplateStore,
  templateErrorResponse,
} from '@/lib/template-request'
import { readIndex } from '@/lib/template-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const entries = await readIndex(store)
    return Response.json(
      { entries },
      { headers: { 'Cache-Control': TEMPLATE_LISTING_CACHE_CONTROL } },
    )
  } catch (error) {
    return templateErrorResponse(
      error,
      'Lecture des modèles impossible. Réessayez.',
    )
  }
}
