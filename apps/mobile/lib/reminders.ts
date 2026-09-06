import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import type { NotificationPermission, ReminderPayload } from './bridge-protocol'

// ─── Rappels locaux ───────────────────────────────────────────────────────────
//
// La webapp connaît les heures de départ et les check-out ; le téléphone les
// rappelle de lui-même, sans serveur ni token. À chaque synchronisation, tout
// est replanifié : les rappels sont recalculés dans le fuseau horaire courant
// de l'appareil, ce qui compte quand on change de pays.

const CHANNEL_ID = 'voyage'

/** iOS refuse au-delà de 64 notifications planifiées ; on garde de la marge. */
const MAX_SCHEDULED = 60

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Rappels du voyage',
    description: 'Départs de transports et check-out des hébergements',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2268c7',
  })
}

function mapPermission(
  response: Notifications.NotificationPermissionsStatus,
): NotificationPermission {
  if (response.status === Notifications.PermissionStatus.GRANTED) {
    return 'granted'
  }
  if (response.status === Notifications.PermissionStatus.DENIED) {
    return response.canAskAgain ? 'undetermined' : 'denied'
  }
  return 'undetermined'
}

/** Demande la permission au moment où il y a quelque chose à rappeler. */
async function requestPermission(): Promise<NotificationPermission> {
  if (!Device.isDevice) return 'unsupported'
  const current = await Notifications.getPermissionsAsync()
  if (current.status === Notifications.PermissionStatus.GRANTED) {
    return 'granted'
  }
  if (!current.canAskAgain) return 'denied'
  return mapPermission(await Notifications.requestPermissionsAsync())
}

/**
 * Remplace tous les rappels planifiés par ceux envoyés par la webapp.
 * Les échéances passées sont ignorées ; les plus proches passent en premier
 * si la liste dépasse ce que l'OS accepte.
 */
export async function syncReminders(
  reminders: ReminderPayload[],
): Promise<{ permission: NotificationPermission; scheduled: number }> {
  await ensureAndroidChannel()

  // Une liste vide (voyage effacé) ne mérite pas de demander la permission.
  const permission =
    reminders.length === 0
      ? mapPermission(await Notifications.getPermissionsAsync())
      : await requestPermission()

  if (permission !== 'granted') {
    return { permission, scheduled: 0 }
  }

  await Notifications.cancelAllScheduledNotificationsAsync()

  const now = Date.now()
  const upcoming = reminders
    .map((reminder) => ({ reminder, date: new Date(reminder.at) }))
    .filter(({ date }) => !Number.isNaN(date.getTime()) && date.getTime() > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_SCHEDULED)

  let scheduled = 0
  for (const { reminder, date } of upcoming) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: {
          title: reminder.title,
          body: reminder.body,
          data: { path: reminder.path ?? '/' },
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      })
      scheduled++
    } catch (error) {
      console.warn('[Rappels] planification impossible', reminder.id, error)
    }
  }

  return { permission, scheduled }
}
