# Copilot Instructions — TripBrain

## Project Overview

TripBrain is a **local-first Next.js 16 PWA** — a personal travel companion that displays a day-by-day itinerary with a roadbook, interactive map, documents, and offline support. All data lives in IndexedDB; the only server-side code is the sharing API (`src/app/api/share/`), which parks a compressed itinerary in an S3/R2 bucket under a short sync code.

## Tech Stack

- **Runtime**: Bun (not npm)
- **Framework**: Next.js 16 (App Router, fully client-rendered)
- **Language**: TypeScript (strict mode)
- **UI**: React 19, shadcn/ui (new-york style), Tailwind CSS v4, @tabler/icons-react icons
- **State**: IndexedDB (3 databases: tripbrain, tripbrain-images, tripbrain-documents)
- **Sharing**: [bucketcode](https://www.npmjs.com/package/bucketcode) on the server (S3/R2 snapshots + sync codes), `qrcode.react` on the client
- **Map**: Leaflet
- **Testing**: Vitest with `globals: true`
- **Formatting**: Prettier — single quotes, no semicolons, 2-space indent, Tailwind class sorting

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

### Data flow

1. **Itinerary data** is the core model (`DayItinerary` in `src/lib/itinerary-data.ts`). It includes days, activities, transport, accommodation, and images.
2. All trip data lives in **IndexedDB** (database `tripbrain`, store `tripData`). There is no backend.
3. `useTripData` hook (`src/hooks/use-trip-data.ts`) manages CRUD: load from IndexedDB on mount, save on import/edit, export as JSON.
4. In-app editing goes through `useTripData().updateDay`, which persists a whole day at a time. The pure edit helpers live in `src/lib/itinerary-edit.ts`; forms are described declaratively in `src/lib/edit-fields.ts` (sections + field types), mapped to controls in `src/components/edit/edit-field-control.tsx`, and rendered by `EntityEditSheet`. Draft conversion and validation live in `src/lib/entity-draft.ts`.
5. Import supports **JSON**, **XLSX** (3-sheet workbook: Days/Activities/Transports), and **CSV** (3 files: days.csv/activities.csv/transports.csv). Import logic is in `src/lib/importItinerary.ts`.
6. A separate IndexedDB database (`tripbrain-images`) caches images for offline use, managed by `useImageCache` hook.
7. Documents (PDFs, tickets, etc.) are stored in a third IndexedDB database (`tripbrain-documents`), managed by `useDocuments` hook.
8. **Sharing** (`src/lib/share.ts`) compresses the itinerary to msgpack + deflate + base64url. Under `SHARE_INLINE_LIMIT` chars the whole trip fits in a self-contained QR code (`/?import=<payload>`) and never leaves the device. Above it — or whenever a code to read out loud is asked for — the payload is POSTed to `/api/share`, which stores it as a bucketcode snapshot under an eight-digit code (digits only, so phones show the numeric keypad) and returns it; the receiving device resolves it through `GET /api/share/[code]` (`/?code=<code>` opens the app straight onto it). Bucket credentials stay on the server: see `.env.example` for the required `R2_*` variables.

9. **Installation PWA** : la logique pure (plateforme, cadence de relance, opt-out) vit dans `src/lib/pwa-install.ts` ; `PwaInstallProvider` (`src/components/pwa-install-provider.tsx`) branche `beforeinstallprompt`/`appinstalled` et le mode standalone, et `PwaInstallPrompt` affiche le tiroir. La relance automatique ne se déclenche que sur mobile, une fois un voyage chargé, et jamais en mode installé ; `PwaInstallEntry` garde une entrée manuelle dans l'onboarding et dans « Partager & données ».

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
- Icons from **@tabler/icons-react**
- `cn()` utility from `src/lib/utils.ts` for class merging (clsx + tailwind-merge)

## Conventions

- **Language**: UI copy and comments are in **French**. Code identifiers (variables, types, functions) are in English.
- **Formatting**: Prettier with single quotes, no semicolons, 2-space indent (see `.prettierrc`). Tailwind class sorting via `prettier-plugin-tailwindcss`.
- **Path alias**: `@/*` maps to `./src/*`.
- **Components**: `'use client'` directive on all interactive components (the app is fully client-rendered despite using Next.js App Router).
- **Tests**: Vitest with `globals: true` (no need to import `describe`/`it`/`expect`). Tests live in `src/lib/__tests__/`.
- **Import format**: Multi-value fields use `|` as separator. Coordinates are `lat|lng`. Activities/Transports link to Days via `day_id`.
- **IndexedDB pattern**: Each domain has its own database. Direct `indexedDB.open()` calls wrapped in Promises — no ORM.

## Workflow

- Branch naming: `feature/`, `fix/`, `chore/` prefixes
- Commit style: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- PR conventions: descriptive title, link related issues

## Detailed Guidelines

- TypeScript & React: `.github/instructions/typescript-react.instructions.md`
- Testing: `.github/instructions/testing.instructions.md`
- Security: `.github/instructions/security.instructions.md`
- Documentation: `.github/instructions/documentation.instructions.md`
- Performance: `.github/instructions/performance.instructions.md`
- Code review: `.github/instructions/code-review.instructions.md`
