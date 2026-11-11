-- AI-written reading aid for each hackathon project: problem / solution / implementation.
-- Kept in its own table so imported crawl_projects rows (and their audited fingerprints)
-- are never rewritten. A brief is not evidence; sources records what was actually read.
CREATE TABLE project_briefs (
 project_id text PRIMARY KEY REFERENCES crawl_projects(id),
 status text NOT NULL CHECK(status IN ('queued','running','ready','failed')),
 basis text CHECK(basis IN ('source_pages','summary_only')),
 problem text,
 solution text,
 implementation text,
 missing jsonb NOT NULL DEFAULT '[]',
 sources jsonb NOT NULL DEFAULT '[]',
 error jsonb,
 model text,
 project_revision integer,
 attempts integer NOT NULL DEFAULT 0,
 requested_at timestamptz NOT NULL DEFAULT now(),
 generated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_briefs_status ON project_briefs(status,requested_at);
