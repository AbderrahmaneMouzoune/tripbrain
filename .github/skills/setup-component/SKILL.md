---
name: setup-component
description: 'Create a new React component following TripBrain conventions'
---

# Setup Component

Create a new React component following TripBrain's established conventions and patterns.

Ask for the component name and its purpose if not provided.

## Requirements

- Add `'use client'` directive at the top (all components are client-rendered)
- Use TypeScript with proper interface definitions for props
- Import `cn()` from `@/lib/utils` for conditional class merging
- Use Tailwind CSS v4 utilities for styling — no inline styles
- Use @tabler/icons-react for icons
- Place shared components in `src/components/`, route-specific ones in the route folder
- Follow Prettier formatting: single quotes, no semicolons, 2-space indent
- Write UI text and comments in French, code identifiers in English
- Compose shadcn/ui primitives from `src/components/ui/` when applicable
