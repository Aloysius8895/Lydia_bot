CREATE TABLE knowledge_news (
 id text PRIMARY KEY,
 origin_key text NOT NULL UNIQUE,
 title text NOT NULL,
 content text NOT NULL,
 url text,
 publisher text NOT NULL DEFAULT '',
 published_at text,
 content_hash text NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 meta jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE knowledge_runs ADD COLUMN news_ids jsonb NOT NULL DEFAULT '[]';
