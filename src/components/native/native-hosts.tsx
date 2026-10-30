'use client'

import { useEffect } from 'react'
import { notifyNativeReady, withdrawNativeReady } from '@/lib/native-app'
import { NativeFileImportHost } from './native-file-import-host'
import { NativeNavigationHost } from './native-navigation-host'

/**
 * Tout ce qui écoute l'app native une fois la page prête : fichiers ouverts
 * avec TripBrain, liens et rappels à ouvrir, retour au premier plan.
 *
 * Monté par la page d'accueil quand l'état local est chargé, dans les
 * fournisseurs du voyage et de la navigation ; sans effet hors de l'app.
 */
export function NativeHosts() {
  // Les écouteurs ci-dessous sont posés pendant ce même commit : le natif peut
  // retirer le splash et envoyer ses événements. Au démontage (lien interne
  // vers le guide ou une page légale), on retire l'annonce : personne d'autre
  // n'écoute `app/navigate`.
  useEffect(() => {
    notifyNativeReady()
    return () => withdrawNativeReady()
  }, [])

  return (
    <>
      <NativeFileImportHost />
      <NativeNavigationHost />
    </>
  )
}
