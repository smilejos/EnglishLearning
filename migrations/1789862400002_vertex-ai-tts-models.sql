-- Up Migration
-- Vertex AI 使用不帶 preview 的 Gemini 2.5 TTS 模型 ID。
-- 既有文章 job 的快照保留原值，由 Vertex client 在送出請求時相容映射。
UPDATE generation_settings
SET settings = jsonb_set(
      settings,
      '{speech,model}',
      to_jsonb(CASE settings #>> '{speech,model}'
        WHEN 'gemini-2.5-flash-preview-tts' THEN 'gemini-2.5-flash-tts'
        WHEN 'gemini-2.5-pro-preview-tts' THEN 'gemini-2.5-pro-tts'
      END)
    ),
    version = version + 1,
    updated_at = now()
WHERE id = 1
  AND settings #>> '{speech,provider}' = 'google'
  AND settings #>> '{speech,model}' IN (
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts'
  );

-- Down Migration
-- 模型選擇可能在升級後由管理者修改；不自動恢復過時的 preview ID。
