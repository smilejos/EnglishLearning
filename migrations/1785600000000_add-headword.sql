-- Up Migration
-- word_explanations 新增 headword：LLM 實際解釋的字或片語（如 "added to"）。
-- 可為 NULL，相容既有資料；前端 NULL 時回退顯示被點單字。
ALTER TABLE word_explanations ADD COLUMN headword TEXT;

-- Down Migration
ALTER TABLE word_explanations DROP COLUMN IF EXISTS headword;
