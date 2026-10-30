'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTrip } from '@/components/app/trip-provider'
import { usePreferences } from '@/hooks/use-preferences'
import { computeAllReminders, toNativeReminders } from '@/lib/reminders'
import {
  NATIVE_PERMISSION_EVENT,
  getNativeNotificationPermission,
  hasAskedNativeNotifications,
  isNativeApp,
  setPendingNativeReminders,
  syncNativeReminders,
} from '@/lib/native-app'
import { onAppResume } from './app-resume'

/** Sans réponse du natif passé ce délai, la file passe à la suite. */
const SYNC_WAIT_MS = 20_000

/**
 * Confie au téléphone les rappels de tous les voyages : il les planifie
 * lui-même, ils partent même app fermée.
 *
 * Monté en permanence dans l'app (pas seulement quand un voyage est ouvert) :
 * le dernier voyage supprimé, la liste vide efface les rappels planifiés.
 *
 * - Pas de demande d'autorisation sans geste : tant que l'utilisateur n'a pas
 *   demandé les rappels et que l'autorisation n'est pas connue comme accordée,
 *   on envoie une liste vide, qui lit l'autorisation sans la demander.
 * - Avec l'autorisation, une liste vide annule tout : elle est aussitôt suivie
 *   de la liste complète.
 * - Rien n'est renvoyé si la liste n'a pas changé, sauf au retour dans l'app
 *   (fuseau ou autorisation peut-être changés entre-temps).
 * - Le voyage d'exemple n'a pas de rappels sur le téléphone.
 */
export function NativeReminderSync() {
  const { storedTrips } = useTrip()
  const { preferences } = usePreferences()
  const { notifyTransportEve, notifyMorning, notifyCheckIn } = preferences

  const reminders = useMemo(
    () =>
      computeAllReminders(
        storedTrips.filter((trip) => !trip.isDemo),
        { notifyTransportEve, notifyMorning, notifyCheckIn },
      ),
    [storedTrips, notifyTransportEve, notifyMorning, notifyCheckIn],
  )

  const remindersRef = useRef(reminders)
  const lastKeyRef = useRef<string | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  /** Une synchronisation à la fois, dans l'ordre des demandes. */
  const sync = useCallback((force: boolean) => {
    const send = async (list: ReturnType<typeof toNativeReminders>) => {
      lastKeyRef.current = JSON.stringify(list)
      const state = await Promise.race([
        syncNativeReminders(list),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), SYNC_WAIT_MS),
        ),
      ])
      // Sans réponse, la prochaine occasion renverra la liste.
      if (!state) lastKeyRef.current = null
      return state
    }

    queueRef.current = queueRef.current
      .then(async () => {
        if (!isNativeApp()) return
        const upcoming = toNativeReminders(remindersRef.current, Date.now())
        // Liste complète gardée pour la demande d'autorisation : c'est elle
        // qui fait apparaître l'invite du système.
        setPendingNativeReminders(upcoming)
        const allowed =
          hasAskedNativeNotifications() ||
          getNativeNotificationPermission() === 'granted'
        const list = allowed ? upcoming : []
        if (!force && JSON.stringify(list) === lastKeyRef.current) return
        const state = await send(list)
        // La liste vide vient d'annuler les rappels planifiés : l'autorisation
        // étant accordée, on renvoie aussitôt la liste complète.
        if (
          list.length === 0 &&
          upcoming.length > 0 &&
          state?.permission === 'granted'
        ) {
          await send(toNativeReminders(remindersRef.current, Date.now()))
        }
      })
      .catch(() => {
        lastKeyRef.current = null
      })
  }, [])

  useEffect(() => {
    remindersRef.current = reminders
    sync(false)
  }, [reminders, sync])

  useEffect(() => {
    if (!isNativeApp()) return
    // Après « Autoriser » (la demande passe par une synchronisation), la liste
    // complète part ; nos propres synchronisations retombent sur la même clé.
    const onPermission = () => sync(false)
    window.addEventListener(NATIVE_PERMISSION_EVENT, onPermission)
    const unsubscribe = onAppResume(() => sync(true))
    return () => {
      window.removeEventListener(NATIVE_PERMISSION_EVENT, onPermission)
      unsubscribe()
    }
  }, [sync])

  return null
}
