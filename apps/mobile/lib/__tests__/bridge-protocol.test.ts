import { describe, expect, it } from 'vitest'
import {
  BRIDGE_RESPONSE_EVENT,
  buildBridgeResponseScript,
  buildInjectedGlobalsScript,
  parseBridgeRequest,
} from '../bridge-protocol'

describe('parseBridgeRequest', () => {
  it('lit une demande de partage de lien', () => {
    expect(
      parseBridgeRequest(
        JSON.stringify({
          id: '1',
          type: 'share/link',
          payload: { title: 'Voyage', url: 'https://app.tripbrain.fr/s/1' },
        }),
      ),
    ).toEqual({
      id: '1',
      type: 'share/link',
      payload: {
        title: 'Voyage',
        text: undefined,
        url: 'https://app.tripbrain.fr/s/1',
      },
    })
  })

  it('lit une demande de partage de fichier', () => {
    expect(
      parseBridgeRequest(
        JSON.stringify({
          id: '2',
          type: 'file/share',
          payload: {
            name: 'trip.json',
            mimeType: 'application/json',
            base64: 'e30=',
          },
        }),
      ),
    ).toEqual({
      id: '2',
      type: 'file/share',
      payload: {
        name: 'trip.json',
        mimeType: 'application/json',
        base64: 'e30=',
      },
    })
  })

  it('ignore le bruit et les demandes incomplètes', () => {
    expect(parseBridgeRequest('pas du json')).toBeNull()
    expect(parseBridgeRequest('42')).toBeNull()
    expect(parseBridgeRequest(JSON.stringify({ type: 'inconnu' }))).toBeNull()
    expect(
      parseBridgeRequest(JSON.stringify({ type: 'share/link', payload: {} })),
    ).toBeNull()
    expect(
      parseBridgeRequest(
        JSON.stringify({ type: 'file/share', payload: { name: 'x' } }),
      ),
    ).toBeNull()
    expect(
      parseBridgeRequest(
        JSON.stringify({ id: 3, type: 'share/link', payload: { url: 'x' } }),
      ),
    ).toBeNull()
  })
})

describe('scripts injectés', () => {
  it('répond par un CustomEvent et termine par true', () => {
    const script = buildBridgeResponseScript({
      id: '1',
      type: 'share/result',
      payload: { outcome: 'shared' },
    })
    expect(script).toContain(`"${BRIDGE_RESPONSE_EVENT}"`)
    expect(script).toContain('"outcome":"shared"')
    expect(script.trim().endsWith('true;')).toBe(true)
  })

  it('expose la plateforme et la version à la page', () => {
    expect(
      buildInjectedGlobalsScript({ platform: 'ios', appVersion: '1.0.0' }),
    ).toBe(
      'window.TripBrainNative = {"platform":"ios","appVersion":"1.0.0"}; true;',
    )
  })
})
