-- Up Migration
CREATE TABLE vocabulary_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL CHECK (length(word) BETWEEN 1 AND 200 AND word = lower(btrim(word))),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'mastered')),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);
CREATE TABLE vocabulary_sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  paragraph_id BIGINT REFERENCES paragraphs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  material_type material_type NOT NULL,
  grade TEXT,
  unit TEXT,
  category TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, article_id, paragraph_id)
);
CREATE INDEX vocabulary_sources_article_idx ON vocabulary_sources(article_id);
CREATE INDEX vocabulary_sources_paragraph_idx ON vocabulary_sources(paragraph_id);

-- Down Migration
DROP TABLE vocabulary_sources;
DROP TABLE vocabulary_items;
