import { afterEach, describe, expect, it, vi } from 'vitest'
import { IOS_BACK_EDGE_PX, startsInBackEdge } from '@/hooks/use-swipe'
import {
  LIGHTBOX_DISMISS_PX,
  LIGHTBOX_PIN_MS,
  shouldDismissLightbox,
  shouldRepinLightboxPhoto,
} from '@/components/lightbox'
import {
  BACKGROUND_INTERRUPTED_MESSAGE,
  failureMessage,
  getGenerationState,
  resetGeneration,
  startGeneration,
} from '@/lib/generator/generation-store'
import { FAILURE_MESSAGES } from '@/lib/generator/errors'
import { addDays, todayIso } from '@/lib/generator/itinerary-quality'

afterEach(() => {
  resetGeneration()
  vi.unstubAllGlobals()
})

describe('balayage des journées', () => {
  it('laisse le bord gauche au retour système dans l’app iOS', () => {
    expect(startsInBackEdge(10, 'ios')).toBe(true)
    expect(startsInBackEdge(IOS_BACK_EDGE_PX, 'ios')).toBe(false)
  })

  it('ne change rien sur Android ni sur le web', () => {
    expect(startsInBackEdge(10, 'android')).toBe(false)
    expect(startsInBackEdge(10, undefined)).toBe(false)
  })
})

describe('galerie : glisser vers le bas pour fermer', () => {
  it('ferme sur un glissement franc vers le bas commencé en haut', () => {
    expect(shouldDismissLightbox(10, LIGHTBOX_DISMISS_PX + 1, true)).toBe(true)
  })

  it('ignore un défilement, un geste court ou trop latéral', () => {
    expect(shouldDismissLightbox(0, 200, false)).toBe(false)
    expect(shouldDismissLightbox(0, LIGHTBOX_DISMISS_PX - 1, true)).toBe(false)
    expect(shouldDismissLightbox(250, 200, true)).toBe(false)
    expect(shouldDismissLightbox(0, -200, true)).toBe(false)
  })
})

describe('galerie : ouverture sur la photo touchée', () => {
  it('replace la photo tant que les photos au-dessus se chargent', () => {
    expect(shouldRepinLightboxPhoto(false, 0)).toBe(true)
    expect(shouldRepinLightboxPhoto(false, LIGHTBOX_PIN_MS - 1)).toBe(true)
  })

  it("laisse la main dès que l'utilisateur défile, ou passé le délai", () => {
    expect(shouldRepinLightboxPhoto(true, 10)).toBe(false)
    expect(shouldRepinLightboxPhoto(false, LIGHTBOX_PIN_MS)).toBe(false)
  })
})

describe('génération interrompue par l’arrière-plan', () => {
  it('nomme la cause dans l’app après un passage en arrière-plan', () => {
    expect(failureMessage('network', { native: true, wentHidden: true })).toBe(
      BACKGROUND_INTERRUPTED_MESSAGE,
    )
  })

  it('garde le message habituel sinon', () => {
    expect(failureMessage('network', { native: false, wentHidden: true })).toBe(
      FAILURE_MESSAGES.network,
    )
    expect(failureMessage('network', { native: true, wentHidden: false })).toBe(
      FAILURE_MESSAGES.network,
    )
    expect(
      failureMessage('overloaded', { native: true, wentHidden: true }),
    ).toBe(FAILURE_MESSAGES.overloaded)
  })

  it('garde l’écran allumé pendant la génération, puis le libère', async () => {
    const posted: { type: string; payload: unknown }[] = []
    const listeners = new Map<string, () => void>()
    const doc = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', {
      TripBrainNative: {
        platform: 'ios',
        appVersion: '2.0.0',
        capabilities: ['haptic/trigger', 'keepAwake/set'],
      },
      ReactNativeWebView: {
        postMessage: (raw: string) => posted.push(JSON.parse(raw)),
      },
    })
    // La requête échoue après un passage en arrière-plan de l'app.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        doc.visibilityState = 'hidden'
        listeners.get('visibilitychange')?.()
        doc.visibilityState = 'visible'
        throw new TypeError('Load failed')
      }),
    )

    await startGeneration({
      mode: 'express',
      description: '3 jours à Lisbonne entre amis',
      startDate: addDays(todayIso(), 10),
      durationDays: 3,
    })

    const keepAwake = posted.filter(
      (message) => message.type === 'keepAwake/set',
    )
    expect(keepAwake.map((message) => message.payload)).toEqual([
      { active: true },
      { active: false },
    ])
    const state = getGenerationState()
    expect(state.status).toBe('error')
    expect(state.error?.reason).toBe('network')
    expect(state.error?.message).toBe(BACKGROUND_INTERRUPTED_MESSAGE)
    expect(listeners.has('visibilitychange')).toBe(false)
  })
})
