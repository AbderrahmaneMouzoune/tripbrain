/**
 * Appels de l'app aux routes du générateur. Aucun secret ici : la clé d'API
 * reste sur le serveur, l'app ne connaît que `/api/generate`.
 */

import {
  FAILURE_MESSAGES,
  isGeneratorFailureReason,
  type GeneratorFailureReason,
} from '@/lib/generator/errors'
import {
  generatedItinerarySchema,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import type { GenerateRequest, RefineRequest } from '@/lib/generator/requests'
import { STREAM_ERROR_MARKER } from '@/lib/generator/stream-parser'

/** Un échec qualifié, avec le message à montrer tel quel. */
export class GeneratorRequestError extends Error {
  constructor(
    readonly reason: GeneratorFailureReason,
    message: string = FAILURE_MESSAGES[reason],
    /** Secondes à attendre, quand le serveur l'indique. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'GeneratorRequestError'
  }
}

/** Interruption volontaire (« Arrêter »), à ne pas présenter comme une erreur. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Lit la réponse d'erreur d'une route, en tolérant une page HTML de proxy. */
async function toRequestError(
  response: Response,
): Promise<GeneratorRequestError> {
  let reason: GeneratorFailureReason =
    response.status === 429
      ? 'rate_limited'
      : response.status === 503
        ? 'not_configured'
        : 'unknown'
  let message: string | undefined
  try {
    const body = (await response.json()) as {
      error?: unknown
      reason?: unknown
    }
    if (isGeneratorFailureReason(body.reason)) reason = body.reason
    if (typeof body.error === 'string' && body.error) message = body.error
  } catch {
    // Pas de JSON : le code HTTP a déjà donné la cause la plus probable.
  }
  const retryAfter = Number(response.headers.get('Retry-After')) || undefined
  return new GeneratorRequestError(reason, message, retryAfter)
}

/**
 * Lance une génération et transmet le texte au fil de l'eau à `onText`.
 *
 * Rend la cause de l'échec quand le serveur en a ajouté une en fin de flux
 * (le statut HTTP était déjà parti). Lève `GeneratorRequestError` pour un
 * échec avant le flux ou une coupure réseau, et l'`AbortError` du navigateur
 * quand `signal` est déclenché.
 */
export async function streamGeneration(
  request: GenerateRequest,
  { signal, onText }: { signal?: AbortSignal; onText: (chunk: string) => void },
): Promise<{ streamError?: GeneratorFailureReason }> {
  let response: Response
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new GeneratorRequestError('network')
  }
  if (!response.ok || !response.body) throw await toRequestError(response)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  /** Tout ce qui suit le marqueur d'erreur : le code, à lire à la fin. */
  let trailer: string | null = null
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      if (trailer !== null) {
        trailer += text
        continue
      }
      const at = text.indexOf(STREAM_ERROR_MARKER)
      if (at === -1) {
        onText(text)
      } else {
        if (at > 0) onText(text.slice(0, at))
        trailer = text.slice(at + 1)
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error
    throw new GeneratorRequestError('network')
  }

  if (trailer === null) return {}
  const reason = trailer.trim()
  return { streamError: isGeneratorFailureReason(reason) ? reason : 'unknown' }
}

/** Demande un itinéraire modifié ; rend l'itinéraire complet, validé. */
export async function requestRefinement(
  body: RefineRequest,
  signal?: AbortSignal,
): Promise<GeneratedItinerary> {
  let response: Response
  try {
    response = await fetch('/api/generate/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new GeneratorRequestError('network')
  }
  if (!response.ok) throw await toRequestError(response)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new GeneratorRequestError('invalid_json')
  }
  const parsed = generatedItinerarySchema.safeParse(
    (payload as { itinerary?: unknown } | null)?.itinerary,
  )
  if (!parsed.success) throw new GeneratorRequestError('invalid_json')
  return parsed.data
}
