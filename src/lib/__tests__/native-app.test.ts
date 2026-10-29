import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  getNativeApp,
  shareLinkNatively,
  syncNativeReminders,
  getNativeNotificationPermission,
} from '../native-app'

/** Simule la WebView de l'app : global injecté + bridge qui répond. */
function installNativeWindow(
  reply: (request: { id: string; type: string }) => unknown,
) {
  const target = new EventTarget()
  const win = Object.assign(target, {
    TripBrainNative: { platform: 'ios', appVersion: '1.0.0' },
    ReactNativeWebView: {
      postMessage: (raw: string) => {
        const request = JSON.parse(raw)
        const detail = reply(request)
        if (detail) {
          queueMicrotask(() =>
            target.dispatchEvent(
              new CustomEvent('tripbrain:native-response', {
                detail: { id: request.id, ...detail },
              }),
            ),
          )
        }
      },
    },
  })
  vi.stubGlobal('window', win)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('native-app', () => {
  it('ne voit pas d’app native dans un navigateur', () => {
    expect(getNativeApp()).toBeNull()
  })

  it('compare les versions x.y.z', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0)
    expect(compareVersions('2.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('partage un lien par le bridge et lit la réponse', async () => {
    installNativeWindow((request) =>
      request.type === 'share/link'
        ? { type: 'share/result', payload: { outcome: 'shared' } }
        : null,
    )
    expect(getNativeApp()).toEqual({ platform: 'ios', appVersion: '1.0.0' })
    await expect(
      shareLinkNatively({ url: 'https://app.tripbrain.fr/s/1234' }),
    ).resolves.toBe('shared')
  })

  it('retient l’autorisation renvoyée par la synchronisation des rappels', async () => {
    installNativeWindow((request) =>
      request.type === 'notifications/sync'
        ? {
            type: 'notifications/state',
            payload: { permission: 'denied', scheduled: 0 },
          }
        : null,
    )
    await syncNativeReminders([
      { id: 'a', title: 'Demain', at: '2026-11-01T19:00:00.000Z' },
    ])
    expect(getNativeNotificationPermission()).toBe('denied')
  })
})
