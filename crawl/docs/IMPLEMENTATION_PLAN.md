# Hackathon Crawler Implementation Plan

> For agentic workers: execute inline in this session. The user approved the architecture and implementation on 2026-11-04. No delegated work is required. An executing-plans skill is not installed; use the task checkpoints below directly.

**Goal:** Deliver a working local crawler connected to Lydia's existing data and authenticated backend, with honest source coverage.

**Architecture:** The existing backend alone owns PGlite. Inject its Store into a persistent crawl repository and worker. HTTP snapshots feed source adapters, versioned facts, exports and case-scoped PROJECT RAG projections.

**Tech Stack:** Node >=24, TypeScript, PGlite/pgvector, Node test runner, existing browser test tools.

## Global Constraints

- Database remains at `business/.runtime/data`; CLI never opens it.
- Runtime snapshots/exports live under `data/.runtime/crawl`, configurable independently.
- Sources are the ten approved platforms; years 2025–2026.
- Winners are never truncated by finalist limits; budget exhaustion means incomplete.
- No paid API, cloud deployment or Neo4j activation.
- Browser acquisition stays disabled unless its subrequest/DNS security is implemented and verified.
- Preserve third-party repositories and existing cases. Root is not a Git repository; no commits are possible here.

## Task 1: Durable data and snapshots

Files: `data/database/migrations.ts`, `data/database/migrations/001-crawl.sql`, `data/crawl/store.ts`, `data/crawl/snapshots.ts`, `business/tests/crawl.test.ts`.

Interfaces: `migrate(store): Promise<void>`, `CrawlStore(store)`, `Snapshots(root).save(result)`; repository owns run/task/entity/outbox transactions.

- [x] Test temporary database migration with existing case, task idempotency, expiry recovery and stale lease rejection. Example assertions: `assert.equal((await repo.claim())?.attempt,2)` after expiry; `await assert.rejects(repo.complete(oldTask,...))`.
- [x] Implement migration checksum validation, constrained tables, token-fenced lease updates and atomic snapshot writes. Task completion and facts/outbox must share a transaction.
- [x] Run `node --experimental-strip-types --test tests/crawl.test.ts` from business and check actual persisted rows after retry.

## Task 2: Public acquisition and source parsing

Files: `crawl/fetch/http.ts`, `crawl/sources/registry.ts`, `crawl/sources/ethglobal.ts`, `crawl/core/worker.ts`, `crawl/core/selection.ts`.

Interfaces: `fetchPage(url,signal): Promise<FetchResult>`, `parsePage(source,url,html): ParsedPage`, `CrawlWorker.tick(): Promise<void>`; inject fetcher for offline failure tests.

- [x] Add fixed fixtures for detail/list/challenge/repeated pagination and selection constraints. Example: `assert.equal(classify(200,'text/html','Just a moment...'),'challenge')`.
- [x] Implement pinned-DNS public HTTP, robots decisions, finite time/bytes/redirects, Retry-After, persistent checkpoint and raw snapshots; implement adapters only for observed templates.
- [x] Verify official entries and robots using bounded live requests. Save audit timestamp and raw samples; record blocked/unsupported sources rather than invent selectors.

## Task 3: Case RAG and exports

Files: `data/RAG/crawl-bridge.ts`, `data/RAG/retrieval.ts`, `data/crawl/export.ts`, migration indexes.

Interfaces: `attachProject(repo,embedding,caseId,projectId)`, `exportCrawl(repo,snapshots,filters,format)`; use origin-scoped ingest and UUID binding maps.

- [x] Test same text across two origins, metadata-only updates, two cases, stale exclusion and idempotent repeated import. Example: `assert.notEqual(a.id,b.id)` for distinct origins and `assert.equal(repeated.id,a.id)` for unchanged projection.
- [x] Add optional origin/fingerprint ingest mode while preserving existing behavior; stream or split long documents, persist outbox/bindings and invalidate old projections transactionally.
- [x] Export ordinary JSON, per-entity CSV with formula protection and source-linked Markdown, with manifest counts and hashes. Parse outputs in tests.

## Task 4: Authenticated UI and CLI

Files: `business/backend/crawl.ts`, `business/backend/server.ts`, `crawl/cli.ts`, `crawl/web/index.html`, `crawl/web/app.js`, `crawl/web/style.css`, `business/tests/crawl-api.test.ts`.

Interfaces: `CrawlAPI.handle(path,method,body)` behind existing auth/CSRF; CLI consumes the same API; worker lifecycle joins createApp/close.

- [x] Test unauthenticated denial, CSRF rejection, run creation/pause/resume/cancel, project/evidence/export/import routes using an isolated app.
- [x] Build actual management controls, table filters, evidence and bounded relation browsing with escaped content; expose only fixed static assets.
- [x] Verify CLI help and browser workflow; run `npm.cmd run check`, `npm.cmd test`, frontend build, targeted browser smoke.

## Task 5: Delivery audit

Files: `crawl/README.md`, `data/crawl/README.md`, `crawl/docs/IMPLEMENTATION_STATUS.md`, `crawl/reports/`.

- [x] Run a bounded live pilot against audited sources using a separate temporary database, never production; save source status, counts, snapshots and exports.
- [x] Update exact startup commands and phase status. Mark unverified browser/cloud/remaining sources clearly; do not call a small pilot full coverage.
- [x] Review actual output and links; record all passed checks and open requirements. Only mark checklist items complete with supporting evidence.

## Execution outcome

Core plan tasks completed with scope limits recorded in IMPLEMENTATION_STATUS.md. This checklist does not mark the original 25-section prompt fully complete. Two real source detail samples, one real GitHub README, ten entry/robots audits, authenticated UI/CLI, exports and case PROJECT retrieval were verified. Browser acquisition remains disabled; eight source adapters, full award discovery, cross-source merge/undo and cloud runtime are outstanding. Root is not a Git repository, so no commits were made.
