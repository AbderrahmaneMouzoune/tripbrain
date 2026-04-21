---
applyTo: "**/\*.tsx,**/_.ts,\*\*/_.css"
description: "Performance optimization guidelines for TripBrain"

---

# Performance Guidelines

Apply the repository-wide guidance from `../copilot-instructions.md` to all code.

## Bundle Size

- Keep the client bundle small — this is a PWA that must work offline
- Use dynamic imports (`React.lazy()`) for heavy components like the map overlay (Leaflet)
- Avoid importing entire libraries — prefer tree-shakeable imports
- Monitor bundle size impact when adding dependencies

## Rendering

- Avoid unnecessary re-renders: use `React.memo`, `useMemo`, `useCallback` when profiling shows a need
- Do not prematurely optimize — measure first with React DevTools Profiler
- Keep component trees shallow and focused
- Use Suspense boundaries for async loading states

## Images

- Use the image cache system (`useImageCache`) for offline-available images
- Optimize image sizes before importing into the app
- Lazy load images that are not in the viewport

## IndexedDB

- Batch IndexedDB reads/writes when possible
- Avoid blocking the main thread with large data operations
- Use transactions efficiently — group related operations

## Leaflet Map

- Load Leaflet dynamically — it is a large library
- Clean up map instances on unmount to prevent memory leaks
- Debounce map interaction handlers (pan, zoom) if triggering state updates

## CSS

- Prefer Tailwind utilities over custom CSS — smaller output with purging
- Avoid complex CSS selectors that trigger layout thrashing
- Use CSS containment for isolated sections when beneficial

## PWA / Offline

- Pre-cache critical assets in the service worker
- Keep the service worker lean — cache only what is needed
- Test offline scenarios regularly
