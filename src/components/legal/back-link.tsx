'use client'

/**
 * « Retour » des pages hors de l'app (légales, guide) : revient à l'écran
 * d'où l'on vient — Réglages, menu, import — au lieu de relancer l'app à la
 * racine. Ouverte directement (lien externe, rechargement), la page n'a rien
 * derrière elle dans TripBrain : le lien vers `/` reprend la main.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * La page a-t-elle été atteinte par une navigation interne ? Le document
 * chargé au départ porte une autre adresse que la page affichée : reculer
 * dans l'historique reste alors dans TripBrain.
 */
function cameFromInsideApp(): boolean {
  try {
    if (window.history.length <= 1) return false
    const [entry] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[]
    if (!entry) return false
    return new URL(entry.name).href !== window.location.href
  } catch {
    return false
  }
}

export function BackLink() {
  const router = useRouter()

  return (
    <Link
      href="/"
      onClick={(event) => {
        if (!cameFromInsideApp()) return
        event.preventDefault()
        router.back()
      }}
      className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      Retour
    </Link>
  )
}
