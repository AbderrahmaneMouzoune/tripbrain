---

applyTo: "**/\*.tsx,**/_.ts,\*\*/_.jsx,**/\*.js,**/\*.css"
description: "TypeScript and React development standards for TripBrain"

---

# TypeScript & React Guidelines

Apply the repository-wide guidance from `../copilot-instructions.md` to all code.

## TypeScript

- Enable and respect `strict` mode — no `any` unless absolutely necessary and documented
- Use `interface` for object shapes and component props; use `type` for unions, intersections, and mapped types
- Prefer discriminated unions over optional fields when modeling state variants
- Use `as const` for literal tuples and enums-as-objects
- Validate data at system boundaries (import parsing, IndexedDB reads) with runtime checks or Zod
- Avoid type assertions (`as`) — prefer type guards and narrowing

## React

- Use functional components only — class components are not used in this project
- Add `'use client'` directive at the top of every interactive component (this is a fully client-rendered app)
- Prefer composition over prop drilling; use React Context sparingly
- Keep components focused: UI rendering in components, logic in hooks, data transforms in `src/lib/`
- Use `cn()` from `@/lib/utils` for conditional Tailwind class merging
- Import icons from `@tabler/icons-react` — do not add other icon libraries without discussion

## Tailwind CSS v4

- All theme configuration is in `src/app/globals.css` via CSS custom properties — there is no `tailwind.config` file
- Design tokens use oklch color space
- Use Tailwind utility classes; avoid inline styles
- Ensure responsive design with mobile-first approach
- Sort Tailwind classes via `prettier-plugin-tailwindcss`

## shadcn/ui

- Components live in `src/components/ui/` — do not modify them unless necessary
- Use the new-york style variant
- Compose shadcn/ui primitives for custom components in `src/components/`

## Hooks

- Custom hooks go in `src/hooks/`
- Name hooks with `use` prefix (e.g., `useTripData`, `useImageCache`)
- Keep side effects (IndexedDB, localStorage) inside hooks, not components

## File Organization

- Path alias: `@/*` → `./src/*`
- Components: `src/components/` (app) and `src/components/ui/` (shadcn)
- Hooks: `src/hooks/`
- Utilities and data types: `src/lib/`
- Tests: `src/lib/__tests__/`

## Formatting

- Prettier: single quotes, no semicolons, 2-space indent
- Tailwind class sorting enabled
- French for UI text and comments; English for code identifiers
