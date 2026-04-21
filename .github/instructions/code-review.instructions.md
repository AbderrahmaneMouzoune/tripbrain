---
applyTo: "**/\*.tsx,**/\*.ts"
description: "Code review standards for TripBrain"

---

# Code Review Guidelines

Apply the repository-wide guidance from `../copilot-instructions.md` to all reviews.

## Review Checklist

- Code follows project conventions (French UI text, English identifiers, Prettier formatting)
- TypeScript strict mode compliance — no `any` leaks, proper type narrowing
- `'use client'` directive present on all interactive components
- Tailwind classes used consistently — no inline styles or custom CSS unless justified
- New dependencies are justified and tree-shakeable
- IndexedDB operations follow existing patterns (Promise-wrapped, proper error handling)

## Focus Areas

- **Data integrity**: Import parsing handles malformed input gracefully
- **Offline support**: New features work without network access
- **Accessibility**: Interactive elements are keyboard-navigable and have proper ARIA attributes
- **Performance**: No unnecessary re-renders, large imports are lazy-loaded
- **Security**: User input is validated, no XSS vectors via imported data

## PR Standards

- PRs should be focused — one feature or fix per PR
- Descriptive title using conventional commit format
- Include before/after screenshots for UI changes
- Link related issues
- Tests accompany logic changes

## Review Tone

- Be constructive and specific
- Explain the "why" behind suggestions
- Approve once comments are addressed — do not block on style preferences already covered by Prettier
