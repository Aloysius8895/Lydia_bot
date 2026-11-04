CREATE TABLE crawl_sources (
 id text PRIMARY KEY, name text NOT NULL, entry_url text NOT NULL,
 status text NOT NULL DEFAULT 'unaudited', audit jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE crawl_runs (
 id text PRIMARY KEY, request_key text NOT NULL UNIQUE, config jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('running','paused','completed','cancelled')),
 completeness text NOT NULL DEFAULT 'incomplete', reason text,
 pages integer NOT NULL DEFAULT 0, bytes bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crawl_tasks (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES crawl_runs(id), source_id text NOT NULL REFERENCES crawl_sources(id),
 kind text NOT NULL, url text NOT NULL, input jsonb NOT NULL DEFAULT '{}', idempotency_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','retry_wait','succeeded','failed','blocked','cancelled')),
 attempt integer NOT NULL DEFAULT 0, retry_at timestamptz, lease_token text, lease_expires_at timestamptz,
 checkpoint jsonb NOT NULL DEFAULT '{}', error jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crawl_task_queue ON crawl_tasks(status,retry_at,created_at);
CREATE TABLE crawl_snapshots (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES crawl_tasks(id), requested_url text NOT NULL, final_url text NOT NULL,
 status_code integer NOT NULL, headers jsonb NOT NULL, content_type text NOT NULL, classification text NOT NULL,
 sha256 text NOT NULL, blob_path text NOT NULL, byte_length integer NOT NULL, backend text NOT NULL,
 captured_at timestamptz NOT NULL
);
CREATE TABLE crawl_events (
 id text PRIMARY KEY, source_id text NOT NULL REFERENCES crawl_sources(id), native_id text NOT NULL,
 name text NOT NULL, year integer CHECK(year IN (2025,2026)), url text, meta jsonb NOT NULL DEFAULT '{}',
 UNIQUE(source_id,native_id)
);
CREATE TABLE crawl_projects (
 id text PRIMARY KEY, source_id text NOT NULL REFERENCES crawl_sources(id), native_id text NOT NULL,
 title text NOT NULL, url text NOT NULL, current_version_id text, revision integer NOT NULL DEFAULT 1,
 depth text NOT NULL DEFAULT 'L1', quality text NOT NULL DEFAULT 'partial', meta jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,native_id)
);
CREATE TABLE crawl_project_versions (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES crawl_projects(id), snapshot_id text NOT NULL REFERENCES crawl_snapshots(id),
 content text NOT NULL, content_hash text NOT NULL, parser_version text NOT NULL, meta jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,content_hash)
);
ALTER TABLE crawl_projects ADD CONSTRAINT crawl_current_version FOREIGN KEY(current_version_id) REFERENCES crawl_project_versions(id);
CREATE TABLE crawl_submissions (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES crawl_projects(id), event_id text NOT NULL REFERENCES crawl_events(id),
 version_id text REFERENCES crawl_project_versions(id), stage text NOT NULL DEFAULT 'unknown', meta jsonb NOT NULL DEFAULT '{}',
 UNIQUE(project_id,event_id)
);
CREATE TABLE crawl_evidence (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES crawl_projects(id), version_id text NOT NULL REFERENCES crawl_project_versions(id),
 snapshot_id text NOT NULL REFERENCES crawl_snapshots(id), field text NOT NULL, value jsonb NOT NULL,
 quote text NOT NULL, locator text NOT NULL, nature text NOT NULL, status text NOT NULL DEFAULT 'present',
 UNIQUE(version_id,field,locator)
);
CREATE TABLE crawl_awards (
 id text PRIMARY KEY, submission_id text NOT NULL REFERENCES crawl_submissions(id), name text NOT NULL,
 evidence_id text NOT NULL REFERENCES crawl_evidence(id), verification text NOT NULL,
 UNIQUE(submission_id,name)
);
CREATE TABLE crawl_resources (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES crawl_projects(id), version_id text NOT NULL REFERENCES crawl_project_versions(id),
 url text NOT NULL, kind text NOT NULL, status text NOT NULL DEFAULT 'not_fetched', meta jsonb NOT NULL DEFAULT '{}', UNIQUE(version_id,url)
);
CREATE TABLE crawl_quality_issues (
 id text PRIMARY KEY, project_id text REFERENCES crawl_projects(id), task_id text REFERENCES crawl_tasks(id),
 rule text NOT NULL, severity text NOT NULL, details jsonb NOT NULL, status text NOT NULL DEFAULT 'open', resolution jsonb
);
CREATE TABLE crawl_selection_decisions (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES crawl_runs(id), project_id text NOT NULL REFERENCES crawl_projects(id),
 selected boolean NOT NULL, reason text NOT NULL, primary_event_id text REFERENCES crawl_events(id), config jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,project_id)
);
CREATE TABLE crawl_relations (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES crawl_projects(id), target_type text NOT NULL,
 target_id text NOT NULL, relation_type text NOT NULL, nature text NOT NULL,
 evidence_id text REFERENCES crawl_evidence(id), version_id text REFERENCES crawl_project_versions(id), active boolean NOT NULL DEFAULT true
);
CREATE TABLE crawl_projection_outbox (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES crawl_projects(id), revision integer NOT NULL,
 target text NOT NULL DEFAULT 'case_rag', status text NOT NULL DEFAULT 'pending', attempt integer NOT NULL DEFAULT 0,
 error jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,revision,target)
);
CREATE TABLE crawl_rag_bindings (
 id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(id), project_id text NOT NULL REFERENCES crawl_projects(id),
 version_id text NOT NULL REFERENCES crawl_project_versions(id), document_id text NOT NULL REFERENCES documents(id),
 origin_key text NOT NULL, document_key text NOT NULL, revision integer NOT NULL, status text NOT NULL,
 UNIQUE(case_id,origin_key)
);
CREATE TABLE crawl_chunk_bindings (
 chunk_key text PRIMARY KEY, binding_id text NOT NULL REFERENCES crawl_rag_bindings(id), chunk_id text NOT NULL REFERENCES chunks(id),
 source_position jsonb NOT NULL
);
DROP INDEX IF EXISTS documents_active_hash;
CREATE UNIQUE INDEX documents_active_hash ON documents(COALESCE(case_id,'GLOBAL'),collection,COALESCE(meta->>'role',''),content_hash)
 WHERE active=true AND meta->>'origin_key' IS NULL;
CREATE UNIQUE INDEX documents_active_origin ON documents(case_id,collection,(meta->>'origin_key'))
 WHERE active=true AND meta->>'origin_key' IS NOT NULL;
