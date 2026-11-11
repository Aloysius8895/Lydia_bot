ALTER TABLE crawl_tasks ADD COLUMN priority integer NOT NULL DEFAULT 0;
ALTER TABLE crawl_snapshots ADD COLUMN acquisition jsonb NOT NULL DEFAULT '{}';
ALTER TABLE crawl_submissions ADD COLUMN stage_evidence_id text REFERENCES crawl_evidence(id);
CREATE TABLE crawl_event_observations (
 id text PRIMARY KEY, event_id text NOT NULL REFERENCES crawl_events(id), snapshot_id text NOT NULL REFERENCES crawl_snapshots(id),
 year_basis text NOT NULL, evidence jsonb NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', UNIQUE(event_id,snapshot_id)
);
CREATE TABLE crawl_event_aliases (
 source_id text NOT NULL REFERENCES crawl_sources(id), alias text NOT NULL, event_id text NOT NULL REFERENCES crawl_events(id),
 PRIMARY KEY(source_id,alias)
);
CREATE TABLE crawl_result_candidates (
 id text PRIMARY KEY, source_id text NOT NULL REFERENCES crawl_sources(id), event_id text NOT NULL REFERENCES crawl_events(id),
 project_native_id text, project_url text, project_name text, outcome_kind text NOT NULL,
 label text NOT NULL, qualification text NOT NULL, verification text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','matched','conflicting','rejected')),
 project_id text REFERENCES crawl_projects(id), snapshot_id text NOT NULL REFERENCES crawl_snapshots(id),
 evidence jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, review jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crawl_result_observations (
 id text PRIMARY KEY, candidate_id text NOT NULL REFERENCES crawl_result_candidates(id),
 snapshot_id text NOT NULL REFERENCES crawl_snapshots(id), payload jsonb NOT NULL, UNIQUE(candidate_id,snapshot_id)
);
ALTER TABLE crawl_awards ADD COLUMN candidate_id text REFERENCES crawl_result_candidates(id);
ALTER TABLE crawl_submissions ADD COLUMN stage_candidate_id text REFERENCES crawl_result_candidates(id);
CREATE TABLE crawl_discovery_pages (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES crawl_runs(id), source_id text NOT NULL REFERENCES crawl_sources(id),
 task_id text NOT NULL REFERENCES crawl_tasks(id), snapshot_id text NOT NULL REFERENCES crawl_snapshots(id),
 collection_key text NOT NULL, page_url text NOT NULL, cursor text NOT NULL, fingerprint text NOT NULL,
 identities jsonb NOT NULL, new_count integer NOT NULL, next_url text, terminal_evidence text,
 state text NOT NULL CHECK(state IN ('more','complete','incomplete','stalled')), reason text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,snapshot_id)
);
CREATE INDEX crawl_discovery_collection ON crawl_discovery_pages(run_id,source_id,collection_key);
CREATE INDEX crawl_result_pending ON crawl_result_candidates(source_id,status,event_id);
