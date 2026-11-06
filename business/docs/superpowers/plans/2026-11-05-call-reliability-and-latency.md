# Expert call reliability and latency repair

Scope: repair the already authorized v1.3 continuous call. Keep Claude CLI, the shared serial queue, existing subscription guard and evidence checks. No TTS vendor/key is selected or installed in this repair.

Observed: user calls failed with CLI_SCHEMA_MISSING after 35.3s and 26.6s; queue wait was zero. A real CLI replay returned prose-fenced JSON without structured_output; its display_text contained unescaped quotes, and a project fact was incorrectly labelled market-supported. Authentication measured 408ms. Do not attribute all waiting to browser recognition or paid voice providers.

- [x] Add a dialogue-only CLI profile: short non-coding system prompt, low effort on the existing model, compact output. Research retains its current profile.
- [x] Prefer native structured output; validate every result. Test actual CLI output and keep malformed JSON rejected instead of regex-repairing or speaking unvalidated text.
- [x] Keep short conversational responses, infer current request from project/history, answer requested outlines directly, avoid repeated stock questions and method/report handoffs.
- [x] Separate context/auth/generation/validation timing; retain safe format diagnostics without logging raw conversation or account data.
- [x] Fence duplicate in-flight recognition; preserve deliberate retries after failures and latest corrections.
- [x] Fix failed-turn UI: show an answer failure instead of endless thinking, and retry the failed question with an explicit new turn/key.
- [x] Run targeted regressions, type check, full tests, frontend build and browser tests. Run real CLI dialogue smoke checks with the existing billing confirmation; report measured results without promising device latency.
- [x] Restart the local app and update the acceptance report. Previous mock passes do not prove this regression fixed.

Root cause confirmed by real init tools: Draft 2020-12 $schema omitted the schema-return tool. The dialogue wire schema now omits only this declaration; final two real calls returned native structured output (7.707s, 7.575s). Raw malformed output remains rejected. New real audio validation remains pending.
