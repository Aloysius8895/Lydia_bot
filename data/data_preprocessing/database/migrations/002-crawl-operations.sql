CREATE TABLE crawl_operations (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('import','export','selection')),
 input jsonb NOT NULL, request_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','failed')),
 result jsonb, error jsonb, lease_token text, lease_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
