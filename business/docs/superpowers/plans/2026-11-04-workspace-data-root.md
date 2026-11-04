# Workspace Data Root Correction

**Goal:** Honor the user's exact destination `C:/maven/business_agent/data`, a sibling of `business`.

**Design:** Move the current `business/data` content into the existing empty workspace `data` folder. Rebase all relative TypeScript imports from original resolved targets to the new locations. Give the sibling module a private ESM package with pinned PGlite/Zod dependencies, installed from the existing offline npm cache; do not rely on links into another package's node_modules. Keep the application's root, runtime database, skills and exports unchanged.

**Constraints:** Do not overwrite existing destination entries, open/move the real database, use real model calls, or alter market evidence. Earlier relocation manifests remain historical records.

- [x] Capture every source file hash, validate absolute paths, and move using native PowerShell.
- [x] Repair imports, add `../data/**/*.ts` to application typecheck, install locked local module dependencies offline.
- [x] Correct active documentation, audit report links/paths, and diagrams.
- [x] Run typecheck, unit/API/workflow tests, frontend build and isolated browser checks.
- [x] Save the corrected destination and integrity/check results in `docs/verification/workspace-data-layout.json`.

The previously proposed data-quality functionality remains a separate behavior change and must not be reported as implemented by the relocation.
