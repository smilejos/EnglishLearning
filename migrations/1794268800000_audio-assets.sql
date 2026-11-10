-- Up Migration
-- 共用媒體本體與教材引用分開，避免依課程複製同一份錄音。
CREATE TABLE audio_assets (
  asset_guid UUID NOT NULL,
  profile_hash TEXT NOT NULL CHECK (profile_hash ~ '^[a-f0-9]{16}$'),
  profile JSONB NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  kind TEXT NOT NULL CHECK (kind IN ('word','sentence','support','narration','example','explanation')),
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0 AND text = btrim(text)),
  text_hash TEXT NOT NULL CHECK (text_hash ~ '^[a-f0-9]{64}$'),
  relative_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bytes BIGINT NOT NULL CHECK (bytes > 0),
  duration_seconds DOUBLE PRECISION NOT NULL CHECK (duration_seconds > 0),
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_guid, profile_hash),
  CHECK (relative_path IN ('wordbank/' || profile_hash || '/' || asset_guid::text || '.mp3',
    'assets/' || profile_hash || '/' || asset_guid::text || '.mp3'))
);

CREATE TABLE audio_asset_bindings (
  scope TEXT NOT NULL CHECK (scope IN ('phonics','scenario-preview')),
  lesson_id TEXT NOT NULL CHECK (lesson_id ~ '^[a-z0-9][a-z0-9-]*$' AND length(lesson_id) <= 120),
  key TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9._-]*$' AND length(key) <= 120),
  asset_guid UUID NOT NULL,
  profile_hash TEXT NOT NULL,
  PRIMARY KEY (scope,lesson_id,key),
  FOREIGN KEY (asset_guid,profile_hash) REFERENCES audio_assets(asset_guid,profile_hash)
);

-- Down Migration
DROP TABLE audio_asset_bindings;
DROP TABLE audio_assets;
