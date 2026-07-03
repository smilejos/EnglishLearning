// jobs 資料存取（worker 佇列）。
import type { Status } from "../schemas";
import { type Queryable, toNum, toIso } from "./types";

export interface Job {
  id: number;
  articleId: number;
  paragraphId: number;
  status: Status;
  attempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapJob(row: any): Job {
  return {
    id: toNum(row.id),
    articleId: toNum(row.article_id),
    paragraphId: toNum(row.paragraph_id),
    status: row.status,
    attempts: toNum(row.attempts),
    error: row.error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createJob(
  db: Queryable,
  articleId: number,
  paragraphId: number,
): Promise<Job> {
  const res = await db.query(
    `INSERT INTO jobs (article_id, paragraph_id) VALUES ($1, $2) RETURNING *`,
    [articleId, paragraphId],
  );
  return mapJob(res.rows[0]);
}

/** 認領 job 時若 processing 已超過此毫秒數，視為 worker 崩潰而回收。 */
export const DEFAULT_STALE_MS = 5 * 60 * 1000;

/**
 * 原子地認領下一個可處理的 job 並 attempts++：
 * - `pending` job，或
 * - 卡在 `processing` 超過 `staleMs`（worker 崩潰未完成）的 job（visibility timeout 回收）。
 * 以 FOR UPDATE SKIP LOCKED 取單筆並就地標為 processing；多 worker 併發不會取到同一筆。
 * attempts 在認領時遞增（首次處理或回收皆計一次嘗試），供重試上限判斷。
 */
export async function claimNextJob(
  db: Queryable,
  staleMs: number = DEFAULT_STALE_MS,
): Promise<Job | null> {
  const res = await db.query(
    `UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'pending'
          OR (status = 'processing'
              AND updated_at < now() - make_interval(secs => $1))
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [staleMs / 1000],
  );
  return res.rows[0] ? mapJob(res.rows[0]) : null;
}

export async function markJobDone(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1`,
    [id],
  );
}

/** 終態失敗：狀態轉 failed、記錄錯誤訊息（attempts 已於認領時遞增，此處不再加）。 */
export async function markJobFailed(
  db: Queryable,
  id: number,
  error: string,
): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'failed', error = $2, updated_at = now()
     WHERE id = $1`,
    [id, error],
  );
}

/** 自動重試：將失敗的 job 退回 pending 等待下一輪（保留 attempts，記錄最近錯誤）。 */
export async function requeueJob(
  db: Queryable,
  id: number,
  error: string,
): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'pending', error = $2, updated_at = now()
     WHERE id = $1`,
    [id, error],
  );
}

export interface JobErrorInfo {
  paragraphId: number;
  error: string;
  attempts: number;
}

/** 某文章各段落對應 job 的最近錯誤（無錯誤的段落不在結果內）。 */
export async function listJobErrorsByArticle(
  db: Queryable,
  articleId: number,
): Promise<JobErrorInfo[]> {
  const res = await db.query(
    `SELECT DISTINCT ON (paragraph_id) paragraph_id, error, attempts
       FROM jobs
      WHERE article_id = $1 AND error IS NOT NULL
      ORDER BY paragraph_id, updated_at DESC`,
    [articleId],
  );
  return res.rows.map((r: any) => ({
    paragraphId: toNum(r.paragraph_id),
    error: r.error,
    attempts: toNum(r.attempts),
  }));
}

/** 手動重試：將某文章的 failed jobs 重設回 pending（清除 error、attempts 歸零）。回傳重設筆數。 */
export async function resetFailedJobsByArticle(
  db: Queryable,
  articleId: number,
): Promise<number> {
  const res = await db.query(
    `UPDATE jobs SET status = 'pending', error = NULL, attempts = 0, updated_at = now()
     WHERE article_id = $1 AND status = 'failed'`,
    [articleId],
  );
  return res.rowCount ?? 0;
}
