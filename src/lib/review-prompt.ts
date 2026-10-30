import { requestNativeReview } from './native-app'

const STORAGE_KEY = 'tripbrain:review-prompt'

/** Moments heureux au-delà desquels on peut proposer de noter l'app. */
const MIN_HAPPY_MOMENTS = 3

/** Écart minimal entre deux demandes : le système en limite déjà le nombre. */
const MIN_INTERVAL_MS = 120 * 24 * 60 * 60 * 1000

interface ReviewPromptState {
  happyMoments: number
  lastAskedAt: number | null
}

function readState(): ReviewPromptState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (parsed && typeof parsed.happyMoments === 'number') {
      return {
        happyMoments: parsed.happyMoments,
        lastAskedAt:
          typeof parsed.lastAskedAt === 'number' ? parsed.lastAskedAt : null,
      }
    }
  } catch {
    // Stockage illisible : on repart de zéro.
  }
  return { happyMoments: 0, lastAskedAt: null }
}

/**
 * À appeler après un moment réussi (voyage importé ou reçu, journée cochée en
 * entier) : au troisième, l'app native propose de la noter sur le store.
 * Sans effet hors de l'app ou si le natif ne sait pas le faire.
 */
export function recordHappyMoment(now = Date.now()): void {
  const state = readState()
  state.happyMoments += 1
  const due =
    state.happyMoments >= MIN_HAPPY_MOMENTS &&
    (state.lastAskedAt === null || now - state.lastAskedAt >= MIN_INTERVAL_MS)
  if (due) {
    requestNativeReview()
    state.happyMoments = 0
    state.lastAskedAt = now
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Sans stockage, la demande pourra revenir : le système la limite.
  }
}
