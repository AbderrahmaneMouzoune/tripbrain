---
name: debug-issue
description: 'Debug and resolve issues in TripBrain'
---

# Debug Issue

Systematically identify, analyze, and resolve bugs in TripBrain.

Ask for the error message, reproduction steps, or affected feature if not provided.

## Requirements

- Reproduce the issue before attempting a fix
- Trace the data flow: import parsing → IndexedDB storage → hook state → component rendering
- Check IndexedDB operations for version conflicts, quota errors, or transaction failures
- Verify offline scenarios — issues may only appear when disconnected
- Test with different import formats (JSON, XLSX, CSV) if the issue involves data
- Check Leaflet map lifecycle — ensure proper cleanup on unmount
- Run `bun run test` to verify fixes and check for regressions
- Document the root cause and fix in the PR description
