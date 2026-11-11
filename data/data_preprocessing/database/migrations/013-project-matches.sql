-- 「相似与搭档」: one Claude comparison of a hackathon project with the rest of the library
-- (mode 'project') or with every news item (mode 'news'), made only when the user asks.
-- result holds the checked scores and, in library_ids, what was compared, so the page can say
-- how many items arrived later without re-running anything.
CREATE TABLE project_matches (
 project_id text NOT NULL REFERENCES crawl_projects(id),
 mode text NOT NULL CHECK(mode IN ('project','news')),
 status text NOT NULL CHECK(status IN ('queued','running','ready','failed')),
 steps jsonb NOT NULL DEFAULT '[]',
 result jsonb,
 error jsonb,
 attempts integer NOT NULL DEFAULT 0,
 requested_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 generated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,mode)
);
CREATE INDEX project_matches_status ON project_matches(status,requested_at);

-- The original article of a news item, read from its source links (an imported news record holds
-- only Grok's summary). Kept apart from knowledge_news so imported rows and their audited
-- fingerprints are never rewritten. log records every link tried and why it failed.
CREATE TABLE news_sources (
 news_id text PRIMARY KEY REFERENCES knowledge_news(id),
 status text NOT NULL CHECK(status IN ('read','failed')),
 url text,
 title text,
 content text NOT NULL DEFAULT '',
 log jsonb NOT NULL DEFAULT '[]',
 fetched_at timestamptz NOT NULL DEFAULT now()
);
