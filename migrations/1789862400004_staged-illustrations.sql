-- Up Migration
ALTER TABLE article_visual_runs ADD COLUMN workflow_version integer NOT NULL DEFAULT 1;
ALTER TABLE article_visual_runs ADD COLUMN visual_bible text;
ALTER TABLE illustration_slots ADD COLUMN prompt_draft text;
ALTER TABLE illustration_slots ADD COLUMN prompt_revision integer NOT NULL DEFAULT 0;
ALTER TABLE illustration_slots ADD COLUMN prompt_status text NOT NULL DEFAULT 'empty'
  CHECK (prompt_status IN ('empty','planning','ready','failed'));

-- Down Migration
ALTER TABLE illustration_slots DROP COLUMN prompt_status, DROP COLUMN prompt_revision, DROP COLUMN prompt_draft;
ALTER TABLE article_visual_runs DROP COLUMN visual_bible, DROP COLUMN workflow_version;
