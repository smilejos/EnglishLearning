-- Up Migration
CREATE TABLE scenario_studio_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scenario_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), draft JSONB NOT NULL,
  created_by BIGINT REFERENCES users(id), materialized_revision INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE scenario_studio_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), draft_id UUID NOT NULL REFERENCES scenario_studio_drafts(id),
  kind TEXT NOT NULL CHECK(kind IN ('story','image','story-audio','wordbank-audio','finalize')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','failed','uncertain','cancelled')),
  input_version INTEGER NOT NULL, input_hash TEXT NOT NULL, input JSONB NOT NULL,
  idempotency_key TEXT NOT NULL, output JSONB, error TEXT, lease_token UUID, lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draft_id,idempotency_key)
);
CREATE INDEX scenario_studio_jobs_queue ON scenario_studio_jobs(created_at) WHERE status='queued';
CREATE TABLE scenario_studio_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID NOT NULL REFERENCES scenario_studio_jobs(id),
  clip_key TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('sending','received','succeeded','failed','uncertain')),
  estimated_cost_usd_micros BIGINT NOT NULL DEFAULT 0, provider_request_id TEXT, usage JSONB, error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE TABLE scenario_studio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), draft_id UUID NOT NULL REFERENCES scenario_studio_drafts(id),
  kind TEXT NOT NULL CHECK(kind IN ('image','story-audio')), relative_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL, bytes BIGINT NOT NULL CHECK(bytes>0), content_type TEXT NOT NULL,
  width INTEGER, height INTEGER, duration_seconds DOUBLE PRECISION, text_sha256 TEXT,
  input_hash TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE scenario_studio_worker_heartbeats (
  id UUID PRIMARY KEY, capabilities JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE scenario_studio_revision_reservations (
  job_id UUID PRIMARY KEY REFERENCES scenario_studio_jobs(id), scenario_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0), UNIQUE(scenario_key,revision)
);
CREATE TABLE scenario_studio_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), draft_id UUID NOT NULL REFERENCES scenario_studio_drafts(id),
  kind TEXT NOT NULL, input_version INTEGER NOT NULL, input_hash TEXT NOT NULL, snapshot JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '10 minutes'
);
-- Down Migration
DROP TABLE scenario_studio_quotes;
DROP TABLE scenario_studio_revision_reservations;
DROP TABLE scenario_studio_worker_heartbeats;
DROP TABLE scenario_studio_assets;
DROP TABLE scenario_studio_attempts;
DROP TABLE scenario_studio_jobs;
DROP TABLE scenario_studio_drafts;
