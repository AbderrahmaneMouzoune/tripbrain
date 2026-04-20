# Copilot Instructions — TripBrain

## Build, Test, Lint

```bash
bun install            # install dependencies (CI uses bun, not npm)
bun run dev            # start Next.js dev server
bun run build          # production build
bun run lint           # ESLint
bun run test           # vitest run (all tests)
bun run test -- src/lib/__tests__/importItinerary.test.ts   # single test file
bun run test:watch     # vitest in watch mode
```

## Architecture

TripBrain is a **client-only Next.js 16 PWA** (no API routes, no server-side data fetching). It serves as a personal travel companion that displays a day-by-day itinerary with a roadbook, interactive map, documents, and offline support.

### Data flow

1. **Itinerary data** is the core model (`DayItinerary` in `src/lib/itinerary-data.ts`). It includes days, activities, transport, accommodation, and images.
2. All trip data lives in **IndexedDB** (database `tripbrain`, store `tripData`). There is no backend.
3. `useTripData` hook (`src/hooks/use-trip-data.ts`) manages CRUD: load from IndexedDB on mount, save on import/edit, export as JSON.
4. Import supports **JSON**, **XLSX** (3-sheet workbook: Days/Activities/Transports), and **CSV** (3 files: days.csv/activities.csv/transports.csv). Import logic is in `src/lib/importItinerary.ts`.
5. A separate IndexedDB database (`tripbrain-images`) caches images for offline use, managed by `useImageCache` hook.
6. Documents (PDFs, tickets, etc.) are stored in a third IndexedDB database (`tripbrain-documents`), managed by `useDocuments` hook.

### Single-page structure

The app is a single route (`src/app/page.tsx`). It shows:

- An **onboarding screen** when no data is loaded
- A **timeline** + **day detail** (roadbook) as the main view
- A **documents tab** for file storage
- A **map overlay** (Leaflet) opened via a floating button

### UI layer

- **shadcn/ui** (new-york style) with components in `src/components/ui/`
- **Tailwind CSS v4** with `@tailwindcss/postcss` (no `tailwind.config` file — config is in `globals.css`)
- Design tokens use **oklch** color space defined as CSS custom properties
- Icons from **lucide-react**
- `cn()` utility from `src/lib/utils.ts` for class merging (clsx + tailwind-merge)

## Conventions

- **Language**: UI copy and comments are in **French**. Code identifiers (variables, types, functions) are in English.
- **Formatting**: Prettier with single quotes, no semicolons, 2-space indent (see `.prettierrc`). Tailwind class sorting via `prettier-plugin-tailwindcss`.
- **Path alias**: `@/*` maps to `./src/*`.
- **Components**: `'use client'` directive on all interactive components (the app is fully client-rendered despite using Next.js App Router).
- **Tests**: Vitest with `globals: true` (no need to import `describe`/`it`/`expect`). Tests live in `src/lib/__tests__/`.
- **Import format**: Multi-value fields use `|` as separator. Coordinates are `lat|lng`. Activities/Transports link to Days via `day_id`.
- **IndexedDB pattern**: Each domain has its own database. Direct `indexedDB.open()` calls wrapped in Promises — no ORM.
