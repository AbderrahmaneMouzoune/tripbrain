// Import d'un programme existant : le client envoie le texte de son programme
// (ou son PDF), le serveur demande à Claude de le recopier dans le format de
// l'app et renvoie le JSON au fil de l'eau, comme `/api/generate`.
//
// Même flux, mêmes garde-fous : origine vérifiée, limite de débit, erreur en
// fin de flux derrière `STREAM_ERROR_MARKER`. Rien du programme n'est
// journalisé ni conservé : ni le texte, ni le PDF, ni la réponse.

import {
  generatorModel,
  isGeneratorConfigured,
  openCompletion,
  toGeneratorError,
} from '@/lib/generator/claude'
import {
  FAILURE_MESSAGES,
  FAILURE_STATUS,
  type GeneratorFailureReason,
} from '@/lib/generator/errors'
import { buildImportPrompt } from '@/lib/generator/itinerary-prompt'
import { todayIso } from '@/lib/generator/itinerary-quality'
import { checkGeneratorOrigin } from '@/lib/generator/origin'
import {
  importIssueMessage,
  importRequestSchema,
  MAX_IMPORT_BODY,
} from '@/lib/generator/program-import'
import { STREAM_ERROR_MARKER } from '@/lib/generator/stream-parser'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import { preflightResponse } from '@/lib/share-cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Recopier un mois de voyage prend une à trois minutes, comme le composer. */
export const maxDuration = 300

/**
 * Un import coûte autant qu'une génération, PDF compris : quelques essais par
 * heure suffisent à importer un voyage et à le relire.
 */
const checkRateLimit = createRateLimiter({ limit: 8, windowMs: 60 * 60_000 })

export async function OPTIONS(request: Request) {
  return preflightResponse(request)
}

export async function POST(request: Request) {
  const { allowed, headers: cors } = checkGeneratorOrigin(request)
  const fail = (
    reason: GeneratorFailureReason,
    message = FAILURE_MESSAGES[reason],
    extraHeaders: Record<string, string> = {},
  ): Response =>
    Response.json(
      { error: message, reason },
      {
        status: FAILURE_STATUS[reason],
        headers: { ...cors, ...extraHeaders },
      },
    )

  if (!allowed) {
    return Response.json(
      { error: 'Origine non autorisée.', reason: 'invalid_request' },
      { status: 403, headers: cors },
    )
  }

  if (!isGeneratorConfigured()) {
    return fail(
      'not_configured',
      'L’import de programme n’est pas encore disponible sur ce serveur.',
    )
  }

  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) {
    return fail('rate_limited', undefined, {
      'Retry-After': String(verdict.retryAfter),
    })
  }

  // Un PDF de 3 Mo encodé tient sous cette taille : au-delà, la requête ne
  // vient pas de l'app et coûterait cher au modèle.
  const tooBig = 'Ce fichier est trop lourd : 3 Mo au maximum.'
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_IMPORT_BODY) return fail('invalid_request', tooBig)
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_IMPORT_BODY) return fail('invalid_request', tooBig)
    body = JSON.parse(text)
  } catch {
    return fail('invalid_request', 'Requête illisible.')
  }
  const parsed = importRequestSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', importIssueMessage(parsed.error))
  }

  const { source, startDate } = parsed.data
  const today = todayIso()
  const prompt = buildImportPrompt(source, {
    fallbackStart: startDate ?? today,
    today,
  })

  // Coupe l'appel au modèle dès que le client s'en va : une lecture que
  // personne ne verra ne doit pas être payée.
  const upstream = new AbortController()
  request.signal.addEventListener('abort', () => upstream.abort(), {
    once: true,
  })

  let chunks: Awaited<ReturnType<typeof openCompletion>>
  try {
    chunks = await openCompletion(
      prompt,
      { route: 'import', mode: source.kind },
      upstream.signal,
    )
  } catch (error) {
    const { reason } = toGeneratorError(error)
    console.error('Import impossible', { reason, model: generatorModel() })
    return fail(reason)
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await chunks.next()
        if (result.done) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(result.value))
      } catch (error) {
        const { reason } = toGeneratorError(error)
        if (!upstream.signal.aborted) {
          console.error('Import interrompu', { reason })
          controller.enqueue(encoder.encode(`${STREAM_ERROR_MARKER}${reason}`))
        }
        controller.close()
      }
    },
    cancel() {
      upstream.abort()
    },
  })

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
