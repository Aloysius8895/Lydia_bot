-- Expert one-to-one turn-based calls. Additive only; earlier tables are untouched.
CREATE TABLE IF NOT EXISTS call_sessions (
 id text PRIMARY KEY,
 case_id text NOT NULL REFERENCES cases(id),
 role text NOT NULL CHECK(role IN ('steve','teresa','april','bob','ash')),
 status text NOT NULL CHECK(status IN ('ACTIVE','ENDED')),
 request_key text NOT NULL,
 meta jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 UNIQUE(case_id,request_key)
);
CREATE INDEX IF NOT EXISTS call_sessions_case ON call_sessions(case_id,created_at);
CREATE TABLE IF NOT EXISTS call_turns (
 id text PRIMARY KEY,
 call_id text NOT NULL REFERENCES call_sessions(id),
 case_id text NOT NULL REFERENCES cases(id),
 role text NOT NULL,
 seq integer NOT NULL,
 status text NOT NULL CHECK(status IN ('QUEUED','THINKING','COMPLETED','FAILED','CANCELLED')),
 request_key text NOT NULL,
 input_source text NOT NULL CHECK(input_source IN ('TEXT','BROWSER_STT')),
 user_text text NOT NULL,
 stt jsonb NOT NULL DEFAULT '{}',
 corrections jsonb NOT NULL DEFAULT '[]',
 reply jsonb,
 provenance jsonb NOT NULL DEFAULT '{}',
 playback jsonb NOT NULL DEFAULT '{}',
 error jsonb,
 timings jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(call_id,request_key),
 UNIQUE(call_id,seq)
);
CREATE INDEX IF NOT EXISTS call_turns_call ON call_turns(call_id,seq);
