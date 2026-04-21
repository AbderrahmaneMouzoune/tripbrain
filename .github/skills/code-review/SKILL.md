---
name: code-review
description: 'Review code changes against TripBrain standards'
---

# Code Review

Review code changes for quality, consistency, and adherence to TripBrain's conventions.

Ask for the files or PR to review if not provided.

## Requirements

- Check TypeScript strict mode compliance — no `any` leaks
- Verify `'use client'` directive on interactive components
- Ensure French UI text, English code identifiers
- Validate Prettier formatting (single quotes, no semicolons, 2-space indent)
- Check Tailwind class usage consistency
- Review IndexedDB patterns for proper error handling
- Verify import data validation at system boundaries
- Assess offline compatibility — features should work without network
- Check for accessibility: keyboard navigation, ARIA attributes
- Ensure tests accompany logic changes
