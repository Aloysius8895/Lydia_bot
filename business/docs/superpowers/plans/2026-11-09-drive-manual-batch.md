# Drive Manual Batch Plan

User approved on 2026-11-09: dedicated Lydia service account, shared delivery folder reader permission and drive.readonly, no domain-wide delegation. Implement manual single-batch pulling/validation/import acceptance only; daily sync stays disabled. Grok upload is independent and not connected yet. No deployment, push or modification of the existing 52 records.

**Implementation status:** Manual code, local credential protection, delivery contract and setup instructions complete. Types, PowerShell syntax and 24 isolated tests passed. No actual credential was read, no Drive request was made outside mocks, no formal DB was opened and no migration/deployment/push/schedule ran. Live acceptance remains NOT_RUN until user Cloud/sharing/credential preparation and Grok's independent upload setup. See `data/docs/DRIVE_MANUAL_ACCEPTANCE.md`.

**Architecture:** Private Drive API client with fixed read-only scope and service-account JWT, Windows current-user DPAPI credential storage, manifest validation pinned to configured folder IDs, content-addressed local staging and durable delivery receipts. Reuse FileImports in existing exclusive offline acceptance CLI, with the existing verified-backup requirement.

**Schema impact:** No new migration in this phase. Preserve file_import_batches/items/identities; extend the optional JSON provenance of batch file descriptors. New cloud receipts are local JSON audit artifacts, not a background queue. Source edits remain conflicts, never updates. Full revision updates and daily scheduling remain future work.

- [ ] Provide Google Cloud/service-account/Drive sharing instructions, credentials stored only locally.
- [ ] Implement fixed-host read-only JWT client, safe auth/retry errors, bounded downloads and parent/file identity validation. Never echo upstream errors, auth headers or credentials.
- [ ] Implement ready manifest file-ID/SHA256/count matching, same-name delivery handling, immutable staging and logical/physical receipt identity.
- [ ] Add manual connection check, pull/preview and explicit backup-gated execute modes; pass cloud provenance into the existing import audit.
- [ ] Verify in isolated tests: authentication scope/no sub claim, permission errors, expired auth, wrong parents, conflicting ready files, same-name duplicates, changed bytes, item identity, backup gating, prior-row preservation and real isolated DB search/readback.
- [ ] Update status and instructions. Do not connect live Drive, read an actual key, run formal import, create schedules or claim live upload acceptance before user configuration and Grok delivery are ready.
