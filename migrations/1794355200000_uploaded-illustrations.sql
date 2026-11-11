-- Up Migration
ALTER TABLE article_visual_runs ADD COLUMN source_mode text NOT NULL DEFAULT 'ai'
  CHECK (source_mode IN ('ai','manual'));
ALTER TABLE article_visual_runs DROP CONSTRAINT article_visual_runs_estimated_cost_usd_micros_check;
ALTER TABLE article_visual_runs ADD CONSTRAINT article_visual_runs_estimated_cost_usd_micros_check
  CHECK (estimated_cost_usd_micros >= 0 AND (estimated_cost_usd_micros > 0 OR source_mode = 'manual'));
ALTER TABLE illustration_candidates ADD COLUMN source text NOT NULL DEFAULT 'generated'
  CHECK (source IN ('generated','upload'));
ALTER TABLE illustration_candidates ADD COLUMN upload_idempotency_key uuid;
ALTER TABLE illustration_candidates ADD COLUMN upload_fingerprint text;
CREATE UNIQUE INDEX illustration_upload_request_unique ON illustration_candidates(slot_id,upload_idempotency_key)
  WHERE upload_idempotency_key IS NOT NULL;

-- Down Migration
DROP INDEX illustration_upload_request_unique;
ALTER TABLE illustration_candidates DROP COLUMN upload_fingerprint, DROP COLUMN upload_idempotency_key, DROP COLUMN source;
-- A zero-cost manual revision cannot be represented by the older schema.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM article_visual_runs WHERE estimated_cost_usd_micros = 0) THEN
    RAISE EXCEPTION 'Cannot remove upload support while zero-cost manual revisions exist';
  END IF;
END $$;
ALTER TABLE article_visual_runs DROP CONSTRAINT article_visual_runs_estimated_cost_usd_micros_check;
ALTER TABLE article_visual_runs ADD CONSTRAINT article_visual_runs_estimated_cost_usd_micros_check CHECK (estimated_cost_usd_micros > 0);
ALTER TABLE article_visual_runs DROP COLUMN source_mode;
