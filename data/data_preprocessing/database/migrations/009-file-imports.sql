CREATE TABLE file_import_batches (
 id text PRIMARY KEY, importer_version text NOT NULL, files jsonb NOT NULL,
 backup_manifest text, status text NOT NULL CHECK(status IN ('running','completed','interrupted')),
 counts jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE file_import_items (
 id text PRIMARY KEY, batch_id text NOT NULL REFERENCES file_import_batches(id),
 ordinal integer NOT NULL, file_name text NOT NULL, json_path text NOT NULL,
 kind text, input_hash text NOT NULL, input jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('imported','duplicate','conflict','failed')),
 target_type text CHECK(target_type IN ('project','news')), target_id text,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,ordinal)
);
CREATE TABLE file_import_identities (
 kind text NOT NULL CHECK(kind IN ('project','news')), namespace text NOT NULL,
 identity_key text NOT NULL, target_id text NOT NULL,
 first_batch_id text NOT NULL REFERENCES file_import_batches(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,namespace,identity_key)
);
CREATE INDEX file_import_item_target ON file_import_items(target_type,target_id);
