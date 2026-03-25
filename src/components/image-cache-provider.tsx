'use client'

import React, { createContext, useContext } from 'react'
import {
  useImageCache,
  type ImageCacheValue,
} from '@/hooks/use-image-cache'
import type { DayItinerary } from '@/lib/itinerary-data'

const defaultValue: ImageCacheValue = {
  cachedSrcs: {},
  statuses: {},
  stats: { total: 0, cached: 0, downloading: 0, pending: 0, error: 0 },
}

const ImageCacheContext = createContext<ImageCacheValue>(defaultValue)

export function useImageCacheContext(): ImageCacheValue {
  return useContext(ImageCacheContext)
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
 * `cachedSrcs`, `statuses`, and `stats` without prop-drilling.
 */
export function ImageCacheProvider({
  itinerary,
  currentDayIndex,
  children,
}: ImageCacheProviderProps) {
  const cache = useImageCache(itinerary, currentDayIndex)
  return (
    <ImageCacheContext.Provider value={cache}>
      {children}
    </ImageCacheContext.Provider>
  )
}
