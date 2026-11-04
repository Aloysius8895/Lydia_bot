CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS cases (
  id text PRIMARY KEY, title text NOT NULL, brief text NOT NULL,
  phase text NOT NULL DEFAULT 'SCOPED' CHECK (phase IN ('SCOPED','RESEARCHING','AWAITING_SELECTION','MODELING')),
  selected_gap_id text, selection_version integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS counters (scope text PRIMARY KEY, value integer NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY, case_id text REFERENCES cases(id), collection text NOT NULL CHECK(collection IN ('METHOD','MARKET','PROJECT')),
  source_id text NOT NULL, title text NOT NULL, content text NOT NULL, content_hash text NOT NULL,
  url text, canonical_url text, meta jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_scope ON documents(case_id,collection,active);
DROP INDEX IF EXISTS documents_active_hash;
CREATE UNIQUE INDEX documents_active_hash ON documents(COALESCE(case_id,'GLOBAL'),collection,COALESCE(meta->>'role',''),content_hash) WHERE active=true AND meta->>'origin_key' IS NULL;
CREATE TABLE IF NOT EXISTS chunks (
  id text PRIMARY KEY, document_id text NOT NULL REFERENCES documents(id), case_id text REFERENCES cases(id),
  collection text NOT NULL, content text NOT NULL, position jsonb NOT NULL,
  search_text text NOT NULL, embedding vector, embedding_model text,
  embedding_dimension integer, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_scope ON chunks(case_id,collection);
CREATE TABLE IF NOT EXISTS gaps (
  case_id text NOT NULL REFERENCES cases(id), id text NOT NULL, data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,id)
);
CREATE TABLE IF NOT EXISTS claims (
  case_id text NOT NULL REFERENCES cases(id), id text NOT NULL, data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,id)
);
CREATE TABLE IF NOT EXISTS requirements (
  case_id text NOT NULL REFERENCES cases(id), id text NOT NULL, gap_id text, data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,id),
  FOREIGN KEY (case_id,gap_id) REFERENCES gaps(case_id,id)
);
CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(id), gap_id text NOT NULL,
  version integer NOT NULL, user_message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(case_id,gap_id) REFERENCES gaps(case_id,id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(id), kind text NOT NULL,
  status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','PAUSED','FAILED','COMPLETED','CANCELLED')),
  input jsonb NOT NULL, request_key text NOT NULL, selection_version integer NOT NULL,
  checkpoint jsonb NOT NULL DEFAULT '{}', error jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_id,request_key)
);
CREATE TABLE IF NOT EXISTS expert_runs (
  task_id text NOT NULL REFERENCES tasks(id), step text NOT NULL, role text NOT NULL,
  output jsonb NOT NULL, provenance jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(task_id,step)
);
CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(id), task_id text REFERENCES tasks(id),
  kind text NOT NULL, selection_version integer NOT NULL, content text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, csrf text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS fetch_attempts (
  id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(id), url text NOT NULL,
  status text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS search_budgets (
  account_id text NOT NULL, period text NOT NULL, remaining integer NOT NULL CHECK(remaining>=0),
  checked_at timestamptz NOT NULL, PRIMARY KEY(account_id,period)
);
CREATE TABLE IF NOT EXISTS search_requests (
  id text PRIMARY KEY, case_id text NOT NULL REFERENCES cases(id), task_id text REFERENCES tasks(id),
  account_id text NOT NULL, period text NOT NULL, credits integer NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
