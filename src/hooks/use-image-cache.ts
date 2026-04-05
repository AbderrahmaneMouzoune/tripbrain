'use client'

/**
 * ## Intelligent Image Cache for the Photo Carousel
 *
 * ### How it works
 *
 * 1. On mount (when itinerary data is loaded), all image URLs are extracted
 *    from the itinerary (day images + accommodation images) and deduplicated.
 *
 * 2. The list is sorted by priority: current day first, then upcoming days,
 *    then past days — so the most immediately relevant images are downloaded first.
 *
 * 3. Each URL is checked against IndexedDB (`tripbrain-images` / `imageCache`).
 *    Already-cached Blob objects are converted to object URLs immediately,
 *    making them available for offline display without any network request.
 *
 * 4. Uncached images are downloaded from the network in batches of 3
 *    (CONCURRENCY constant), stored as Blobs in IndexedDB, then converted
 *    to object URLs and surfaced to the UI.
 *
 * 5. Each image URL has one of four statuses:
 *    - `pending`     — not yet attempted
 *    - `downloading` — fetch in progress
 *    - `cached`      — stored in IndexedDB, object URL available
 *    - `error`       — download or storage failed
 *
 * ### Offline strategy
 *
 * - Once cached, images are served entirely from local IndexedDB blobs —
 *   no network access is required.
 * - Components should use `cachedSrcs[url] ?? url` as the `src` attribute so
 *   the image loads from network when not yet cached and from cache thereafter.
 * - On load failure (offline + not yet cached), `CachedImage` shows a visual
 *   placeholder so the UI is never broken.
 *
 * ### Deduplication
 *
 * The same image URL used by multiple days or activities is downloaded and
 * stored only once. The `Set<string>` in `getOrderedImageUrls` ensures this.
 *
 * ### Persistence
 *
 * Images are stored as Blobs in IndexedDB and survive page reloads.
 * Object URLs (blob: URIs) are re-created on each hook mount and revoked on
 * unmount to prevent memory leaks.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { DayItinerary } from '@/lib/itinerary-data'

const IMAGE_DB_NAME = 'tripbrain-images'
const IMAGE_DB_VERSION = 1
const IMAGE_STORE_NAME = 'imageCache'
const CONCURRENCY = 3

export type ImageStatus = 'pending' | 'downloading' | 'cached' | 'error'

export interface ImageCacheStats {
  total: number
  cached: number
  downloading: number
  pending: number
  error: number
}

export interface ImageCacheValue {
  /** Map of original URL → blob object URL (or undefined if not yet cached) */
  cachedSrcs: Record<string, string>
  /** Map of original URL → current download/cache status */
  statuses: Record<string, ImageStatus>
  /** Aggregate counts for UI indicators */
  stats: ImageCacheStats
  /** Re-attempt downloading all URLs that are currently in error state */
  retryErrors: () => void
  /** Re-attempt downloading a single URL that is in error state */
  retrySingle: (url: string) => void
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openImageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        db.createObjectStore(IMAGE_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getBlobFromDB(url: string): Promise<Blob | undefined> {
  try {
    const db = await openImageDB()
    return new Promise((resolve) => {
      const tx = db.transaction(IMAGE_STORE_NAME, 'readonly')
      const store = tx.objectStore(IMAGE_STORE_NAME)
      const req = store.get(url)
      req.onsuccess = () => resolve(req.result as Blob | undefined)
      req.onerror = () => resolve(undefined)
    })
  } catch {
    return undefined
  }
}

async function saveBlobToDB(url: string, blob: Blob): Promise<void> {
  const db = await openImageDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IMAGE_STORE_NAME)
    store.put(blob, url)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ─── URL extraction ───────────────────────────────────────────────────────────

/**
 * Returns all unique image URLs from the itinerary, ordered by priority:
 * current day first, then upcoming days in order, then past days in
 * reverse order. This ensures the most immediately visible images are
 * downloaded and cached first.
 */
function getOrderedImageUrls(
  itinerary: DayItinerary[],
  currentDayIndex: number,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const indices: number[] = []
  if (currentDayIndex >= 0 && currentDayIndex < itinerary.length) {
    indices.push(currentDayIndex)
  }
  for (let i = currentDayIndex + 1; i < itinerary.length; i++) indices.push(i)
  for (let i = currentDayIndex - 1; i >= 0; i--) indices.push(i)

  for (const idx of indices) {
    const day = itinerary[idx]
    if (!day) continue
    for (const img of day.images ?? []) {
      if (!seen.has(img.url)) {
        seen.add(img.url)
        result.push(img.url)
      }
    }
    for (const src of day.accommodation?.images ?? []) {
      if (!seen.has(src)) {
        seen.add(src)
        result.push(src)
      }
    }
  }

  return result
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useImageCache(
  itinerary: DayItinerary[],
  currentDayIndex: number,
): ImageCacheValue {
  const [statuses, setStatuses] = useState<Record<string, ImageStatus>>({})
  const [cachedSrcs, setCachedSrcs] = useState<Record<string, string>>({})
  const [retryKey, setRetryKey] = useState(0)

  // Keep a ref to currentDayIndex so the effect closure captures the latest
  // value when the itinerary changes, without re-running on every navigation.
  const currentDayRef = useRef(currentDayIndex)
  useEffect(() => {
    currentDayRef.current = currentDayIndex
  }, [currentDayIndex])

  // Keep a ref to statuses so the retry effect can read the latest value
  // without adding statuses as a dependency (which would cause infinite loops).
  const statusesRef = useRef(statuses)
  useEffect(() => {
    statusesRef.current = statuses
  }, [statuses])

  useEffect(() => {
    if (itinerary.length === 0) return

    const urls = getOrderedImageUrls(itinerary, currentDayRef.current)
    let cancelled = false
    // Track object URLs created in this effect so we can revoke them on cleanup
    const localObjectUrls: string[] = []

    async function run() {
      async function getBlobFromOpenDB(db: IDBDatabase, url: string): Promise<Blob | undefined> {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(IMAGE_STORE_NAME, 'readonly')
          const store = tx.objectStore(IMAGE_STORE_NAME)
          const req = store.get(url)

          req.onsuccess = () => resolve(req.result as Blob | undefined)
          req.onerror = () => reject(req.error)
        })
      }

      async function processReadQueue(db: IDBDatabase, queue: string[]): Promise<void> {
        if (cancelled || queue.length === 0) return

        const batch = queue.splice(0, CONCURRENCY)
        await Promise.all(
          batch.map(async (url) => {
            const blob = await getBlobFromOpenDB(db, url)
            if (blob) {
              const objectUrl = URL.createObjectURL(blob)
              localObjectUrls.push(objectUrl)
              initStatuses[url] = 'cached'
              initSrcs[url] = objectUrl
            } else {
              initStatuses[url] = 'pending'
            }
          })
        )

        return processReadQueue(db, queue)
      }

      // ── Phase 1: check IndexedDB for already-cached blobs ──────────────────
      const initStatuses: Record<string, ImageStatus> = {}
      const initSrcs: Record<string, string> = {}
      const db = await openImageDB()

      try {
        await processReadQueue(db, [...urls])
      } finally {
        db.close()
      }

      if (cancelled) return
      setStatuses(initStatuses)
      setCachedSrcs(initSrcs)

      // ── Phase 2: progressively download pending images ─────────────────────
      const pending = urls.filter((url) => initStatuses[url] === 'pending')

      async function downloadOne(url: string): Promise<void> {
        if (cancelled) return
        setStatuses((prev) => ({ ...prev, [url]: 'downloading' }))
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          await saveBlobToDB(url, blob)
          if (cancelled) return
          const objectUrl = URL.createObjectURL(blob)
          localObjectUrls.push(objectUrl)
          setCachedSrcs((prev) => ({ ...prev, [url]: objectUrl }))
          setStatuses((prev) => ({ ...prev, [url]: 'cached' }))
        } catch {
          if (!cancelled) {
            setStatuses((prev) => ({ ...prev, [url]: 'error' }))
          }
        }
      }

      async function processQueue(queue: string[]): Promise<void> {
        while (!cancelled && queue.length > 0) {
          const batch = queue.splice(0, CONCURRENCY)
          await Promise.all(batch.map(downloadOne))
        }
      }

      await processQueue([...pending])
    }

    run()

    return () => {
      cancelled = true
      for (const objectUrl of localObjectUrls) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // `currentDayIndex` is intentionally excluded: it only sets initial download
  // priority order. Including it would cancel all in-flight downloads and restart
  // from scratch on every day navigation — wasteful overhead. Priority is captured
  // via `currentDayRef.current` at the moment the itinerary first loads.
  }, [itinerary])

  // ── Retry effect ─────────────────────────────────────────────────────────────
  // Triggered by incrementing `retryKey`. Re-downloads all URLs in error state.
  useEffect(() => {
    if (retryKey === 0) return

    const errorUrls = Object.entries(statusesRef.current)
      .filter(([, s]) => s === 'error')
      .map(([url]) => url)

    if (errorUrls.length === 0) return

    let cancelled = false
    const localObjectUrls: string[] = []

    // Reset error URLs to pending immediately
    setStatuses((prev) => {
      const next = { ...prev }
      for (const url of errorUrls) next[url] = 'pending'
      return next
    })

    async function downloadOne(url: string): Promise<void> {
      if (cancelled) return
      setStatuses((prev) => ({ ...prev, [url]: 'downloading' }))
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        await saveBlobToDB(url, blob)
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        localObjectUrls.push(objectUrl)
        setCachedSrcs((prev) => ({ ...prev, [url]: objectUrl }))
        setStatuses((prev) => ({ ...prev, [url]: 'cached' }))
      } catch {
        if (!cancelled) {
          setStatuses((prev) => ({ ...prev, [url]: 'error' }))
        }
      }
    }

    async function processQueue(queue: string[]): Promise<void> {
      if (cancelled || queue.length === 0) return
      const batch = queue.splice(0, CONCURRENCY)
      await Promise.all(batch.map(downloadOne))
      return processQueue(queue)
    }

    processQueue([...errorUrls])

    return () => {
      cancelled = true
      for (const objectUrl of localObjectUrls) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey])

  const retryErrors = useCallback(() => {
    setRetryKey((k) => k + 1)
  }, [])

  // ── Single-URL retry ─────────────────────────────────────────────────────────
  // Allows the UI to re-download one specific image that failed, without
  // restarting all other errors.
  const [singleRetryTarget, setSingleRetryTarget] = useState<{
    url: string
    nonce: number
  } | null>(null)

  useEffect(() => {
    if (!singleRetryTarget) return
    const { url } = singleRetryTarget
    let cancelled = false
    const localObjectUrls: string[] = []

    setStatuses((prev) => ({ ...prev, [url]: 'pending' }))

    async function downloadOne(): Promise<void> {
      if (cancelled) return
      setStatuses((prev) => ({ ...prev, [url]: 'downloading' }))
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        await saveBlobToDB(url, blob)
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        localObjectUrls.push(objectUrl)
        setCachedSrcs((prev) => ({ ...prev, [url]: objectUrl }))
        setStatuses((prev) => ({ ...prev, [url]: 'cached' }))
      } catch {
        if (!cancelled) {
          setStatuses((prev) => ({ ...prev, [url]: 'error' }))
        }
      }
    }

    downloadOne()

    return () => {
      cancelled = true
      for (const objectUrl of localObjectUrls) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleRetryTarget])

  const retrySingle = useCallback((url: string) => {
    setSingleRetryTarget((prev) => ({ url, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  const stats: ImageCacheStats = {
    total: Object.keys(statuses).length,
    cached: Object.values(statuses).filter((s) => s === 'cached').length,
    downloading: Object.values(statuses).filter((s) => s === 'downloading')
      .length,
    pending: Object.values(statuses).filter((s) => s === 'pending').length,
    error: Object.values(statuses).filter((s) => s === 'error').length,
  }

  return { statuses, cachedSrcs, stats, retryErrors, retrySingle }
}
