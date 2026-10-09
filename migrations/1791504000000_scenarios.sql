-- Up Migration
-- 情境與文章分開；revision 內容不可原地覆寫，發布只更改狀態與目前版本指標。
CREATE TABLE learning_scenarios (
  scenario_key TEXT PRIMARY KEY CHECK (scenario_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  published_revision INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE scenario_revisions (
  scenario_key TEXT NOT NULL REFERENCES learning_scenarios(scenario_key),
  revision INTEGER NOT NULL CHECK (revision > 0),
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  media JSONB NOT NULL CHECK (jsonb_typeof(media) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  PRIMARY KEY (scenario_key, revision)
);
ALTER TABLE learning_scenarios ADD CONSTRAINT learning_scenarios_published_fk
  FOREIGN KEY (scenario_key, published_revision) REFERENCES scenario_revisions(scenario_key, revision);
CREATE TABLE scenario_word_links (
  scenario_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  entry_guid UUID NOT NULL REFERENCES wordbank_entries(guid),
  word TEXT NOT NULL,
  PRIMARY KEY (scenario_key, revision, entry_guid),
  FOREIGN KEY (scenario_key, revision) REFERENCES scenario_revisions(scenario_key, revision)
);
CREATE FUNCTION protect_scenario_revision_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.media IS DISTINCT FROM OLD.media
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.scenario_key IS DISTINCT FROM OLD.scenario_key
     OR NEW.revision IS DISTINCT FROM OLD.revision THEN
    RAISE EXCEPTION '情境 revision 內容不可覆寫，請新增版本';
  END IF;
  IF OLD.status = 'published' AND NEW.status <> 'published' THEN
    RAISE EXCEPTION '已發布 revision 不可還原草稿';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scenario_revision_immutable BEFORE UPDATE ON scenario_revisions
  FOR EACH ROW EXECUTE FUNCTION protect_scenario_revision_content();
-- Down Migration
DROP TRIGGER scenario_revision_immutable ON scenario_revisions;
DROP FUNCTION protect_scenario_revision_content();
DROP TABLE scenario_word_links;
ALTER TABLE learning_scenarios DROP CONSTRAINT learning_scenarios_published_fk;
DROP TABLE scenario_revisions;
DROP TABLE learning_scenarios;
