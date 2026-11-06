# ElevenLabs TTS integration

User-authorized scope: investigate the supplied Instant Voice Cloning page with REA; integrate useful voice capabilities into Lydia/audio. Keep Claude CLI and existing STT. Use official API contracts, not private dashboard endpoints or copied proprietary synthesis code.

Design: optional ElevenLabs TTS alongside the current browser voice. Authenticate the backend proxy, protect mutations with CSRF, keep the key on the server, persist encrypted credentials under the existing private runtime, and return only configuration status to browsers. Default remains browser speech until explicitly selected and configured. No implicit paid fallback or automatic retries that regenerate billed audio.

- [x] Record official capability/model/price/API findings and passive REA evidence for the supplied public route; report login/coverage limits.
- [x] Add backend settings, credential storage, account voice listing, fixed-text preview, and streaming audio for completed validated call turns. Restrict upstream host, text source, concurrency, timeouts and response size. Abort on interruption/disconnect.
- [x] Add a voice settings panel: API key entry/delete, provider, model, voice, per-expert voice overrides and explicit preview. Show cloud text processing and account-usage implications. Keep keys out of localStorage and API responses.
- [x] Add browser streamed MP3 playback with MediaSource when supported and a clearly identified buffered fallback; stop fetch/playback and revoke URLs on interruption, hangup and unmount. Keep actual playback reporting and generation fencing.
- [x] Wire provider/voice selection into the existing call card, including greeting, without changing expert reasoning, STT or desktop layout.
- [x] Verify authenticated routes, secret redaction, provider errors, no-key behavior, persisted configuration, scoped text access and cancellation using local provider fixtures. Run typecheck, full tests, build and browser verification.
- [x] Save investigation, architecture and setup steps under audio/elevenlabs. Report real ElevenLabs audio as unverified until the user supplies a key in the app and tests it.

Verification complete: 84 tests, typecheck, build and complete browser suite pass. Public REA is login-limited; real ElevenLabs synthesis and voice quality remain pending a user-configured key.
