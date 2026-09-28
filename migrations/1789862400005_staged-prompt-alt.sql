-- Up Migration
ALTER TABLE illustration_slots ADD COLUMN prompt_alt_text text;

-- Down Migration
ALTER TABLE illustration_slots DROP COLUMN prompt_alt_text;
