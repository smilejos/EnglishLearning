-- Up Migration
-- 分類屬於情境本身，不更動不可覆寫的 revision 內容或 hash。
CREATE TABLE scenario_tag_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  kind TEXT NOT NULL CHECK (length(kind) > 0)
);
INSERT INTO scenario_tag_settings (kind) VALUES ('情境');

CREATE TABLE scenario_tags (
  scenario_key TEXT NOT NULL REFERENCES learning_scenarios(scenario_key) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (scenario_key, tag_id)
);
CREATE INDEX scenario_tags_tag_id_idx ON scenario_tags(tag_id);

-- Down Migration
DROP TABLE scenario_tags;
DROP TABLE scenario_tag_settings;
