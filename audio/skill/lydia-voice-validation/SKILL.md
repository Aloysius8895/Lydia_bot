---
name: lydia-voice-validation
description: Acceptance checklist for Lydia's turn-based expert voice call. Use when changing call state, STT/TTS adapters, expert role routing, the shared CLI queue or cancellation, call record storage, or before claiming that voice calling works. Development skill for the coding assistant only, separate from the expert method skills in business/skills/.
---

# Lydia voice call validation

This skill is for whoever develops Lydia. It is not one of the expert business skills (`business/skills/`), and it must never be given to the calling experts as a runtime tool.

Requirements source: `business/docs/prompts/2026-11-04-expert-voice-call-prompt.md` (v1.2). Design and capability table: `audio/voice-call-design.md`.

## Code map

| Area | File |
| --- | --- |
| Call / turn persistence, conditional state transitions, recovery | `data/database/calls.ts`, `data/database/migrations/006-voice-calls.sql` |
| Expert dialogue (skill loading, context, evidence checks) | `business/agents/dialogue.ts` |
| Shared CLI slot (abortable wait, `onStart`, `inFlight`) | `business/agents/providers/claude.ts` |
| HTTP routes `/api/cases/:caseId/calls/...`, `/api/voice/capabilities` | `business/backend/calls.ts`, mounted in `business/backend/server.ts` |
| Browser STT/TTS adapters | `business/frontend/src/voice.js` |
| Call card UI and toolbar phone entry | `business/frontend/src/components/CallCard.jsx`, `business/frontend/src/App.jsx`, `business/frontend/src/call.css` |
| Tests | `business/tests/calls.test.ts`, `business/scripts/call-browser-test.ts` (writes to `audio/results/`) |

## Fixed checklist

Run every item. Mark each one **通过 / 失败 / 未运行 / 受阻**, and for anything blocked, say exactly what is missing.

1. **Capabilities and environment.** Record the device, browser version, input/output provider, language and processing location. Keep "detected", "really tested" and "needs configuration" separate. An API existing (`SpeechRecognition`, `speechSynthesis`) does not mean it works. Chrome and Edge recognition can send audio to a vendor service, so never call it offline unless the browser reports on-device recognition and it has been tested.
2. **Session lifecycle.** Connect, start a turn, end the turn, edit the caption, send, queue, generate, speak, interrupt, hang up. Also check logout, refresh, switching project, switching expert and unmount.
3. **Resources and races.** After the steps above, no recognizer is active and no speech is still playing. No poll is still running and no late callback writes state. Repeated or late requests must not cross cases, generate twice or replay old speech. In browser-recognition mode the app never holds microphone tracks, because `requestMic()` stops them right after the permission check. So verify `stop()`/`abort()` instead of inventing track info.
4. **Role and context.** The server role, the loaded skill files (`provenance.methods`), the stored `call_turns.role` and the UI name must all match. PROJECT is background only, MARKET is the only market evidence, METHOD is method only, user speech is `USER_REPORTED`, and earlier AI answers are `HISTORY_NOT_EVIDENCE`.
5. **Real audio** (only within the test scope the user has authorized; it uses subscription quota). Speak in Chinese and in English. Check numbers, amounts, negations and proper nouns in the transcript, then confirm a real expert answer and audible playback. Do not keep raw audio. The app does not capture any in this mode.
6. **Degradation.** Cover microphone denied, no device, device busy, empty speech, no voice for the language, recognizer error, timeout, CLI busy and CLI quota exhausted. Text input must keep working, but a working text path never makes a voice item pass.
7. **Isolation and evidence.** Reject a forged role, a cross-case `callId`/`turnId`, a bad CSRF token, a foreign Origin and oversized input. Check that idempotent resubmission returns the same turn and that cancel only affects its own turn. Spoken and displayed facts must agree, citations must be traceable, and unknown playback progress must be recorded as `UNKNOWN`.
8. **Record the result.** Use the template in `references/report-template.md`. Report automated mock results and real-device results in separate rows. Never merge them into one "通过".

## Commands

From `business/`:

```text
npm.cmd run check
npm.cmd test
npm.cmd run build:frontend
npm.cmd run test:browser        # includes scripts/call-browser-test.ts (mock voice, mock CLI)
```

`test:browser` uses Chrome's fake media device, an injected fake SpeechRecognition / speechSynthesis and a stubbed CLI. It proves UI state, cleanup and persistence only. It does not count as microphone, recognition, playback or inference acceptance.

## Claims you may make

- "此电脑上第一版按轮语音通话可用" only after three items pass with real evidence: the call UI, the designated-expert text dialogue, and the computer voice loop (real mic → real transcript → real expert generation → audible playback).
- Phone acceptance needs a real phone, trusted HTTPS, permissions, playback and hang-up release. Without that, phone acceptance stays 未验收.
- Malay stays unsupported until a real STT/TTS test passes.
