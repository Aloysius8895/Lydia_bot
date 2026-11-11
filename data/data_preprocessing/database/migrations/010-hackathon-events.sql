-- Hackathon events tracked from external producers (Grok). An event is only a
-- tracking record: results come from linked project records, never from the
-- event itself, so a claimed finalist/winner always has its own audited row.
CREATE TABLE hackathon_events (
 id text PRIMARY KEY,
 external_id text,
 source_id text NOT NULL,
 platform text NOT NULL,
 name text NOT NULL,
 url text NOT NULL,
 submission_deadline timestamptz,
 deadline_note text,
 event_dates text,
 match_names jsonb NOT NULL DEFAULT '[]',
 meta jsonb NOT NULL DEFAULT '{}',
 tracking boolean NOT NULL DEFAULT true,
 discovered_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hackathon_events_deadline ON hackathon_events(tracking,submission_deadline);
ALTER TABLE file_import_items DROP CONSTRAINT IF EXISTS file_import_items_target_type_check;
ALTER TABLE file_import_items ADD CONSTRAINT file_import_items_target_type_check CHECK(target_type IN ('project','news','event'));
ALTER TABLE file_import_identities DROP CONSTRAINT IF EXISTS file_import_identities_kind_check;
ALTER TABLE file_import_identities ADD CONSTRAINT file_import_identities_kind_check CHECK(kind IN ('project','news','event'));
