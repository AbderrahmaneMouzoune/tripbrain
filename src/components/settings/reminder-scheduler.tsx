'use client'

import { useEffect, useMemo } from 'react'
import { useTrip } from '@/components/app/trip-provider'
import { usePreferences } from '@/hooks/use-preferences'
import { trackEvent } from '@/lib/analytics/client'
import {
  computeReminders,
  markReminderSent,
  planReminders,
  readSentReminders,
  type Reminder,
} from '@/lib/reminders'

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
 * check-in) tant que l'application est ouverte.
 *
 * Limite : sans application native ni push serveur, un `setTimeout` ne survit
 * pas à la fermeture de l'onglet, et le système suspend vite une page en
 * arrière-plan. Les rappels ne partent donc que si TripBrain est ouvert ou l'a
 * été très récemment. Voir `@/lib/reminders` pour le détail du calcul.
 */
export function ReminderScheduler() {
  const { itinerary } = useTrip()
  const { preferences } = usePreferences()
  const { notifyTransportEve, notifyMorning, notifyCheckIn } = preferences

  const reminders = useMemo(
    () =>
      computeReminders(itinerary, {
        notifyTransportEve,
        notifyMorning,
        notifyCheckIn,
      }),
    [itinerary, notifyTransportEve, notifyMorning, notifyCheckIn],
  )

  useEffect(() => {
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
