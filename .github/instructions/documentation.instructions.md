---
applyTo: '**/*.md,**/*.tsx,**/*.ts'
description: 'Documentation standards for TripBrain'
---

# Documentation Guidelines

Apply the repository-wide guidance from `../copilot-instructions.md` to all documentation.

## Code Comments

- Write comments in **French** (matching UI language convention)
- Comment the "why", not the "what" — code should be self-explanatory
- Document complex business logic, non-obvious data transformations, and IndexedDB patterns
- Use JSDoc for exported functions and types only when the intent is not obvious from the signature

## README

- Keep `README.md` up to date with setup instructions and project overview
- Document new features and breaking changes

## Inline Documentation

- Document data model changes in `src/lib/itinerary-data.ts`
- Document import format specifications near parsing logic
- Add comments for IndexedDB database schema and version changes

## PR and Commit

- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- PR descriptions should explain what changed and why
- Link related GitHub issues in PRs
