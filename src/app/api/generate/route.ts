// Génération d'un itinéraire : le client décrit son voyage, le serveur appelle
// Claude et renvoie le JSON de l'itinéraire au fil de l'eau, en texte brut.
//
// Le flux transporte la réponse du modèle telle quelle : l'app y repère les
// journées dès qu'elles sont refermées (`stream-parser.ts`). Une erreur qui
// survient une fois le flux commencé ne peut plus changer le statut HTTP :
// elle est ajoutée en fin de flux derrière `STREAM_ERROR_MARKER`.
//
// Rien du voyage n'est journalisé : ni la description, ni le brief, ni la
// réponse. Seule la cause d'un échec l'est.

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
import {
  buildBriefPrompt,
  buildExpressPrompt,
} from '@/lib/generator/itinerary-prompt'
import { checkGeneratorOrigin } from '@/lib/generator/origin'
import {
  firstIssueMessage,
  generateRequestSchema,
} from '@/lib/generator/requests'
import { STREAM_ERROR_MARKER } from '@/lib/generator/stream-parser'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import { preflightResponse } from '@/lib/share-cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Un long voyage s'écrit en une à trois minutes : de la marge, sans excès. */
export const maxDuration = 300

/**
 * Une génération coûte cher : quelques essais par heure suffisent à décrire,
 * reprendre et relancer un voyage, pas à servir de passerelle gratuite.
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

  if (!isGeneratorConfigured()) return fail('not_configured')

  const verdict = checkRateLimit(getClientKey(request))
  if (!verdict.allowed) {
    return fail('rate_limited', undefined, {
      'Retry-After': String(verdict.retryAfter),
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('invalid_request', 'Requête illisible.')
  }
  const parsed = generateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', firstIssueMessage(parsed.error))
  }

  const input = parsed.data
  const prompt =
    input.mode === 'express'
      ? buildExpressPrompt(input.description, input.startDate, input.durationDays)
      : buildBriefPrompt(input.brief, input.startDate)

  let chunks: Awaited<ReturnType<typeof openCompletion>>
  try {
    chunks = await openCompletion(prompt, request.signal)
  } catch (error) {
    const { reason } = toGeneratorError(error)
    console.error('Génération impossible', { reason, model: generatorModel() })
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
        // Le voyageur a fermé la connexion ou arrêté : rien à signaler.
        if (!request.signal.aborted) {
          console.error('Génération interrompue', { reason })
          controller.enqueue(encoder.encode(`${STREAM_ERROR_MARKER}${reason}`))
        }
        controller.close()
      }
    },
    async cancel() {
      await chunks.return({ truncated: true })
    },
  })

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      // Certains proxys retiennent les réponses pour les compresser : ici,
      // chaque morceau doit partir tout de suite.
      'X-Accel-Buffering': 'no',
    },
  })
}
