# Twitter Crawler Implementation Plan

> **For agentic workers:** Execute inline, task by task, as authorized by the user. Available skills do not include executing-plans.

**Goal:** Extend the existing crawler with authenticated X account and keyword acquisition.

**Architecture:** An X-only persistent browser session produces bounded, sanitized article HTML across scrolls. The existing parser dispatcher, task worker, SQL store and export pipeline persist social posts with source evidence. Existing robots decisions remain authoritative.

**Tech Stack:** TypeScript, existing Playwright Chromium, parse5, Zod, PGlite, React.

## Global Constraints

- Extend existing code; do not modify other pending user changes beyond necessary integration.
- Do not copy personal browser profiles or export authentication material.
- Keep robots checks and disclose incomplete or blocked acquisitions.
- Social posts have SOCIAL_POST semantics, not hackathon evidence.

### Task 1: Input, parser and source registration

Files: `crawl/sources/twitter.ts`, `registry.ts`, `index.ts`, `crawl/types.ts`, `crawl/core/config.ts`, `data/crawl/store.ts`, `business/tests/twitter-crawl.test.ts`.

- [x] Test status ID precision, nested quote isolation, URL scope, input validation, media-only posts and missing metrics.
- [x] Implement `twitterSeed(mode,value):string`, `parseTwitter(url,html):ParsedPage`; source id is `twitter`.
- [x] Add optional `twitter:{mode:'account'|'search',value:string,maxPosts:number,maxScrolls:number}`. Require it or a valid X seed and force browser mode. Do not filter social posts using event years.
- [x] Run `node --experimental-strip-types --test tests/twitter-crawl.test.ts` from business.

### Task 2: Persistent browser acquisition and worker

Files: `crawl/fetch/twitter.ts`, `crawl/core/worker.ts`, `business/backend/crawl.ts`, `business/backend/server.ts`.

- [x] Implement `TwitterBrowser` with login/status/close/acquire methods, private profile directory and exclusive use.
- [x] Use bounded article accumulation at every scroll; sanitize article markup rather than capture full account page. Abort on challenges/login and check run control each iteration.
- [x] Dispatch X tasks after existing robots checks; block explicitly on current policy restrictions. Preserve snapshots, lease checks and retry semantics.
- [x] Expose authenticated status/login/close endpoints; opening or closing browser requires loopback request. Close owned browser on server shutdown.
- [x] Test robots denial and acquisition with injected browser doubles, including duplicate and virtualized cards, control signals and limits.

### Task 3: Settings, storage semantics and delivery

Files: `business/frontend/src/components/CrawlSettings.jsx`, `data/RAG/crawl-bridge.ts`, `data/crawl/export.ts`, `business/tests/crawl-api.test.ts`, `crawl/README.md`.

- [x] Add account/search input, login state and browser controls to existing crawler settings. Show X task errors and incomplete coverage.
- [x] Preserve SOCIAL_POST provenance through case import and export; retain existing hackathon provenance for other sources.
- [x] Replace source-count assumptions in tests with registry size.
- [x] Run TypeScript, crawler regression tests and frontend build; distinguish fixtures from live data.
- [x] Review git diff for unrelated changes; document validation and remaining live-login limitation.

Validation evidence: `crawl/docs/TWITTER_VALIDATION.md`. Live authenticated X collection remains unverified; robots policy is retained.
