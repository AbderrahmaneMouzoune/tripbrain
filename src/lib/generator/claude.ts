/**
 * Appel à l'API Claude, côté serveur uniquement.
 *
 * Ce module lit `ANTHROPIC_API_KEY` : il n'est importé que par les routes
 * `/api/generate`, jamais par un composant — la clé ne quitte pas le serveur.
 *
 * Choix du modèle : `claude-opus-5-5` par défaut, à effort `low`. Un
 * itinéraire est une longue réponse JSON très structurée, où la connaissance
 * des lieux compte plus qu'un raisonnement profond : l'effort bas garde la
 * qualité d'Opus tout en limitant la réflexion préalable, donc le délai avant
 * la première journée et la facture. `GENERATOR_MODEL` et `GENERATOR_EFFORT`
 * permettent d'en changer sans toucher au code (ex. `claude-sonnet-5-5`,
 * moitié moins cher).
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { GeneratorFailureReason } from '@/lib/generator/errors'

export const DEFAULT_GENERATOR_MODEL = 'claude-opus-5-5'
const DEFAULT_EFFORT = 'low'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof EFFORTS)[number]

/**
 * Un mois de voyage tient en une trentaine de milliers de jetons de JSON
 * minifié : la marge évite qu'une réponse soit coupée avant la dernière
 * journée. Le flux rend ce plafond sans risque de dépassement de délai.
 */
const MAX_TOKENS = 64_000

/**
 * Modèles qui acceptent le repli côté serveur (`fallbacks: "default"`) : si
 * un filtre de sécurité décline la demande par erreur, l'API la rejoue
 * aussitôt sur le modèle recommandé, dans le même flux. Un faux positif ne
 * devient pas une panne. Les autres modèles refuseraient le paramètre.
 */
const SERVER_FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
  'claude-sonnet-5-5',
])
const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export function isGeneratorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export function generatorModel(): string {
  return process.env.GENERATOR_MODEL?.trim() || DEFAULT_GENERATOR_MODEL
}

function generatorEffort(): Effort {
  const value = process.env.GENERATOR_EFFORT?.trim()
  return (EFFORTS as readonly string[]).includes(value ?? '')
    ? (value as Effort)
    : DEFAULT_EFFORT
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Un échec qualifié, prêt à être renvoyé au client sous forme de code. */
export class GeneratorError extends Error {
  constructor(readonly reason: GeneratorFailureReason) {
    super(reason)
    this.name = 'GeneratorError'
  }
}

/**
 * Traduit une erreur du SDK en cause connue. On s'appuie sur les classes
 * typées du SDK, du plus précis au plus général, jamais sur le texte des
 * messages.
 */
export function toGeneratorError(error: unknown): GeneratorError {
  if (error instanceof GeneratorError) return error
  if (error instanceof Anthropic.APIUserAbortError) {
    return new GeneratorError('network')
  }
  if (error instanceof Anthropic.AuthenticationError) {
    // Clé présente mais refusée : pour le voyageur, c'est un générateur
    // indisponible, et le générateur du site reste une issue.
    return new GeneratorError('not_configured')
  }
  if (
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError
  ) {
    return new GeneratorError('overloaded')
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new GeneratorError('network')
  }
  return new GeneratorError('unknown')
}

/** Ce que l'on sait de la fin d'une réponse. */
export interface CompletionEnd {
  /** Vrai quand le modèle a atteint `MAX_TOKENS` : la réponse est coupée. */
  truncated: boolean
}

function buildParams(prompt: string): BetaMessageStreamParams {
  const model = generatorModel()
  const params: BetaMessageStreamParams = {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort: generatorEffort() },
    messages: [{ role: 'user', content: prompt }],
  }
  if (SERVER_FALLBACK_MODELS.has(model)) {
    params.betas = [SERVER_FALLBACK_BETA]
    params.fallbacks = 'default'
  }
  return params
}

/**
 * Ouvre la génération et attend son premier événement avant de rendre la
 * main : une erreur de connexion, de quota ou de clé se produit à ce
 * moment-là, et la route peut encore y répondre par un vrai statut HTTP. La
 * suite arrive par le générateur rendu, texte par texte.
 *
 * `signal` coupe l'appel au modèle : quand le voyageur arrête la génération,
 * on cesse aussi de la payer.
 */
export async function openCompletion(
  prompt: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<string, CompletionEnd>> {
  const stream = getClient().beta.messages.stream(buildParams(prompt), {
    signal,
  })
  const events = stream[Symbol.asyncIterator]()

  let first: IteratorResult<BetaRawMessageStreamEvent>
  try {
    first = await events.next()
  } catch (error) {
    throw toGeneratorError(error)
  }

  async function* texts(): AsyncGenerator<string, CompletionEnd> {
    try {
      let result = first
      while (!result.done) {
        const event = result.value
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text
        }
        result = await events.next()
      }
      const message = await stream.finalMessage()
      // Un refus arrive en HTTP 200, avec un `stop_reason` dédié : il faut le
      // vérifier avant de croire la réponse complète.
      if (message.stop_reason === 'refusal') throw new GeneratorError('refused')
      return { truncated: message.stop_reason === 'max_tokens' }
    } catch (error) {
      throw toGeneratorError(error)
    }
  }

  return texts()
}

/** Toute la réponse d'un coup, pour l'affinage qui rend un JSON complet. */
export async function completeText(
  prompt: string,
  signal?: AbortSignal,
): Promise<{ text: string } & CompletionEnd> {
  const chunks = await openCompletion(prompt, signal)
  let text = ''
  let result = await chunks.next()
  while (!result.done) {
    text += result.value
    result = await chunks.next()
  }
  return { text, ...result.value }
}
