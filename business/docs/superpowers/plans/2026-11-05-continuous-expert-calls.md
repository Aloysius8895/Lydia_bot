# Continuous Expert Calls Implementation Plan

> Execute inline in this session, as requested by the user. No delegation is needed.

**Goal:** Replace manual recording turns with continuous, interruptible expert calls based on the approved v1.3 prompt.

**Architecture:** Keep authenticated call APIs, CallStore, evidence validation and the shared Claude CLI queue. Add a browser call controller with automatic endpointing, bounded recognition recovery, concurrent input/output and generation fencing. Use browser recognition plus a local Web Audio activity monitor; audio samples are transient and never uploaded by the application.

**Tech Stack:** React 18, browser Web Speech/Web Audio, native HTTP, TypeScript, PGlite, Node test runner, existing Playwright.

## Global Constraints

- Keep Claude CLI subscription billing and its shared serial queue; no paid fallback or model download.
- Keep business/data as siblings, existing authentication, CSRF, case isolation and explicit business-action confirmation.
- Preserve 27% / 42% / 31% desktop layout and the existing expert navigation.
- Real speech and phone validation must be reported separately from deterministic mocks.

### Task 1: Continuous input lifecycle

Files: `frontend/src/voice.js`, new `frontend/src/call-controller.js`, new `tests/continuous-call.test.ts`.

- [x] Extend recognition with indexed/revised results, real start/error/speech events and bounded lifecycle control.
- [x] Implement `ContinuousInput` with injected recognizer/timers, endpoint aggregation, bounded recovery, mute/stop and draft retention.
- [x] Add local activity analysis with echo-cancellation constraints and lifecycle cleanup; never assume it controls the separate browser recognizer.
- [x] Test final/interim aggregation, short pauses, 10+ automatic turns, late callbacks, repeated failures, silence and interruption filtering.

### Task 2: Continuous dialogue integration

Files: `frontend/src/components/CallCard.jsx`, `agents/dialogue.ts`, `backend/calls.ts`, `data/database/calls.ts`, `tests/calls.test.ts`.

- [x] Gate connection on actual recognition start, retain explicit text fallback, greet once, auto-submit input and keep input alive during output.
- [x] Serialize latest-intent replacement against in-flight submissions/cancellations; reuse request keys after uncertain network outcomes and fence all old polls/playback callbacks.
- [x] Make mic a mute toggle, add recovery/stop controls and preserve records/export/correction.
- [x] Give the expert recent and compact older context with playback status, short conversational instructions, and clear unverified evidence boundaries.
- [x] Persist endpoint and playback latency metadata without logging transcript bodies.

### Task 3: Integration verification and delivery

Files: `scripts/call-browser-test.ts`, `audio/voice-call-design.md`, `audio/acceptance-report.md`, versioned prompt in `docs/prompts/`.

- [x] Update browser fixtures to drive speech events without mic/send clicks; cover recovery, echo/ack filtering, interrupt, supersede while thinking, mute, permissions, cleanup and layout.
- [x] Run `npm.cmd run check`, `npm.cmd test`, `npm.cmd run build:frontend`, `npm.cmd run test:browser` from business.
- [x] Inspect screenshots and report exact verification limits. Real 10-minute calls require a speaking/listening participant; do not manufacture this evidence.
- [x] Save updated architecture, measured automated results and real-device checklist. Leave unrelated promo claims unchanged until live validation exists.

Real-device 10-minute testing is pending user feedback and is not covered by the checked automated-verification tasks.
