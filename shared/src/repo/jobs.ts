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

/**
 * 原子地認領下一個 pending job：以 FOR UPDATE SKIP LOCKED 取單筆並就地標為 processing。
 * 多個 worker 併發呼叫不會取到同一筆。無待處理 job 時回 null。
 */
export async function claimNextJob(db: Queryable): Promise<Job | null> {
  const res = await db.query(
    `UPDATE jobs SET status = 'processing', updated_at = now()
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'pending'
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
  );
  return res.rows[0] ? mapJob(res.rows[0]) : null;
}

export async function markJobDone(db: Queryable, id: number): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1`,
    [id],
  );
}

/** 標記失敗：狀態轉 failed、attempts++、記錄錯誤訊息。 */
export async function markJobFailed(
  db: Queryable,
  id: number,
  error: string,
): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'failed', attempts = attempts + 1, error = $2, updated_at = now()
     WHERE id = $1`,
    [id, error],
  );
}

/** 重試：將某文章的 failed jobs 重設回 pending（清除 error）。回傳重設筆數。 */
export async function resetFailedJobsByArticle(
  db: Queryable,
  articleId: number,
): Promise<number> {
  const res = await db.query(
    `UPDATE jobs SET status = 'pending', error = NULL, updated_at = now()
     WHERE article_id = $1 AND status = 'failed'`,
    [articleId],
  );
  return res.rowCount ?? 0;
}
