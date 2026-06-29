-- Up Migration
-- 內容對齊 docs/schema-reference.sql（設計 §4 的可執行版本）。
-- node-pg-migrate 預設將每個 migration 包在交易中，故此處不寫 BEGIN/COMMIT。

-- 列舉型別 ---------------------------------------------------------------------
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE user_role AS ENUM ('admin', 'reader');
CREATE TYPE material_type AS ENUM ('school', 'extracurricular');

-- users -----------------------------------------------------------------------
CREATE TABLE users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT        NOT NULL UNIQUE,
    name        TEXT,
    role        user_role   NOT NULL DEFAULT 'reader',
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- categories（自我參照分類樹）---------------------------------------------------
CREATE TABLE categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_id  BIGINT   REFERENCES categories (id) ON DELETE CASCADE,
    label      TEXT     NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (parent_id, label)
);
CREATE INDEX idx_categories_parent_id ON categories (parent_id);

-- articles --------------------------------------------------------------------
CREATE TABLE articles (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title         TEXT              NOT NULL,
    material_type material_type     NOT NULL DEFAULT 'school',
    grade         TEXT,
    unit          TEXT,
    week          SMALLINT,
    page          SMALLINT,
    category_id   BIGINT            REFERENCES categories (id) ON DELETE SET NULL,
    level         TEXT,
    status        processing_status NOT NULL DEFAULT 'pending',
    created_by    BIGINT            REFERENCES users (id),
    created_at    timestamptz       NOT NULL DEFAULT now(),
    updated_at    timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX idx_articles_material_type ON articles (material_type);
CREATE INDEX idx_articles_category_id ON articles (category_id);

-- paragraphs ------------------------------------------------------------------
CREATE TABLE paragraphs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id    BIGINT            NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    idx           INTEGER           NOT NULL,
    text          TEXT              NOT NULL,
    translation   TEXT,
    en_audio_path TEXT,
    zh_audio_path TEXT,
    status        processing_status NOT NULL DEFAULT 'pending',
    UNIQUE (article_id, idx)
);
CREATE INDEX idx_paragraphs_article_id ON paragraphs (article_id);

-- jobs ------------------------------------------------------------------------
CREATE TABLE jobs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id   BIGINT            NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    paragraph_id BIGINT            NOT NULL REFERENCES paragraphs (id) ON DELETE CASCADE,
    status       processing_status NOT NULL DEFAULT 'pending',
    attempts     INTEGER           NOT NULL DEFAULT 0,
    error        TEXT,
    created_at   timestamptz       NOT NULL DEFAULT now(),
    updated_at   timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_status ON jobs (status);

-- words -----------------------------------------------------------------------
CREATE TABLE words (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    normalized_word TEXT        NOT NULL UNIQUE,
    en_audio_path   TEXT,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- word_explanations（★ 10 個內容欄位名稱須與設計 §4 完全一致）------------------
CREATE TABLE word_explanations (
    id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    word_id                    BIGINT      NOT NULL REFERENCES words (id) ON DELETE CASCADE,
    article_id                 BIGINT      NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    paragraph_id               BIGINT      REFERENCES paragraphs (id) ON DELETE SET NULL,
    en_explanation             TEXT,
    en_explanation_audio_path  TEXT,
    en_example                 TEXT,
    en_example_audio_path      TEXT,
    zh_translation             TEXT,
    zh_translation_audio_path  TEXT,
    zh_explanation             TEXT,
    zh_explanation_audio_path  TEXT,
    zh_example                 TEXT,
    zh_example_audio_path      TEXT,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    UNIQUE (word_id, article_id)
);
CREATE INDEX idx_word_explanations_word_id ON word_explanations (word_id, created_at);
CREATE INDEX idx_word_explanations_article_id ON word_explanations (article_id);

-- tags / article_tags ---------------------------------------------------------
CREATE TABLE tags (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind  TEXT NOT NULL,
    label TEXT NOT NULL,
    UNIQUE (kind, label)
);
CREATE INDEX idx_tags_kind ON tags (kind);

CREATE TABLE article_tags (
    article_id BIGINT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
    tag_id     BIGINT NOT NULL REFERENCES tags (id)     ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX idx_article_tags_tag_id ON article_tags (tag_id);

-- Down Migration
-- 反向順序丟棄（先依賴方、後被參照方），最後移除列舉型別。
DROP TABLE IF EXISTS article_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS word_explanations;
DROP TABLE IF EXISTS words;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS paragraphs;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS material_type;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS processing_status;
