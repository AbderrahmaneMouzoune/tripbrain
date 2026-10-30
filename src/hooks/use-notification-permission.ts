'use client'

import { useCallback, useEffect, useState } from 'react'
import { trackEvent } from '@/lib/analytics/client'
import {
  NATIVE_PERMISSION_EVENT,
  getNativeNotificationPermission,
  isNativeApp,
  openNativeSettings,
  requestNativeNotifications,
  type NativeNotificationPermission,
} from '@/lib/native-app'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

/** L'app native dit « undetermined » là où le navigateur dit « default ». */
export function fromNativePermission(
  permission: NativeNotificationPermission | null,
): NotificationPermissionState {
  if (permission === 'granted' || permission === 'denied') return permission
  if (permission === 'unsupported') return 'unsupported'
  return 'default'
}

/** Autorisation actuelle, sans React : celle de l'app native ou du navigateur. */
export function readNotificationPermission(): NotificationPermissionState {
  if (isNativeApp()) {
    return fromNativePermission(getNativeNotificationPermission())
  }
  return typeof Notification === 'undefined'
    ? 'unsupported'
    : Notification.permission
}

/**
 * Autorisation des notifications — celle de l'app native dans l'app, celle du
 * navigateur ailleurs —, relue à chaque retour sur l'app.
 *
 * `request()` demande l'autorisation ; dans l'app, une autorisation déjà
 * refusée ouvre les réglages du système, seul endroit où la rendre.
 */
export function useNotificationPermission() {
  const [permission, setPermission] =
    useState<NotificationPermissionState>('default')

  useEffect(() => {
    const read = () => setPermission(readNotificationPermission())
    read()
    document.addEventListener('visibilitychange', read)
    window.addEventListener(NATIVE_PERMISSION_EVENT, read)
    return () => {
      document.removeEventListener('visibilitychange', read)
      window.removeEventListener(NATIVE_PERMISSION_EVENT, read)
    }
  }, [])

  const request =
    useCallback(async (): Promise<NotificationPermissionState> => {
      if (isNativeApp()) {
        // Refusée une fois, seule la page Réglages de l'app peut la rendre.
        if (getNativeNotificationPermission() === 'denied') {
          openNativeSettings()
          return 'denied'
        }
        const result = fromNativePermission(await requestNativeNotifications())
        setPermission(result)
        // « unsupported » : simulateur, sans écran de permission à mesurer.
        if (result !== 'unsupported') {
          trackEvent('notification_permission_requested', { result })
        }
        return result
      }
      if (typeof Notification === 'undefined') return 'unsupported'
      const result = await Notification.requestPermission()
      setPermission(result)
      trackEvent('notification_permission_requested', { result })
      return result
    }, [])

  return { permission, request }
}
