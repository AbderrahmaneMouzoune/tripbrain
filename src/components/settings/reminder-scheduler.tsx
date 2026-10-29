'use client'

import { useEffect, useMemo } from 'react'
import { useTrip } from '@/components/app/trip-provider'
import { usePreferences } from '@/hooks/use-preferences'
import { trackEvent } from '@/lib/analytics/client'
import {
  computeAllReminders,
  markReminderSent,
  migrateSentReminders,
  planReminders,
  readSentReminders,
  type Reminder,
} from '@/lib/reminders'
import { isNativeApp, syncNativeReminders } from '@/lib/native-app'

/** Le plan est refait régulièrement : veille de l'appareil, horloge qui saute… */
const REPLAN_INTERVAL_MS = 30 * 60 * 1000

const KIND_EVENT = {
  'transport-eve': 'transport_eve',
  morning: 'morning',
  'check-in': 'check_in',
} as const

/**
 * Affiche une notification système. Le service worker est préféré : sur
 * Android, `new Notification()` est refusé depuis une page. On ne l'attend
 * que quelques secondes, au cas où aucun ne serait enregistré.
 */
async function showNotification(reminder: Reminder): Promise<void> {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  const options: NotificationOptions = {
    body: reminder.body,
    tag: reminder.id,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  }
  try {
    if ('serviceWorker' in navigator) {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ])
      if (registration) {
        await registration.showNotification(reminder.title, options)
        return
      }
    }
    new Notification(reminder.title, options)
  } catch {
    // Notification refusée par le système : rien d'autre à tenter.
  }
}

function deliver(reminder: Reminder) {
  // Relu au dernier moment : un autre onglet l'a peut-être déjà envoyé.
  if (readSentReminders().has(reminder.id)) return
  markReminderSent(reminder.id)
  void showNotification(reminder)
  trackEvent('reminder_shown', { kind: KIND_EVENT[reminder.kind] })
}

/**
 * Programme les rappels locaux (veille d'un trajet, programme du matin,
 * check-in) de tous les voyages, tant que l'application est ouverte.
 *
 * Dans le navigateur, sans push serveur, un `setTimeout` ne survit
 * pas à la fermeture de l'onglet, et le système suspend vite une page en
 * arrière-plan. Les rappels ne partent donc que si TripBrain est ouvert ou l'a
 * été très récemment. Voir `@/lib/reminders` pour le détail du calcul.
 */
export function ReminderScheduler() {
  const { storedTrips, activeTripId } = useTrip()
  const { preferences } = usePreferences()
  const { notifyTransportEve, notifyMorning, notifyCheckIn } = preferences

  // Tous les voyages, pas seulement celui affiché : consulter un voyage passé
  // ne doit pas faire taire les rappels de celui en cours.
  const reminders = useMemo(
    () =>
      computeAllReminders(storedTrips, {
        notifyTransportEve,
        notifyMorning,
        notifyCheckIn,
      }),
    [storedTrips, notifyTransportEve, notifyMorning, notifyCheckIn],
  )

  // Les rappels envoyés avant les voyages multiples venaient du voyage
  // affiché : ils lui sont rattachés avant toute planification.
  useEffect(() => {
    if (activeTripId) migrateSentReminders(activeTripId)
  }, [activeTripId])

  // Dans l'app native, le téléphone planifie lui-même les rappels : ils
  // partent même app fermée. Chaque changement remplace toute la liste.
  useEffect(() => {
    if (!isNativeApp()) return
    const now = Date.now()
    void syncNativeReminders(
      reminders
        .filter((reminder) => reminder.at > now)
        .map((reminder) => ({
          id: reminder.id,
          title: reminder.title,
          body: reminder.body,
          at: new Date(reminder.at).toISOString(),
          path: '/',
        })),
    )
  }, [reminders])

  useEffect(() => {
    if (isNativeApp()) return
    if (reminders.length === 0) return
    if (typeof Notification === 'undefined') return

    let timers: ReturnType<typeof setTimeout>[] = []
    const clear = () => {
      for (const timer of timers) clearTimeout(timer)
      timers = []
    }

    const plan = () => {
      clear()
      // Sans autorisation, rien n'est marqué comme envoyé : si elle arrive
      // plus tard, les rappels à venir partiront normalement.
      if (Notification.permission !== 'granted') return
      const now = Date.now()
      const { now: immediate, later } = planReminders(
        reminders,
        now,
        readSentReminders(),
      )
      for (const reminder of immediate) deliver(reminder)
      for (const reminder of later) {
        timers.push(
          setTimeout(() => deliver(reminder), Math.max(0, reminder.at - now)),
        )
      }
    }

    plan()
    const interval = setInterval(plan, REPLAN_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') plan()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clear()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reminders])

  return null
}
