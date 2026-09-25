-- Up Migration
CREATE TABLE generation_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  settings jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE jobs ADD COLUMN generation_snapshot jsonb;
INSERT INTO generation_settings (id, settings) VALUES (
  1,
  '{"translation":{"provider":"google","model":"gemini-2.5-flash"},"explanation":{"provider":"google","model":"gemini-2.5-flash"},"planner":{"provider":"google","model":"gemini-2.5-flash"},"speech":{"provider":"google","model":"gemini-2.5-flash-preview-tts","voiceEn":"Kore","voiceZh":"Kore"},"image":{"provider":"openai","model":"openai-gpt-image-2"}}'::jsonb
);

-- Down Migration
ALTER TABLE jobs DROP COLUMN generation_snapshot;
DROP TABLE generation_settings;
