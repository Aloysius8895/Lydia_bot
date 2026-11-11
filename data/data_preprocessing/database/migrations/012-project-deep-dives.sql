-- "深入了解": a detailed, quote-checked explanation of one hackathon project, made only when
-- the user asks. Every point in result carries an exact quote that was found in the material
-- recorded in result.sources; log records what was read, skipped or failed.
CREATE TABLE project_deep_dives (
 project_id text PRIMARY KEY REFERENCES crawl_projects(id),
 status text NOT NULL CHECK(status IN ('queued','running','ready','failed')),
 steps jsonb NOT NULL DEFAULT '[]',
 result jsonb,
 log jsonb NOT NULL DEFAULT '[]',
 error jsonb,
 attempts integer NOT NULL DEFAULT 0,
 requested_at timestamptz NOT NULL DEFAULT now(),
 generated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_deep_dives_status ON project_deep_dives(status,requested_at);

-- Briefs, format 2: each section is backed by exact quotes checked against what was read
-- (evidence). Format-1 briefs stay visible until their upgrade succeeds; a failed upgrade
-- keeps the old text and records why in upgrade_error.
ALTER TABLE project_briefs ADD COLUMN format smallint NOT NULL DEFAULT 1;
ALTER TABLE project_briefs ADD COLUMN evidence jsonb;
ALTER TABLE project_briefs ADD COLUMN upgrade_error jsonb;
