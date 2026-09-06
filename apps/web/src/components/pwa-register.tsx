'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics/client'
import { isNativeApp } from '@/lib/native-app'

export function PWARegister() {
  // Dans l'app native, la page est déjà « installée » : ni service worker,
  // ni suivi d'installation — le hors ligne y est l'affaire de l'app.
  useEffect(() => {
    if (isNativeApp()) return
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('Service Worker registered:', registration.scope)
        },
        (error) => {
          console.log('Service Worker registration failed:', error)
        },
      )
    }
  }, [])

  // L'installation sur l'écran d'accueil est le signal le plus net d'adoption
  // d'une PWA : c'est le seul moment où le navigateur nous le dit.
  useEffect(() => {
    if (isNativeApp()) return
    const onInstalled = () => trackEvent('pwa_installed')
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  return null
}
