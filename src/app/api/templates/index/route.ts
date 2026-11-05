// Les modèles listés, du plus récemment modifié au plus ancien, par pages de
// 500 : de quoi construire le sitemap et les pages pays de tripbrain.fr sans
// lister le bucket. `?page=<n>` (0 par défaut) ; la réponse donne la page
// suivante (`nextPage`), `null` après la dernière. Un modèle non listé ou
// retiré n'y figure jamais.

import { getTemplateStore } from '@/lib/template-bucket'
import {
  TEMPLATE_LISTING_CACHE_CONTROL,
  openTemplateStore,
  parseIndexPage,
  templateErrorResponse,
  templateRejection,
} from '@/lib/template-request'
import { readIndexPage } from '@/lib/template-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const page = parseIndexPage(new URL(request.url).searchParams.get('page'))
  if (!page.ok) return templateRejection(page.status, page.error)
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const { entries, nextPage } = await readIndexPage(store, page.data)
    return Response.json(
      { entries, nextPage },
      { headers: { 'Cache-Control': TEMPLATE_LISTING_CACHE_CONTROL } },
    )
  } catch (error) {
    return templateErrorResponse(
      error,
      'Lecture des modèles impossible. Réessaie.',
    )
  }
}
