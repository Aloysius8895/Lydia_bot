# Source sidebar design refinement

Continue the approved soft workspace style for the sources tab, as requested by the user. Replace the long undifferentiated form with a rounded add-source card, three explicit entry modes, a styled native file picker, compact category row, separate evidence search and source library groups. Keep actual ingest APIs, file size/type bounds, loading/errors, source classifications and original evidence content.

- [x] Reorganize ResearchPanel sources tab and preserve drafts on tab changes. Keep MARKET and PROJECT source rows explicitly classified; URL category forwarded to existing API.
- [x] Add responsive source-card styles to soft-workspace.css. Opaque tablet/mobile drawer avoids background text bleed-through.
- [x] Validate text/file/link entry modes, empty states, category changes and narrow viewport. Six dedicated browser checks plus existing 21-check application suite pass. URL request intercepted; text/file storage tested against temporary database.
- [x] Build/typecheck, inspect light/dark/mobile screenshots using temporary data. Evidence: pic/implemented/sources. No production data or model calls used.
