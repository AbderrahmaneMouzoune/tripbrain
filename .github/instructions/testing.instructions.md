---
applyTo: '**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,src/lib/__tests__/**'
description: 'Testing standards for TripBrain using Vitest'
---

# Testing Guidelines

Apply the repository-wide guidance from `../copilot-instructions.md` to all tests.

## Framework

- Use **Vitest** with `globals: true` — do not import `describe`, `it`, `expect`, or `vi`
- Run tests with `bun run test` (single run) or `bun run test:watch` (watch mode)
- Run a single file: `bun run test -- src/lib/__tests__/myTest.test.ts`

## Test Location

- All tests live in `src/lib/__tests__/`
- Name test files `*.test.ts` or `*.test.tsx`

## Writing Tests

- Test behavior, not implementation details
- Each test should be independent and not rely on execution order
- Use descriptive test names in French (matching the UI language convention)
- Keep tests focused: one assertion concept per test
- Mock IndexedDB and browser APIs when needed — the app has no backend
- Use `vi.fn()` and `vi.mock()` for mocking

## Structure

- Group related tests with `describe` blocks
- Use `beforeEach` / `afterEach` for setup and teardown
- Avoid deeply nested describe blocks (max 2 levels)

## Data

- Use realistic test data that reflects the itinerary data model (`DayItinerary`)
- Prefer factory functions for test data creation over hardcoded objects
- Test import parsing (JSON, XLSX, CSV) with representative fixtures

## Coverage

- Focus coverage on business logic in `src/lib/` (import parsing, data transforms, calendar export)
- Hooks (`src/hooks/`) should be tested when they contain non-trivial logic
- UI components do not require unit tests unless they contain complex logic
