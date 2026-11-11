# Runtime Data Responsibility Correction

User instruction on 2026-11-09 explicitly corrects the earlier layout: actual data, not only data-processing code, belongs under workspace `data`. Execute this corrective relocation inline. No deployment, push, automatic sync or new schema.

**Completed:** All relocation, responsibility splitting and requested readable classifications are implemented. 6,763 stored files were hash-verified, 52 business records and their classified JSON snapshots match the final DB, original row fingerprints are unchanged and 251 references resolve correctly. Types and targeted regressions pass. See `data/docs/2026-11-09-layout-acceptance.md` for final paths and validation details. Service remains paused.

**Goal:** Move the existing authoritative DB, backups, reports and case exports into root data without losing records or creating a parallel DB.

**Final layout after user steering:** `data/data_preprocessing/{RAG,database,crawl,imports}` contains code, schema and data processing. `data/data_storage/{database,backups,import-reports,crawl,cases}` contains actual records and snapshots. Application runtime/CLI and deployment configuration remain under business; legacy server log/process files incorrectly mixed into the DB go to `business/deployment/.runtime/logs/legacy`. Do not move Downloads originals or unrelated external application data.

**Additional user steering implemented:** Data maintenance CLIs are in data_preprocessing/cli. Storage is further split into library/news, library/hackathon_projects (claimed status/theme/subtheme/platform/record), tag/publisher/SDG candidate reference indexes, raw_imports/grok/date, backups/database, reports/imports/{previews,batches}, reports/relocations, research/exports and crawl. SDG candidates are explicit organization suggestions based on source tags, never fabricated source facts. A classified folder snapshot is a readable view of the single authoritative DB; no automatic sync or duplicate writable source of truth.

- [ ] Inspect running state and ensure no writer or supervisor. The existing remote task is stopped.
- [ ] Record original row fingerprints and all file hashes. Do not inspect settings, sessions, env secrets or private keys. Record directory/file metadata for sensitive backups without parsing them.
- [ ] Verify resolved source and target paths remain within this workspace, reject existing targets/symlinks, hold 4317 guard, rename actual directories on the same drive, and hash-compare all moved files before opening DB.
- [ ] Read back DB through a single Store, compare original business rows, migrations, 37 projects/15 news, and existing search logic. Leave existing snapshots/reports immutable; add an old-to-new location map.
- [ ] Update central data root, default DB and exports paths. Refuse to silently create a new default DB if the legacy directory remains. Add path regression tests.
- [ ] Update current docs and import commands. Keep historical audit paths as historical values with relocation annotations. Verify types, targeted tests and unchanged production frontend assets. Keep service paused.
