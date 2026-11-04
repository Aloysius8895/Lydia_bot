# Crawl in Settings

User-directed design: add Crawl to the existing application's Settings navigation and reuse the existing frontend design. Native React content, no iframe or standalone green/cream interface. Keep all acquisition/data ownership and authentication in the existing backend.

Implementation plan (writing-plans):

- Add a focused CrawlSettings component with native settings navigation for runs, projects/export, source capabilities, coverage, official-result review, quality and projections. Reuse api.js, existing button/field styles and theme tokens. Project details support evidence, resource checks and case import. Operations poll to completion and expose authenticated download links.
- Add native project-detail and result-review components so SettingsModal stays focused on settings composition. Display honest empty/loading/error/partial coverage states. Mutations disable duplicate submission; asynchronous operations remain backend-owned.
- Add Crawl to SettingsModal, support ?settings=crawl deep linking, redirect legacy /crawl paths to the native app and stop serving the old design. Update launcher guidance/docs and API assertions for that redirect.
- Build React, typecheck backend, run crawler API and existing application tests. Verify native navigation, create/pause/resume, project/evidence/import, actual export download, deep links, original settings, light/dark theme and 390px width using an isolated temporary database, without live crawls or production writes.

No Git repository is present. Execute inline; no delegation required. Authorization for location and visual style comes directly from the user's request.

Completed: all implementation steps, including durable recent-operation lookup and download recovery after reopening Settings. Validation results and screenshots: [frontend integration report](../reports/FRONTEND_INTEGRATION.md).
