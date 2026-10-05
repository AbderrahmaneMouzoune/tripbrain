import { afterEach, vi } from 'vitest'
import {
  getGenerationState,
  resetGeneration,
  startGeneration,
  subscribeGeneration,
} from '@/lib/generator/generation-store'
import { addDays, todayIso } from '@/lib/generator/itinerary-quality'
import { STREAM_ERROR_MARKER } from '@/lib/generator/stream-parser'

const startDate = addDays(todayIso(), 10)

const BODY = JSON.stringify({
  tripTitle: 'Lisbonne entre amis',
  summary: 'Trois jours.',
  days: ['Alfama', 'Belém'].map((title, index) => ({
    date: addDays(startDate, index),
    city: 'Lisbonne',
    title,
    activities: [{ name: title, type: 'visit' }],
  })),
})

/** Une réponse de `/api/generate` qui arrive en plusieurs morceaux. */
function streamedResponse(parts: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part))
        controller.close()
      },
    }),
    init,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetGeneration()
})

describe('magasin de génération', () => {
  it('suit les journées au fil du flux puis rend le résultat', async () => {
    const half = BODY.indexOf('"title":"Belém"')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamedResponse([BODY.slice(0, half), BODY.slice(half)]),
      ),
    )
    const seen: number[] = []
    const unsubscribe = subscribeGeneration(() =>
      seen.push(getGenerationState().days.length),
    )

    await startGeneration({
      mode: 'express',
      description: '3 jours à Lisbonne entre amis',
      startDate,
      durationDays: 2,
    })
    unsubscribe()

    const state = getGenerationState()
    expect(state.status).toBe('done')
    expect(state.expectedDays).toBe(2)
    expect(state.itinerary?.days.map((day) => day.title)).toEqual([
      'Alfama',
      'Belém',
    ])
    // La première journée est apparue avant la fin du flux.
    expect(seen).toContain(1)
  })

  it('remonte la cause d’un refus du serveur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'Pas de clé.', reason: 'not_configured' },
          { status: 503 },
        ),
      ),
    )
    await startGeneration({
      mode: 'express',
      description: '3 jours à Lisbonne entre amis',
      startDate,
    })
    expect(getGenerationState()).toMatchObject({
      status: 'error',
      error: { reason: 'not_configured', message: 'Pas de clé.' },
    })
  })

  it('lit le code d’erreur ajouté en fin de flux', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamedResponse([
          '{"tripTitle":"x","summary":"y","days":[',
          `${STREAM_ERROR_MARKER}overloaded`,
        ]),
      ),
    )
    await startGeneration({
      mode: 'express',
      description: '3 jours à Lisbonne entre amis',
      startDate,
    })
    expect(getGenerationState().error?.reason).toBe('overloaded')
  })
})
