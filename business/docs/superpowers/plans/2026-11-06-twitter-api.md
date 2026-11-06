# X API Implementation Plan

> **For agentic workers:** Execute inline as the user requested an API migration. No delegation.

**Goal:** Add authorized official API acquisition to the existing X source.

**Architecture:** A bounded HTTP client acquires one official JSON page per persistent crawl task. A JSON parser produces existing SOCIAL_POST records. Cursor tasks preserve page progress; browser transport remains compatible.

**Tech Stack:** Existing TypeScript, Node fetch, Zod, PGlite, React.

## Global Constraints

- No real charged API requests before user configuration and explicit initiation.
- Bearer credentials remain in environment variables; never in SQL, responses, logs or exports.
- Retain original non-X and X browser behavior.

### Task 1: JSON client and records

Files: `crawl/fetch/twitter-api.ts`, `crawl/sources/twitter-api.ts`, `crawl/sources/twitter.ts`.
- [x] Implement bounded GET requests to fixed `https://api.x.com/2/` endpoints, no redirects, sanitized errors and rate-reset delays.
- [x] Add opaque cursor/count source parameters for persistent tasks, preserving canonical post links.
- [x] Parse ID strings, author/media expansions, public metrics and note text without HTML conversion.
- [x] Test injected API responses and credential isolation in `business/tests/twitter-api.test.ts`.

### Task 2: Worker, settings and configuration

Files: `crawl/core/config.ts`, `crawl/types.ts`, `crawl/core/worker.ts`, `business/backend/crawl.ts`, `business/frontend/src/components/CrawlSettings.jsx`, `business/deployment/.env.example`.
- [x] Add explicit API/browser transport, preserve old browser default, make new UI default API.
- [x] Branch authorized API tasks before webpage robots checks; page through existing finish/checkpoint mechanism.
- [x] Display configured/missing status and API errors; never accept credentials as run config.
- [x] Verify worker API pagination and pause/cancel fencing, plus original crawler regression.

### Task 3: Documentation and verification

- [x] Add registration and local environment instructions, pricing link and recent-search scope to usage guide.
- [x] Run TypeScript check, crawler/API tests, frontend build and browser UI checks.
- [x] Record remaining real-token verification requirement honestly.

User subsequently prioritized interactive local browsing. API is optional; UI defaults to interactive. Validation: 32 crawler-related tests, typecheck, frontend build and browser fixture checks pass. Real login remains pending after Google sign-in rejected the automation browser.
