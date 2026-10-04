// Affinage d'un itinéraire généré : l'itinéraire actuel et une demande en
// langage naturel (« Ajoute une nuit à Hakone et enlève Nara ») donnent un
// nouvel itinéraire complet, même schéma, mêmes dates de départ.
//
// La réponse est rendue d'un bloc, en JSON : l'app compare avant/après et
// propose les changements, elle n'a rien à montrer pendant l'écriture. Le
// modèle est quand même lu en flux côté serveur, pour qu'une longue réponse
// ne bute pas sur un délai d'attente.
//
// Rien du voyage n'est journalisé, ni l'itinéraire ni la demande.

import {
  completeText,
  generatorModel,
  isGeneratorConfigured,
  toGeneratorError,
} from '@/lib/generator/claude'
import {
  FAILURE_MESSAGES,
  FAILURE_STATUS,
  type GeneratorFailureReason,
} from '@/lib/generator/errors'
import { buildRefinePrompt } from '@/lib/generator/itinerary-prompt'
import { checkGeneratorOrigin } from '@/lib/generator/origin'
import { readGeneratedItinerary } from '@/lib/generator/read-result'
import {
  firstIssueMessage,
  refineRequestSchema,
} from '@/lib/generator/requests'
import { createRateLimiter, getClientKey } from '@/lib/rate-limit'
import { preflightResponse } from '@/lib/share-cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Un affinage se répète plus volontiers qu'une génération : limite plus large. */
const checkRateLimit = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 })

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
  const parsed = refineRequestSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', firstIssueMessage(parsed.error))
  }

  const { itinerary, instruction, startDate } = parsed.data
  let text: string
  try {
    ;({ text } = await completeText(
      buildRefinePrompt(itinerary, instruction, startDate),
      request.signal,
    ))
  } catch (error) {
    const { reason } = toGeneratorError(error)
    console.error('Affinage impossible', { reason, model: generatorModel() })
    return fail(reason)
  }

  const result = readGeneratedItinerary(text, startDate)
  // Une réponse coupée perdrait des journées : on préfère l'échec franc à un
  // voyage amputé présenté comme « changements proposés ».
  if (!result.itinerary || result.truncated) {
    console.error('Affinage illisible', { truncated: result.truncated })
    return fail('invalid_json')
  }

  return Response.json(
    { itinerary: result.itinerary },
    { headers: { ...cors, 'Cache-Control': 'no-store' } },
  )
}
