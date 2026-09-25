-- Up Migration
-- 原有三種文字工作可能選用不同模型；合併時以文章翻譯的選擇作為全站文字設定。
UPDATE generation_settings
SET settings = jsonb_build_object(
      'text', settings->'translation',
      'speech', settings->'speech',
      'image', settings->'image'
    ),
    version = version + 1,
    updated_at = now()
WHERE id = 1 AND settings ? 'translation';

-- Down Migration
UPDATE generation_settings
SET settings = jsonb_build_object(
      'translation', settings->'text',
      'explanation', settings->'text',
      'planner', settings->'text',
      'speech', settings->'speech',
      'image', settings->'image'
    ),
    version = version + 1,
    updated_at = now()
WHERE id = 1 AND settings ? 'text';
