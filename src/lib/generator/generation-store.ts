/**
 * État de la génération en cours, tenu au niveau du module.
 *
 * Une génération dure une à trois minutes : le voyageur ferme l'écran, va
 * voir un autre voyage, revient. Tant que l'app reste ouverte, la requête
 * continue — à condition que son état ne vive pas dans un composant, qui
 * disparaît avec l'écran. Il vit donc ici, et l'écran du générateur n'en est
 * qu'une vue (`useSyncExternalStore`) : le rouvrir montre l'avancement.
 *
 * Le brouillon des formulaires est gardé de la même façon, pour qu'un
 * aller-retour ne fasse pas perdre une description à moitié écrite.
 */

import { trackEvent } from '@/lib/analytics/client'
import {
  isAbortError,
  streamGeneration,
  GeneratorRequestError,
} from '@/lib/generator/api'
import {
  FAILURE_MESSAGES,
  type GeneratorFailureReason,
} from '@/lib/generator/errors'
import {
  generatedDaySchema,
  type GeneratedDay,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import { readGeneratedItinerary } from '@/lib/generator/read-result'
import { expectedDays, type GenerateRequest } from '@/lib/generator/requests'
import {
  IncrementalItineraryParser,
  type PartialDay,
} from '@/lib/generator/stream-parser'
import { EMPTY_BRIEF, type TripBrief } from '@/lib/generator/trip-brief'

export type GenerationStatus = 'idle' | 'running' | 'done' | 'stopped' | 'error'

export interface GenerationState {
  status: GenerationStatus
  request: GenerateRequest | null
  /** Nombre de journées attendues : le « N » de « Jour n sur N ». */
  expectedDays: number
  tripTitle?: string
  summary?: string
  /** Journées terminées et validées, dans l'ordre. */
  days: GeneratedDay[]
  /** Journée en cours d'écriture. */
  current: PartialDay | null
  /** Résultat final, une fois la génération terminée (ou arrêtée). */
  itinerary: GeneratedItinerary | null
  /** Journées écartées à la lecture finale. */
  droppedDays: number
  /** Vrai quand la réponse a été coupée avant la dernière journée. */
  truncated: boolean
  error: {
    reason: GeneratorFailureReason
    message: string
    retryAfter?: number
  } | null
}

export interface GeneratorDraft {
  description: string
  startDate: string
  durationDays: number
  brief: TripBrief
}

const IDLE: GenerationState = {
  status: 'idle',
  request: null,
  expectedDays: 0,
  days: [],
  current: null,
  itinerary: null,
  droppedDays: 0,
  truncated: false,
  error: null,
}

/**
 * Brouillon vide. Pas de date de départ proposée : elle est obligatoire, et
 * une date pré-remplie serait validée sans être lue — c'est précisément la
 * donnée qu'un modèle invente quand on ne la lui donne pas.
 */
const EMPTY_DRAFT: GeneratorDraft = {
  description: '',
  startDate: '',
  durationDays: EMPTY_BRIEF.durationDays,
  brief: EMPTY_BRIEF,
}

let state: GenerationState = IDLE
let draft: GeneratorDraft = EMPTY_DRAFT
let controller: AbortController | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setState(patch: Partial<GenerationState>): void {
  state = { ...state, ...patch }
  emit()
}

export function subscribeGeneration(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getGenerationState(): GenerationState {
  return state
}

/** État servi au rendu serveur : rien ne tourne avant l'hydratation. */
export function getServerGenerationState(): GenerationState {
  return IDLE
}

export function getGeneratorDraft(): GeneratorDraft {
  return draft
}

export function getServerGeneratorDraft(): GeneratorDraft {
  return EMPTY_DRAFT
}

export function updateGeneratorDraft(patch: Partial<GeneratorDraft>): void {
  draft = { ...draft, ...patch }
  emit()
}

/** Valide les journées refermées ; une journée mal formée est simplement sautée. */
function validDays(raw: unknown[]): GeneratedDay[] {
  return raw.flatMap((day) => {
    const parsed = generatedDaySchema.safeParse(day)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * Prévient le voyageur que son voyage est prêt, s'il a quitté l'app des yeux
 * et l'a déjà autorisée à notifier. On ne demande jamais la permission ici :
 * c'est l'écran des rappels qui s'en charge, au bon moment.
 */
async function notifyReady(title: string | undefined): Promise<void> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return
  }
  if (Notification.permission !== 'granted') return
  if (document.visibilityState !== 'hidden') return

  const options: NotificationOptions = {
    body: title ? `« ${title} » vous attend dans TripBrain.` : undefined,
    tag: 'tripbrain-generator',
  }
  try {
    // Sur mobile, seule la notification du service worker est permise.
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification('Votre voyage est prêt', options)
      return
    }
    new Notification('Votre voyage est prêt', options)
  } catch {
    // Notification refusée par le système : l'écran montrera le résultat.
  }
}

function fail(
  reason: GeneratorFailureReason,
  message = FAILURE_MESSAGES[reason],
  retryAfter?: number,
): void {
  trackEvent('generator_failed', { step: 'generate', reason })
  setState({
    status: 'error',
    current: null,
    error: { reason, message, retryAfter },
  })
}

/**
 * Lance une génération. Une génération déjà en cours est arrêtée d'abord :
 * « Tout régénérer » ne doit pas laisser deux réponses se disputer l'écran.
 */
export async function startGeneration(request: GenerateRequest): Promise<void> {
  controller?.abort()
  const own = new AbortController()
  controller = own

  state = {
    ...IDLE,
    status: 'running',
    request,
    expectedDays: expectedDays(request) ?? 0,
  }
  emit()
  trackEvent('generator_started', { mode: request.mode })

  const parser = new IncrementalItineraryParser()
  let validated = 0

  try {
    const { streamError } = await streamGeneration(request, {
      signal: own.signal,
      onText: (chunk) => {
        if (controller !== own) return
        const snapshot = parser.push(chunk)
        const patch: Partial<GenerationState> = {
          tripTitle: snapshot.tripTitle,
          summary: snapshot.summary,
          current: snapshot.current,
        }
        if (snapshot.days.length !== validated) {
          validated = snapshot.days.length
          patch.days = validDays(snapshot.days)
        }
        setState(patch)
      },
    })
    if (controller !== own) return

    const result = readGeneratedItinerary(parser.text, request.startDate)
    if (streamError && !result.itinerary) {
      fail(streamError)
      return
    }
    if (!result.itinerary) {
      fail('invalid_json')
      return
    }

    controller = null
    setState({
      status: 'done',
      current: null,
      itinerary: result.itinerary,
      tripTitle: result.itinerary.tripTitle,
      summary: result.itinerary.summary,
      days: result.itinerary.days,
      droppedDays: result.droppedDays,
      truncated: result.truncated || Boolean(streamError),
    })
    trackEvent('generator_completed', {
      mode: request.mode,
      days_count: result.itinerary.days.length,
    })
    void notifyReady(result.itinerary.tripTitle)
  } catch (error) {
    if (controller !== own) return
    controller = null
    if (isAbortError(error)) return
    if (error instanceof GeneratorRequestError) {
      fail(error.reason, error.message, error.retryAfter)
    } else {
      fail('unknown')
    }
  }
}

/**
 * Arrête la génération. Les journées déjà écrites sont gardées : elles
 * peuvent servir telles quelles, ou être jetées par « Tout régénérer ».
 */
export function stopGeneration(): void {
  if (state.status !== 'running') return
  controller?.abort()
  controller = null
  const itinerary: GeneratedItinerary | null =
    state.days.length > 0
      ? {
          tripTitle: state.tripTitle ?? '',
          summary: state.summary ?? '',
          days: state.days,
        }
      : null
  setState({ status: 'stopped', current: null, itinerary, truncated: true })
}

/** Remplace le résultat, après un affinage accepté. */
export function replaceGeneratedItinerary(itinerary: GeneratedItinerary): void {
  setState({
    itinerary,
    tripTitle: itinerary.tripTitle,
    summary: itinerary.summary,
    days: itinerary.days,
    truncated: false,
    droppedDays: 0,
  })
}

/** Oublie la génération et le brouillon : le voyage est enregistré. */
export function resetGeneration(): void {
  controller?.abort()
  controller = null
  state = IDLE
  draft = EMPTY_DRAFT
  emit()
}
