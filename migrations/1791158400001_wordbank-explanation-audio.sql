-- Up Migration
-- 英文解釋音檔使用 explains[].guid，與單字及例句共用音檔 metadata。
ALTER TABLE wordbank_audio DROP CONSTRAINT wordbank_audio_kind_check;
ALTER TABLE wordbank_audio ADD CONSTRAINT wordbank_audio_kind_check
  CHECK (kind IN ('word', 'example', 'explanation'));

-- Down Migration
DELETE FROM wordbank_audio WHERE kind = 'explanation';
ALTER TABLE wordbank_audio DROP CONSTRAINT wordbank_audio_kind_check;
ALTER TABLE wordbank_audio ADD CONSTRAINT wordbank_audio_kind_check
  CHECK (kind IN ('word', 'example'));
