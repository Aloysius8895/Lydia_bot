ALTER TABLE crawl_runs ADD COLUMN budget_epoch timestamptz NOT NULL DEFAULT now();
ALTER TABLE crawl_runs ADD COLUMN budget_history jsonb NOT NULL DEFAULT '[]';
ALTER TABLE crawl_selection_decisions ADD COLUMN selection_version integer NOT NULL DEFAULT 1;
ALTER TABLE crawl_selection_decisions DROP CONSTRAINT crawl_selection_decisions_run_id_project_id_key;
ALTER TABLE crawl_selection_decisions ADD UNIQUE(run_id,project_id,selection_version);
ALTER TABLE crawl_operations DROP CONSTRAINT crawl_operations_kind_check;
ALTER TABLE crawl_operations ADD CHECK(kind IN ('import','export','selection','enrich'));
CREATE TABLE crawl_resource_checks (
 id text PRIMARY KEY, resource_id text NOT NULL REFERENCES crawl_resources(id),
 snapshot_id text NOT NULL REFERENCES crawl_snapshots(id), status text NOT NULL,
 content text, content_hash text, version_basis jsonb NOT NULL DEFAULT '{}',
 checked_at timestamptz NOT NULL DEFAULT now(), UNIQUE(resource_id,snapshot_id)
);
