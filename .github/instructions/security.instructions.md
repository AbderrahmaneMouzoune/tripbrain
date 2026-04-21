---
applyTo: "**/\*.tsx,**/\*.ts"
description: "Security best practices for TripBrain"

---

# Security Guidelines

Apply the repository-wide guidance from `../copilot-instructions.md` to all code.

## Client-Only Context

TripBrain is a fully client-rendered PWA with no backend. Security concerns focus on:

- User data stored in IndexedDB (sensitive travel documents, itineraries)
- File import parsing (JSON, XLSX, CSV) — potential for malformed input
- PWA service worker integrity
- Third-party dependencies

## Input Validation

- Validate all imported data at the parsing boundary (`src/lib/importItinerary.ts`)
- Never trust file content — validate structure, types, and value ranges
- Sanitize any user-provided text that gets rendered as HTML
- Validate coordinates, dates, and IDs from import files

## Data Storage

- IndexedDB stores are local-only — no data leaves the device unless explicitly exported
- Do not store authentication tokens or API keys (the app has no backend)
- Handle IndexedDB errors gracefully — storage quota, version conflicts

## Dependencies

- Keep dependencies up to date; review changelogs for security advisories
- Prefer well-maintained packages from the npm ecosystem
- Do not add dependencies that require network access for core functionality (offline-first app)

## Content Security

- Avoid `dangerouslySetInnerHTML` — if needed, sanitize input first
- Do not eval or dynamically execute code from imported data
- Validate URLs before rendering images or links from imported itineraries

## Service Worker

- The service worker (`public/sw.js`) should only cache known assets
- Do not cache sensitive or dynamic user data in the service worker
