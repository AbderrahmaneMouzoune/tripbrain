'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  subscribePreferences,
  writePreferences,
  type Preferences,
} from '@/lib/preferences'

/** Réglages de l'appareil, synchronisés entre tous les composants qui les lisent. */
export function usePreferences() {
  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES)

  useEffect(() => {
    setPreferences(readPreferences())
    return subscribePreferences(setPreferences)
  }, [])

  const update = useCallback((patch: Partial<Preferences>) => {
    writePreferences({ ...readPreferences(), ...patch })
  }, [])

  /** Une astuce contextuelle est-elle encore à montrer ? */
  const shouldShowTip = useCallback(
    (id: string) =>
      !preferences.tipsDismissed && !preferences.tipsSeen.includes(id),
    [preferences],
  )

  const markTipSeen = useCallback((id: string) => {
    const current = readPreferences()
    if (current.tipsSeen.includes(id)) return
    writePreferences({ ...current, tipsSeen: [...current.tipsSeen, id] })
  }, [])

  return { preferences, update, shouldShowTip, markTipSeen }
}
