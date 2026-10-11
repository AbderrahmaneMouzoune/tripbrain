'use client'

import { useMemo } from 'react'
import { useImageCacheStats } from '@/components/image-cache-provider'
import type { DayItinerary } from '@/lib/itinerary-data'

/** Toutes les photos d'un voyage (étapes et hébergements), sans doublon. */
export function tripImageUrls(itinerary: readonly DayItinerary[]): string[] {
  const urls = new Set<string>()
  for (const day of itinerary) {
    for (const image of day.images ?? []) if (image.url) urls.add(image.url)
    for (const src of day.accommodation?.images ?? []) if (src) urls.add(src)
  }
  return [...urls]
}

export interface OfflineProgress {
  /** Photos que le voyage contient. */
  total: number
  cached: number
  /** `null` tant que le cache n'a pas encore fait son premier inventaire. */
  ready: boolean | null
  /** Téléchargement suspendu jusqu'au Wi-Fi (réglage de l'appareil). */
  waitingForWifi: boolean
}

/**
 * Où en est la mise en cache des photos du voyage.
 *
 * Le téléchargement est l'affaire d'`ImageCacheProvider`, monté avec les
 * onglets ; cet écran s'affiche au-dessus, hors de son arbre, et lit ses
 * chiffres par le relais `useImageCacheStats`. Le nombre de photos attendues
 * vient du voyage lui-même : tant que le cache n'a pas fini son inventaire, on
 * n'annonce rien plutôt qu'un faux 0 %.
 */
export function useOfflineImageProgress(
  itinerary: readonly DayItinerary[],
): OfflineProgress {
  const expected = useMemo(() => tripImageUrls(itinerary).length, [itinerary])
  const { stats, paused } = useImageCacheStats()
  const counted = stats.total > 0
  const total = counted ? stats.total : expected
  const cached = counted ? stats.cached : 0
  return {
    total,
    cached,
    ready: total === 0 ? true : counted ? cached >= total : null,
    waitingForWifi: paused === 'waiting-for-wifi',
  }
}
