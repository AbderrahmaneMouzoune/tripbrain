const CACHE_NAME = 'tripbrain-v1'
const STATIC_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png']

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    }),
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
    }),
  )
  self.clients.claim()
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    // For map tiles, try network first then cache
    if (event.request.url.includes('tile.openstreetmap.org')) {
      event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
          return fetch(event.request)
            .then((response) => {
              cache.put(event.request, response.clone())
              return response
            })
            .catch(() => {
              return cache.match(event.request)
            })
        }),
      )
    }
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response and fetch update in background
        event.waitUntil(
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, response)
                })
              }
            })
            .catch(() => {}),
        )
        return cachedResponse
      }

      // Not in cache, fetch from network
      return fetch(event.request).then((response) => {
        if (!response.ok) return response

        // Cache successful responses
        const responseToCache = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache)
        })

        return response
      })
    }),
  )
})
