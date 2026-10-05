-- Up Migration
-- 字庫與文章單字／個人收藏分開；GUID 同時可供單字及例句音檔對應。
CREATE TABLE wordbank_entries (
  guid UUID PRIMARY KEY,
  source_id INTEGER NOT NULL,
  word TEXT NOT NULL CHECK (length(btrim(word)) > 0),
  parts_of_speech TEXT[] NOT NULL DEFAULT '{}',
  definition TEXT NOT NULL DEFAULT '',
  explains JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(explains) = 'array'),
  examples JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(examples) = 'array'),
  level JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(level) = 'object'),
  category TEXT[] NOT NULL DEFAULT '{}',
  scenario TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wordbank_entries_list_idx ON wordbank_entries ((level->>'list'));
CREATE INDEX wordbank_entries_cefr_idx ON wordbank_entries ((level->>'cefr'));
CREATE INDEX wordbank_entries_tw_7000_idx ON wordbank_entries ((level->>'tw_7000'));

CREATE TABLE wordbank_audio (
  asset_guid UUID PRIMARY KEY,
  entry_guid UUID NOT NULL REFERENCES wordbank_entries(guid) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('word', 'example')),
  relative_path TEXT NOT NULL,
  model TEXT NOT NULL,
  voice TEXT NOT NULL,
  instruct TEXT NOT NULL,
  language TEXT NOT NULL,
  text_hash TEXT NOT NULL CHECK (text_hash ~ '^[a-f0-9]{64}$'),
  duration_seconds DOUBLE PRECISION NOT NULL CHECK (duration_seconds > 0),
  bytes BIGINT NOT NULL CHECK (bytes > 0),
  generated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX wordbank_audio_entry_idx ON wordbank_audio(entry_guid);

-- Down Migration
DROP TABLE wordbank_audio;
DROP TABLE wordbank_entries;
