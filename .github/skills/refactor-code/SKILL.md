---
name: refactor-code
description: 'Refactor TripBrain code for clarity and maintainability'
---

# Refactor Code

Refactor existing code to improve readability, reduce complexity, and align with TripBrain conventions — without changing behavior.

Ask for the file or module to refactor if not provided.

## Requirements

- Preserve existing behavior — run tests before and after (`bun run test`)
- Follow existing project patterns and conventions
- Keep UI text in French, code identifiers in English
- Extract reusable logic into hooks (`src/hooks/`) or utilities (`src/lib/`)
- Simplify component trees — split large components into focused ones
- Remove dead code and unused imports
- Ensure Tailwind classes are used consistently
- Do not over-abstract — keep the codebase accessible and straightforward
- Document the rationale for significant structural changes
