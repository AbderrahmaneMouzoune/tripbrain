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

describe('parseBridgeRequest — fonctions natives', () => {
  it('lit un retour haptique et rejette une sorte inconnue', () => {
    expect(
      parseBridgeRequest(
        JSON.stringify({ type: 'haptic/trigger', payload: { kind: 'impact' } }),
      ),
    ).toEqual({
      id: undefined,
      type: 'haptic/trigger',
      payload: { kind: 'impact' },
    })
    expect(
      parseBridgeRequest(
        JSON.stringify({ type: 'haptic/trigger', payload: { kind: 'boom' } }),
      ),
    ).toBeNull()
  })

  it('accepte les requêtes sans payload', () => {
    expect(
      parseBridgeRequest(JSON.stringify({ id: '7', type: 'qr/scan' })),
    ).toEqual({
      id: '7',
      type: 'qr/scan',
      payload: {},
    })
    expect(
      parseBridgeRequest(JSON.stringify({ type: 'app/openSettings' })),
    ).toEqual({
      id: undefined,
      type: 'app/openSettings',
      payload: {},
    })
  })

  it('garde les rappels bien formés et écarte les autres', () => {
    const request = parseBridgeRequest(
      JSON.stringify({
        id: '1',
        type: 'notifications/sync',
        payload: {
          reminders: [
            { id: 'transport-1', title: 'Train', at: '2026-05-12T06:53:00' },
            { id: 'x', title: 'Sans date' },
            'bruit',
          ],
        },
      }),
    )
    expect(request).toEqual({
      id: '1',
      type: 'notifications/sync',
      payload: {
        reminders: [
          {
            id: 'transport-1',
            title: 'Train',
            body: undefined,
            at: '2026-05-12T06:53:00',
            path: undefined,
          },
        ],
      },
    })
    expect(
      parseBridgeRequest(
        JSON.stringify({
          type: 'notifications/sync',
          payload: { reminders: 'x' },
        }),
      ),
    ).toBeNull()
  })

  it('lit les événements de calendrier', () => {
    expect(
      parseBridgeRequest(
        JSON.stringify({
          type: 'calendar/add',
          payload: {
            events: [
              {
                title: 'Jour 1 – Tachkent',
                date: '2026-05-10',
                location: 'Tachkent',
              },
            ],
          },
        }),
      ),
    ).toEqual({
      id: undefined,
      type: 'calendar/add',
      payload: {
        events: [
          {
            title: 'Jour 1 – Tachkent',
            date: '2026-05-10',
            endDate: undefined,
            location: 'Tachkent',
            notes: undefined,
          },
        ],
      },
    })
  })
})
