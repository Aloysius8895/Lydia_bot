# Grok File Import Implementation Plan

> **For agentic workers:** Execute inline. User approved the three-table design and the formal import on 2026-11-09. No delegation, deployment, push or automatic sync.

**Goal:** Import 37 external projects and 15 unique news summaries with durable audits and no overwrites.

**Architecture:** Pure JSON parser and identity mapping; injected Store importer with item transactions; explicit offline maintenance CLI holding the existing single-store guard. Three additive audit tables; existing JSON metadata retains external fields. News content remains empty and project versions remain absent.

**Tech Stack:** Node 24+, TypeScript, Zod, PGlite/PostgreSQL, React.

**Completion, 2026-11-09:** Implementation and formal import complete. Full stopped-writer backup and isolated restore checks passed twice. The formal database contains all 37 external projects and 15 news summaries; all 52 records were read back and searched through KnowledgeAPI. Final repeat: 0 imported, 67 duplicate, 0 conflict, 0 failed. Existing business rows preserved. Sixteen targeted tests, TypeScript and a temporary frontend build passed. Initial five secondary-contest-URL false conflicts were fixed without overwriting any data; immutable batch history is retained. Service remains paused, no deployment or push. Acceptance: `../../acceptance/2026-11-09-grok-file-import.md`.

## Global Constraints

- No instruction execution, model calls, external fetch, secret inspection or existing business-record updates.
- Preserve original dates, links, categories, claims and missing fields.
- Shared report URLs require platform plus project identity; source IDs and URL aliases must not collide silently.
- Back up the complete actual DB only after writer/supervisor shutdown, then verify an isolated restored copy before migration/import.
- Do not deploy or push. Report the final service state explicitly.

### Task 1: Parser, migration and audited importer

Files: `data/database/migrations/009-file-imports.sql`, `data/imports/parse.ts`, `data/imports/store.ts`, `business/tests/file-import.test.ts`.

- [ ] Parse root news arrays and package project/news arrays, retain original items and per-item errors.
- [ ] Add batches, items and identities with checks, references and unique alias constraints.
- [ ] Insert each new business row and all identities in one transaction; record failed/conflict results without changing existing rows.
- [ ] Test duplicate files and repeated batches, same article/different projects, mismatched identities and changed records, raw dates, missing fields and literal malicious strings.

### Task 2: Safe offline CLI and summary boundaries

Files: `business/scripts/import-files.ts`, `business/frontend/src/components/KnowledgeMaterialDetails.jsx`, `business/agents/idea-lab.ts`, `business/backend/obsidian.ts`.

- [ ] CLI offers preview by default, requires explicit execute, DB path, backup manifest and output path; refuses active port/supervisor and claims loopback 4317 guard.
- [ ] Read back and search every imported target through KnowledgeAPI, verify summary/content boundaries and record all target IDs; execute an identical second batch to prove zero new business records.
- [ ] Detail UI displays summary, dates, sources and caveats; analysis explicitly rejects summary-only records. Obsidian exports summaries with a label, never as originals.
- [ ] Run targeted import/auth/knowledge tests and TypeScript check. Build only to a temporary output directory for validation; do not replace served assets.

### Task 3: Formal backup, import and acceptance

Files: ignored `.runtime/backups` and `.runtime/import-reports`; `business/docs/FILE_IMPORT.md`, `business/docs/IMPLEMENTATION_STATUS.md`, `business/tests/README.md`, `data/crawl/DATA_CONTRACT.md`.

- [ ] Stop supervisor and writers gracefully, verify no DB process/listener remains, record current runtime DB path without exposing env secrets.
- [ ] Copy complete DB to a new backup directory and verify every copied file hash. Open a second copy without Store.open migrations; record pre-import business-table counts and digests plus migration versions only.
- [ ] Execute the importer against the exclusive real DB, then repeat. Read back every target, perform separate project/news searches and prove pre-existing rows unchanged.
- [ ] Write durable JSON and Markdown acceptance with counts, record IDs, batch IDs, backup location, test results and final service state. Update implementation docs accurately.
