ALTER TABLE crawl_projection_outbox ADD COLUMN next_retry timestamptz NOT NULL DEFAULT now();
ALTER TABLE crawl_chunk_bindings ADD COLUMN document_key text;
ALTER TABLE crawl_chunk_bindings ADD COLUMN version_id text REFERENCES crawl_project_versions(id);
