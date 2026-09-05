'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics/client'

export function PWARegister() {
  useEffect(() => {
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
    const onInstalled = () => trackEvent('pwa_installed')
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  return null
}
