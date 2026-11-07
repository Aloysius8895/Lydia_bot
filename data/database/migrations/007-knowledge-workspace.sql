CREATE TABLE knowledge_runs (
 id text PRIMARY KEY,
 request_key text NOT NULL UNIQUE,
 input_hash text NOT NULL,
 project_ids jsonb NOT NULL,
 constraints jsonb NOT NULL DEFAULT '{}',
 sources jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
 output jsonb, error jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE knowledge_ideas (
 id text PRIMARY KEY,
 run_id text NOT NULL REFERENCES knowledge_runs(id),
 candidate_index integer NOT NULL,
 title text NOT NULL,
 snapshot jsonb NOT NULL,
 note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'explore' CHECK(status IN ('explore','shortlist','archived')),
 case_id text REFERENCES cases(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,candidate_index)
);
