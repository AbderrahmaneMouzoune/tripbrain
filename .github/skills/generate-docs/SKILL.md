---
name: generate-docs
description: 'Generate documentation for TripBrain features and APIs'
---

# Generate Documentation

Generate or update documentation for TripBrain features, data models, or APIs.

Ask for the feature or area to document if not provided.

## Requirements

- Write documentation in French (matching UI language convention)
- Use Markdown format
- Document data model changes in `src/lib/itinerary-data.ts` with inline comments
- Include usage examples for hooks and utility functions
- Document import format specifications (JSON, XLSX, CSV) near parsing logic
- Keep README.md updated with setup instructions and feature overview
- Use conventional commit format for documentation PRs: `docs: ...`
