// paragraphs 資料存取。
import type { Paragraph, Status } from "../schemas";
import { type Queryable, toNum, toIso } from "./types";

function mapParagraph(row: any): Paragraph {
  return {
    id: toNum(row.id),
    articleId: toNum(row.article_id),
    idx: toNum(row.idx),
    text: row.text,
    translation: row.translation,
    enAudioPath: row.en_audio_path,
    zhAudioPath: row.zh_audio_path,
    status: row.status,
  };
}

export interface CreateParagraphInput {
  articleId: number;
  idx: number;
  text: string;
}

export async function createParagraph(
  db: Queryable,
  input: CreateParagraphInput,
): Promise<Paragraph> {
  const res = await db.query(
    `INSERT INTO paragraphs (article_id, idx, text) VALUES ($1, $2, $3) RETURNING *`,
    [input.articleId, input.idx, input.text],
  );
  return mapParagraph(res.rows[0]);
}

export async function getParagraphById(
  db: Queryable,
  id: number,
): Promise<Paragraph | null> {
  const res = await db.query(`SELECT * FROM paragraphs WHERE id = $1`, [id]);
  return res.rows[0] ? mapParagraph(res.rows[0]) : null;
}

export async function listParagraphsByArticle(
  db: Queryable,
  articleId: number,
): Promise<Paragraph[]> {
  const res = await db.query(
    `SELECT * FROM paragraphs WHERE article_id = $1 ORDER BY idx ASC`,
    [articleId],
  );
  return res.rows.map(mapParagraph);
}

export interface ParagraphResult {
  translation?: string | null;
  enAudioPath?: string | null;
  zhAudioPath?: string | null;
  status?: Status;
}

/** 寫入 worker 處理結果（翻譯／音檔／狀態），僅更新提供的欄位。 */
export async function updateParagraphResult(
  db: Queryable,
  id: number,
  result: ParagraphResult,
): Promise<void> {
  await db.query(
    `UPDATE paragraphs SET
       translation   = COALESCE($2, translation),
       en_audio_path = COALESCE($3, en_audio_path),
       zh_audio_path = COALESCE($4, zh_audio_path),
       status        = COALESCE($5::processing_status, status)
     WHERE id = $1`,
    [
      id,
      result.translation ?? null,
      result.enAudioPath ?? null,
      result.zhAudioPath ?? null,
      result.status ?? null,
    ],
  );
}

export async function setParagraphStatus(
  db: Queryable,
  id: number,
  status: Status,
): Promise<void> {
  await db.query(
    `UPDATE paragraphs SET status = $2::processing_status WHERE id = $1`,
    [id, status],
  );
}

/** 某文章各狀態的段落數（worker 據此重算文章終態）。 */
export async function countParagraphsByStatus(
  db: Queryable,
  articleId: number,
): Promise<Record<Status, number>> {
  const res = await db.query<{ status: Status; n: number }>(
    `SELECT status, count(*)::int AS n FROM paragraphs
     WHERE article_id = $1 GROUP BY status`,
    [articleId],
  );
  const counts: Record<Status, number> = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
  };
  for (const row of res.rows) counts[row.status] = row.n;
  return counts;
}

/** 重試：將某文章的 failed 段落重設回 pending。回傳重設筆數。 */
export async function resetFailedParagraphsByArticle(
  db: Queryable,
  articleId: number,
): Promise<number> {
  const res = await db.query(
    `UPDATE paragraphs SET status = 'pending'
     WHERE article_id = $1 AND status = 'failed'`,
    [articleId],
  );
  return res.rowCount ?? 0;
}

/** 單段重新產生前的清空：翻譯與音檔路徑歸 null、狀態回 pending。 */
export async function clearParagraphResult(
  db: Queryable,
  id: number,
): Promise<void> {
  await db.query(
    `UPDATE paragraphs
        SET translation = NULL, en_audio_path = NULL, zh_audio_path = NULL,
            status = 'pending'
      WHERE id = $1`,
    [id],
  );
}
