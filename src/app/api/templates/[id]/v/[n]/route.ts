// Une version précise d'un modèle : celle qu'un repreneur a reprise, base de
// la fusion « Repartir de la dernière version » (V1.1). Publique, comme le
// modèle lui-même, et jamais au-delà de la version publiée. En cache CDN une
// minute seulement : un modèle retiré y répond 410, ses versions aussi.

import { isTemplateId } from '@/lib/template-model'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  RETIRED_BODY,
  TEMPLATE_CACHE_CONTROL,
  openTemplateStore,
  templateErrorResponse,
  templateRejection,
} from '@/lib/template-request'
import { readTemplateVersion } from '@/lib/template-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MISSING = 'Cette version du modèle n’existe pas.'

/** `1`, `12`… : ni zéro, ni signe, ni décimale, ni nombre démesuré. */
const VERSION = /^[1-9]\d{0,8}$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const { id, n } = await params
  if (!isTemplateId(id) || !VERSION.test(n)) {
    return templateRejection(404, MISSING)
  }
  const store = openTemplateStore(getTemplateStore)
  if (store instanceof Response) return store

  try {
    const result = await readTemplateVersion(store, id, Number(n))
    if (result.status === 'missing') return templateRejection(404, MISSING)
    const headers = { 'Cache-Control': TEMPLATE_CACHE_CONTROL }
    if (result.status === 'retired') {
      return Response.json(RETIRED_BODY, { status: 410, headers })
    }
    return Response.json(
      { version: result.version, itinerary: result.itinerary },
      { headers },
    )
  } catch (error) {
    return templateErrorResponse(
      error,
      'Lecture du modèle impossible. Réessayez.',
    )
  }
}
