'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics/client'
import { hasTripFromTemplate } from '@/lib/trips'
import { readAllTrips } from '@/lib/trips-db'

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
  // d'une PWA : c'est le seul moment où le navigateur nous le dit. On y joint
  // la présence d'un voyage repris d'un modèle (installations venant d'un
  // lien modèle, spec des modèles §8) ; ce composant vit hors de
  // `TripProvider`, d'où la lecture directe des voyages enregistrés. Une
  // lecture impossible ne fait pas perdre l'installation : elle compte alors
  // comme hors modèle.
  useEffect(() => {
    const onInstalled = () => {
      readAllTrips()
        .then(hasTripFromTemplate, () => false)
        .then((fromTemplate) => {
          trackEvent('pwa_installed', { from_template: fromTemplate })
        })
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  return null
}
