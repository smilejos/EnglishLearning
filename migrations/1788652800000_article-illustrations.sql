-- Up Migration
CREATE TABLE image_worker_heartbeats (
  id uuid PRIMARY KEY, models jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE illustration_estimates (
  id uuid PRIMARY KEY, article_id bigint NOT NULL REFERENCES articles ON DELETE CASCADE,
  source_hash text NOT NULL, model_config_hash text NOT NULL, pricing_config_hash text NOT NULL,
  snapshot jsonb NOT NULL, base_cost_usd_micros bigint NOT NULL CHECK (base_cost_usd_micros > 0),
  max_cost_usd_micros bigint NOT NULL CHECK (max_cost_usd_micros >= base_cost_usd_micros),
  created_by bigint NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, consumed_at timestamptz, consumed_by_run_id bigint
);
CREATE TABLE article_visual_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id bigint NOT NULL REFERENCES articles ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0), parent_run_id bigint REFERENCES article_visual_runs ON DELETE SET NULL,
  estimate_id uuid REFERENCES illustration_estimates ON DELETE SET NULL,
  request_idempotency_key uuid NOT NULL, source_hash text NOT NULL, source_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','planning','waiting_reference_review','generating','review','partial_failed','failed','cancelled','published','superseded')),
  model_id text NOT NULL, provider text NOT NULL, api_model text NOT NULL,
  model_config_snapshot jsonb NOT NULL, pricing_profile_snapshot jsonb NOT NULL,
  planner_snapshot jsonb NOT NULL, prompt_template_version text NOT NULL, plan_json jsonb,
  estimated_cost_usd_micros bigint NOT NULL CHECK (estimated_cost_usd_micros > 0),
  reserved_cost_usd_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_cost_usd_micros >= 0),
  actual_cost_usd_micros bigint NOT NULL DEFAULT 0 CHECK (actual_cost_usd_micros >= 0),
  max_cost_usd_micros bigint NOT NULL CHECK (max_cost_usd_micros > 0),
  created_by bigint NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (article_id, revision), UNIQUE (article_id, created_by, request_idempotency_key), UNIQUE(article_id,id)
);
ALTER TABLE illustration_estimates ADD FOREIGN KEY (consumed_by_run_id) REFERENCES article_visual_runs ON DELETE SET NULL;
CREATE TABLE article_visual_publications (
  article_id bigint PRIMARY KEY REFERENCES articles ON DELETE CASCADE,
  run_id bigint NOT NULL UNIQUE,
  FOREIGN KEY(article_id,run_id) REFERENCES article_visual_runs(article_id,id) ON DELETE CASCADE
);
CREATE TABLE illustration_assets (
  id uuid PRIMARY KEY, sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE illustration_asset_files (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES illustration_assets ON DELETE CASCADE,
  variant text NOT NULL CHECK (variant IN ('master','web','cover-card','cover-hero','cover-player')),
  object_key text NOT NULL UNIQUE, mime_type text NOT NULL,
  width integer NOT NULL CHECK(width > 0), height integer NOT NULL CHECK(height > 0),
  byte_size bigint NOT NULL CHECK(byte_size > 0), UNIQUE(asset_id,variant)
);
CREATE TABLE illustration_slots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES article_visual_runs ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cover','paragraph','reference')),
  paragraph_id bigint REFERENCES paragraphs ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true, skip_reason text, selected_candidate_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='paragraph') = (paragraph_id IS NOT NULL)),
  CHECK (required OR (skip_reason IS NOT NULL AND length(trim(skip_reason)) > 0)),
  UNIQUE(run_id,paragraph_id), UNIQUE(run_id,id)
);
CREATE UNIQUE INDEX illustration_cover_unique ON illustration_slots(run_id) WHERE kind='cover';
CREATE UNIQUE INDEX illustration_reference_unique ON illustration_slots(run_id) WHERE kind='reference';
CREATE TABLE illustration_candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_id bigint NOT NULL REFERENCES illustration_slots ON DELETE CASCADE,
  candidate_no integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','approved','rejected','failed','uncertain','cancelled')),
  derived_from_candidate_id bigint REFERENCES illustration_candidates ON DELETE SET NULL,
  prompt_json jsonb NOT NULL, model_snapshot jsonb NOT NULL,
  asset_id uuid REFERENCES illustration_assets,
  focal_x real NOT NULL DEFAULT 0.5 CHECK(focal_x BETWEEN 0 AND 1),
  focal_y real NOT NULL DEFAULT 0.5 CHECK(focal_y BETWEEN 0 AND 1),
  alt_text text NOT NULL, teaching_targets jsonb NOT NULL DEFAULT '[]', latest_error text,
  reviewed_by bigint REFERENCES users, reviewed_at timestamptz, review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(slot_id,candidate_no), UNIQUE(slot_id,id)
);
ALTER TABLE illustration_slots ADD CONSTRAINT selected_candidate_owns_slot
  FOREIGN KEY(id,selected_candidate_id) REFERENCES illustration_candidates(slot_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE illustration_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('plan','generate','derive','qa')),
  run_id bigint NOT NULL REFERENCES article_visual_runs ON DELETE CASCADE,
  slot_id bigint REFERENCES illustration_slots ON DELETE CASCADE,
  candidate_id bigint REFERENCES illustration_candidates ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE, error text, lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX illustration_jobs_pending ON illustration_jobs(available_at,id) WHERE status='pending';
CREATE TABLE illustration_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES article_visual_runs ON DELETE CASCADE,
  job_id bigint NOT NULL REFERENCES illustration_jobs ON DELETE CASCADE,
  candidate_id bigint REFERENCES illustration_candidates ON DELETE CASCADE,
  operation_kind text NOT NULL, provider text NOT NULL, api_model text NOT NULL,
  request_fingerprint text NOT NULL, prompt_fingerprint text NOT NULL,
  state text NOT NULL CHECK(state IN ('reserved','sending','succeeded','failed','uncertain')),
  provider_request_id text, estimated_cost_usd_micros bigint NOT NULL CHECK(estimated_cost_usd_micros > 0),
  reserved_cost_usd_micros bigint NOT NULL CHECK(reserved_cost_usd_micros >= 0),
  billing_status text NOT NULL CHECK(billing_status IN ('estimated','actual','not_charged','unknown')),
  actual_cost_usd_micros bigint CHECK(actual_cost_usd_micros >= 0), usage_json jsonb, error text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE illustration_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint REFERENCES article_visual_runs ON DELETE SET NULL,
  slot_id bigint, candidate_id bigint, event_kind text NOT NULL,
  actor_user_id bigint REFERENCES users, reason text, metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE illustration_cleanup_jobs (
  object_key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), error text
);
-- File deletion is retried independently of article/run transactions.
CREATE FUNCTION illustration_queue_asset_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO illustration_cleanup_jobs(object_key) VALUES(OLD.object_key) ON CONFLICT DO NOTHING;
  RETURN OLD;
END $$;
CREATE TRIGGER illustration_file_cleanup BEFORE DELETE ON illustration_asset_files
  FOR EACH ROW EXECUTE FUNCTION illustration_queue_asset_cleanup();
CREATE FUNCTION illustration_release_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM illustration_assets a WHERE a.id=OLD.asset_id
    AND NOT EXISTS(SELECT 1 FROM illustration_candidates c WHERE c.asset_id=a.id);
  RETURN OLD;
END $$;
CREATE TRIGGER illustration_candidate_cleanup AFTER DELETE ON illustration_candidates
  FOR EACH ROW EXECUTE FUNCTION illustration_release_asset();

-- Down Migration
DROP TABLE image_worker_heartbeats;
DROP TRIGGER illustration_candidate_cleanup ON illustration_candidates;
DROP FUNCTION illustration_release_asset();
DROP TRIGGER illustration_file_cleanup ON illustration_asset_files;
DROP FUNCTION illustration_queue_asset_cleanup();
DROP TABLE illustration_cleanup_jobs, illustration_audit_events, illustration_attempts, illustration_jobs;
ALTER TABLE illustration_slots DROP CONSTRAINT selected_candidate_owns_slot;
DROP TABLE illustration_candidates, illustration_slots, illustration_asset_files, illustration_assets, article_visual_publications;
ALTER TABLE illustration_estimates DROP CONSTRAINT illustration_estimates_consumed_by_run_id_fkey;
DROP TABLE article_visual_runs, illustration_estimates;
