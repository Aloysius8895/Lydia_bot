# Crawler expansion implementation plan

The existing architecture is approved; user explicitly authorized continuing the four high-priority gaps. Execute inline. No paid services, account acquisition, access-control bypass, production-database experiments, or unverified completeness claims.

## 1. Source reconnaissance and observed adapters

- Inspect current ten entries, linked official event/result/project routes and public embedded data. Save timestamped raw fixtures under data/.runtime/crawl.
- Add a central adapter dispatch plus per-source observed parsers. Each parser returns projects, event records, result assertions, bounded next links, and explicit pagination signals. Unobserved templates remain unsupported.
- Validate parsing against saved real samples and synthetic edge cases, especially unrelated rankings, grant tracks, regional stages and unknown dates.

Files: crawl/sources/{index,discovery,structured,devfolio,taikai,hackster,nasa,imaginecup,junction,google,dorahacks}.ts as needed; existing ethglobal/hackquest adapters; crawl/scripts/expansion-audit.ts.

## 2. Persistent discovery and official outcomes

- Add migration 005 for discovery observations and official result candidates with snapshot-backed evidence and explicit matching/review state.
- Store events without requiring a project. Preserve unmatched official winners/finalists; only match exact source project IDs/URLs scoped to that event. Reconcile result-first and detail-first order atomically.
- Persist page fingerprint, unique IDs, next cursor and end/stall/budget reasons. Repeated cursors never become a complete traversal. Deep selection reads verified official outcomes, not a text-wide winner heuristic.
- Test two-page traversal, repeated-page/cursor stalls, result-first matching, same-name projects, stage mapping, stale worker fencing and budget interruptions using temporary PGlite.

Files: crawl/types.ts; data/database/migrations/005-*.sql; data/crawl/store.ts; crawl/core/worker.ts; crawl/core/selection.ts; data/crawl/operations.ts; business/tests/crawl-discovery.test.ts.

## 3. Browser acquisition with constrained networking

- Run an ephemeral isolated Chromium context behind a deny-all local proxy. Fulfil permitted GET subrequests through the existing DNS-pinned public HTTP fetcher; block unhandled network, WebSockets, service workers, downloads, credentials, form mutations and private/reserved destinations. Bound request count, decoded bytes, navigation time and lazy-load steps.
- Capture original document, rendered DOM and permitted dependency hashes. Recheck robots for browser requests; record blocked dependencies and partial rendering honestly. HTTP remains preferred.
- Verify dynamic GET content appears; a script attempting localhost/private fetch or WebSocket never reaches that destination; timeout/request/byte limits terminate; unknown templates stay quarantined. Use installed headless Chrome for the separate browser checks.

Files: crawl/fetch/browser.ts; crawl/fetch/deny-proxy.ts; fetch/http.ts; core/config.ts; source registry; data/crawl/snapshots.ts; business/scripts/crawl-acquisition-test.ts; business backend health/UI.

## 4. Integration, actual samples and delivery

- Expose discovery, candidate review and source support levels in existing authenticated management API/CLI/UI; keep existing auth and case RAG semantics.
- Run typecheck, meaningful unit/integration tests, crawler and original-app browser checks after changes. Run bounded live acquisition in an isolated temporary database. Report each source independently: implemented and verified stages, blocked stages, unknown years, outcomes and pagination boundaries.
- Update README, capability matrix, implementation status, raw report links and remaining work. Do not equate ten adapters or a successful browser test with full 2025–2026/winner coverage.

Validation: from business, npm.cmd run check and npm.cmd test; browser acquisition and management scripts separately. Source/network samples do not call paid APIs or execute downloaded repository code.
