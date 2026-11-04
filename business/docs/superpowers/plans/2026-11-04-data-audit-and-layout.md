# Data Audit and Layout Implementation Plan

**Goal:** Deliver an evidence-based Chinese data audit and consolidate data-processing code under `business/data/`.

**Architecture:** Move `RAG/` to `data/RAG/` and `database/` to `data/database/`. Preserve all source files before import rewrites, public interfaces, HTTP behavior, SQL schema, existing `.runtime/data`, exports in `cases/`, and authoritative skills. Adjust relative imports based on resolved old and new paths rather than broad text replacement.

**Tech Stack:** PowerShell, Python 3, Node.js, TypeScript, PGlite, React/Vite, Graphviz.

## Authorized scope and constraints

- User explicitly requested a detailed current-data problems/solutions list and relocation of data-processing folders into a data folder; execute inline in this session.
- No Git repository exists; retain a SHA-256 relocation manifest instead of commits.
- This is a structural refactor and documentation task. Proposed sampling/quality features are recommendations, not implemented behavior.
- Do not move or open the live database, read credentials, run paid or subscription model inference, start real market research, or alter schema.
- Keep agents, backend, shared, frontend, scripts, tests, skills and expert-team in their responsibility directories. Update their references where needed.

## Task 1: Audit current data behavior

- [x] Inspect `database/schema.sql`, `database/store.ts`, `RAG/*.ts`, embedding provider, server API, role pipeline, citation review, and existing retrieval reports.
- [x] Compare sampling guidance against primary AAPOR/Census sources and retrieval context guidance against Anthropic documentation.
- [x] Write `data/DATA_AUDIT_AND_SOLUTIONS.md` covering population/sample, selection bias, evidence independence, provenance, extraction, retrieval, evaluation, versioning, lifecycle, and prioritized acceptance criteria.
- [x] Clearly distinguish existing safeguards, confirmed omissions, potential risks requiring measurement, and proposed features.

## Task 2: Relocate and repair dependencies

- [x] Inventory and hash every file below `RAG/` and `database/`.
- [x] Verify absolute source/destination paths are within `C:/maven/business_agent/business`, destination folders do not already exist, and no running app needs stopping.
- [x] Move folders natively in PowerShell using `Move-Item -LiteralPath`; compare hashes before edits.
- [x] Recalculate relative static imports for moved files and all importing TypeScript files; preserve UTF-8/newline content.
- [x] Change tsconfig include patterns to `data/**/*.ts`.
- [x] Update active README/run instructions/status and diagram generator paths; preserve historical reports and archived plans.
- [x] Record every moved file and every adjusted reference in `docs/verification/data-layout.json`.

## Task 3: Verify and deliver

- [x] Run `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run build:frontend`.
- [x] Run `npm.cmd run test:browser` against its isolated TEST_ONLY database and mocked CLI, retaining old browser results separately.
- [x] Resolve all local TypeScript imports and active documentation links; verify schema hash and runtime/config paths unchanged.
- [x] Regenerate and inspect affected architecture/stack/ER diagrams.
- [x] Save current check outputs under `test-results/*-data-layout*` and document final results and remaining data limitations.
