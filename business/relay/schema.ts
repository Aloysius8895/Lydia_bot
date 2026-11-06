export const relayStatements = [
  `CREATE TABLE IF NOT EXISTS relay_meta (
    key text PRIMARY KEY,
    data jsonb NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS relay_sessions (
    token_hash text PRIMARY KEY,
    csrf text NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS relay_devices (
    id text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS relay_heartbeats (
    device_id text PRIMARY KEY REFERENCES relay_devices(id),
    seen_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS relay_cases (
    id text PRIMARY KEY,
    title text NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS relay_tasks (
    id text PRIMARY KEY,
    case_id text NOT NULL,
    kind text NOT NULL,
    message text NOT NULL,
    request_key text NOT NULL UNIQUE,
    status text NOT NULL,
    checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
    error jsonb,
    result_summary text,
    lease_token text,
    lease_expires_at timestamptz,
    device_id text,
    claim_key text,
    execution_started boolean NOT NULL DEFAULT false,
    resume_requested boolean NOT NULL DEFAULT false,
    cancel_acked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT relay_tasks_status CHECK (status IN ('queued','claimed','running','paused','completed','cancelled')),
    CONSTRAINT relay_tasks_kind CHECK (kind IN ('research','question'))
  )`,
  `CREATE INDEX IF NOT EXISTS relay_tasks_status_created ON relay_tasks(status, created_at)`,
  `ALTER TABLE relay_tasks ADD COLUMN IF NOT EXISTS resume_requested boolean NOT NULL DEFAULT false`,
];
