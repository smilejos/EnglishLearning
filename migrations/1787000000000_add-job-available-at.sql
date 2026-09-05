-- Up Migration
-- jobs 新增 available_at：重試退避（backoff）的「最早可再認領時間」。
--
-- 在此之前，失敗的 job 被 requeueJob 設回 pending 後，會被同一輪 drainQueue
-- 的 while 迴圈立刻重新認領，三次 attempts 在數秒內燒完。對 429／暫時性網路
-- 錯誤而言，重試等於沒有作用——段落直接被打成終態 failed。
--
-- claimNextJob 只挑 available_at <= now() 的 pending job；被延後的 job 不會
-- 擋住其他 job（WHERE 過濾而非鎖定），手動重試則會把 available_at 重設為 now()。
ALTER TABLE jobs ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();

-- 認領查詢的複合索引：pending 依 available_at 過濾後取最小 id。
CREATE INDEX idx_jobs_claim ON jobs (status, available_at, id);

-- Down Migration
DROP INDEX IF EXISTS idx_jobs_claim;
ALTER TABLE jobs DROP COLUMN IF EXISTS available_at;
