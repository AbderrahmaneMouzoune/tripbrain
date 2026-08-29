'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  detectInstallTarget,
  getInstallGuide,
  type InstallGuide,
  type InstallTarget,
} from '@/lib/pwa-install'

/** Invite native d'installation, encore absente des types DOM standard. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
    appinstalled: Event
  }
}

const DISMISS_KEY = 'tripbrain-install-dismissed-at'
/** Délai avant de reproposer l'installation après un « Plus tard ». */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable'

// ── État partagé ─────────────────────────────────────────────────────────────
//
// `beforeinstallprompt` n'est émis qu'une fois, avant que la bannière ou le
// guide ne soient forcément montés. L'événement est donc capté au niveau du
// module, et tous les appelants du hook lisent le même état.

let deferredPrompt: BeforeInstallPromptEvent | null = null
let isInstalledFlag = false
let listenersAttached = false
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function attachListeners() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true

  window.addEventListener('beforeinstallprompt', (event) => {
    // Sans `preventDefault`, Chrome affiche sa propre mini-barre et l'événement
    // n'est plus rejouable : on le garde pour notre bouton « Installer ».
    event.preventDefault()
    deferredPrompt = event
    notify()
  })

  window.addEventListener('appinstalled', () => {
    isInstalledFlag = true
    deferredPrompt = null
    notify()
  })
}

function subscribe(onStoreChange: () => void) {
  attachListeners()
  subscribers.add(onStoreChange)
  return () => {
    subscribers.delete(onStoreChange)
  }
}

const getCanPrompt = () => deferredPrompt !== null
const getIsInstalled = () => isInstalledFlag
const getFalse = () => false

// ── Aides locales ────────────────────────────────────────────────────────────

function readSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < SNOOZE_MS
  } catch {
    // Mode privé ou stockage bloqué : l'invite est considérée jamais reportée.
    return false
  }
}

function isDisplayStandalone(): boolean {
  const byDisplayMode = ['standalone', 'minimal-ui', 'fullscreen'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  )
  // Safari iOS n'implémente pas `display-mode` et expose son propre drapeau.
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return byDisplayMode || iosStandalone
}

export interface PwaInstall {
  /** `false` tant que le composant n'est pas monté (détection côté client). */
  isReady: boolean
  target: InstallTarget | null
  guide: InstallGuide | null
  /** L'app tourne déjà en mode application (lancée depuis son icône). */
  isStandalone: boolean
  /** Installation confirmée par le navigateur pendant cette visite. */
  isInstalled: boolean
  /** Une invite native est disponible : `promptInstall` peut l'ouvrir. */
  canPrompt: boolean
  promptInstall: () => Promise<PromptOutcome>
  /** L'utilisateur a repoussé la proposition il y a moins de 14 jours. */
  isSnoozed: boolean
  snooze: () => void
}

/**
 * Rassemble tout ce qu'il faut pour proposer l'installation : état
 * d'installation, invite native quand le navigateur en offre une, et fiche
 * d'étapes manuelles pour les autres.
 */
export function usePwaInstall(): PwaInstall {
  const [isReady, setIsReady] = useState(false)
  const [target, setTarget] = useState<InstallTarget | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isSnoozed, setIsSnoozed] = useState(false)

  const canPrompt = useSyncExternalStore(subscribe, getCanPrompt, getFalse)
  const isInstalled = useSyncExternalStore(subscribe, getIsInstalled, getFalse)

  useEffect(() => {
    setTarget(
      detectInstallTarget(navigator.userAgent, {
        maxTouchPoints: navigator.maxTouchPoints,
      }),
    )
    setIsStandalone(isDisplayStandalone())
    setIsSnoozed(readSnoozed())
    setIsReady(true)

    const displayQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayChange = () => setIsStandalone(isDisplayStandalone())
    displayQuery.addEventListener('change', handleDisplayChange)

    return () => displayQuery.removeEventListener('change', handleDisplayChange)
  }, [])

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    const prompt = deferredPrompt
    if (!prompt) return 'unavailable'

    // L'invite native n'est utilisable qu'une fois ; le navigateur en émettra
    // une nouvelle si l'utilisateur a refusé.
    deferredPrompt = null
    notify()

    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        isInstalledFlag = true
        notify()
      }
      return outcome
    } catch {
      return 'unavailable'
    }
  }, [])

  const snooze = useCallback(() => {
    setIsSnoozed(true)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Stockage indisponible : le report ne vaut que pour cette session.
    }
  }, [])

  return {
    isReady,
    target,
    guide: target ? getInstallGuide(target.family, target.browser) : null,
    isStandalone,
    isInstalled,
    canPrompt,
    promptInstall,
    isSnoozed,
    snooze,
  }
}
