---
name: write-tests
description: 'Generate Vitest tests for TripBrain modules'
---

# Write Tests

Generate comprehensive Vitest tests for a given module, following TripBrain's testing conventions.

Ask for the module or function to test if not provided.

## Requirements

- Use Vitest with `globals: true` — do not import `describe`, `it`, `expect`, `vi`
- Place tests in `src/lib/__tests__/` with `*.test.ts` or `*.test.tsx` extension
- Write descriptive test names in French
- Test behavior and edge cases, not implementation details
- Mock IndexedDB and browser APIs when needed
- Use factory functions for test data based on `DayItinerary` model
- Cover happy path, error cases, and boundary conditions
- Run tests with `bun run test` to verify they pass
