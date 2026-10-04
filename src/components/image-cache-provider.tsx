'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import {
  cacheState,
  useImageCache,
  type CacheState,
  type ImageCacheStats,
  type ImageCacheValue,
  type PauseReason,
} from '@/hooks/use-image-cache'
import type { DayItinerary } from '@/lib/itinerary-data'

const defaultValue: ImageCacheValue = {
  cachedSrcs: {},
  statuses: {},
  stats: { total: 0, cached: 0, downloading: 0, pending: 0, error: 0 },
  retryErrors: () => {},
  retrySingle: () => {},
  paused: null,
  connectionTypeKnown: false,
  downloadNow: () => {},
  clearCache: async () => {},
}

const ImageCacheContext = createContext<ImageCacheValue | null>(null)

/**
 * Dernière valeur publiée par le fournisseur, pour les écrans empilés : ils
 * sont rendus par `ScreenHost`, à côté de l'arbre du voyage et donc hors du
 * contexte. Sans ce relais, l'écran « Disponible hors ligne » ne verrait
 * jamais les vrais chiffres.
 */
let published: ImageCacheValue = defaultValue
const subscribers = new Set<() => void>()
function publish(value: ImageCacheValue) {
  published = value
  for (const subscriber of subscribers) subscriber()
}
function subscribe(subscriber: () => void) {
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
  }
}

export function useImageCacheContext(): ImageCacheValue {
  const context = useContext(ImageCacheContext)
  const relayed = useSyncExternalStore(
    subscribe,
    () => published,
    () => defaultValue,
  )
  return context ?? relayed
}

export interface ImageCacheStatsValue {
  stats: ImageCacheStats
  /** `complete`, `partial`, `downloading` ou `empty` (aucune image). */
  state: CacheState
  paused: PauseReason | null
}

/**
 * Résumé du cache des images pour les écrans qui n'affichent qu'un état
 * (menu du voyage, réglages, fin d'import) : nombres et état d'ensemble,
 * sans les adresses d'images.
 */
export function useImageCacheStats(): ImageCacheStatsValue {
  const { stats, paused } = useImageCacheContext()
  return useMemo(
    () => ({ stats, state: cacheState(stats), paused }),
    [stats, paused],
  )
}

interface ImageCacheProviderProps {
  itinerary: DayItinerary[]
  currentDayIndex: number
  children: React.ReactNode
}

/**
 * Provides image-cache state to the entire component tree.
 *
 * Wrap the part of the app that renders carousels and lightboxes with this
 * provider. Child components can then call `useImageCacheContext()` to access
 * `cachedSrcs`, `statuses`, and `stats` without prop-drilling. Les écrans
 * empilés, rendus hors de cet arbre, lisent la même valeur par le relais.
 */
export function ImageCacheProvider({
  itinerary,
  currentDayIndex,
  children,
}: ImageCacheProviderProps) {
  const cache = useImageCache(itinerary, currentDayIndex)
  useEffect(() => {
    publish(cache)
  }, [cache])
  useEffect(() => () => publish(defaultValue), [])
  return (
    <ImageCacheContext.Provider value={cache}>
      {children}
    </ImageCacheContext.Provider>
  )
}
