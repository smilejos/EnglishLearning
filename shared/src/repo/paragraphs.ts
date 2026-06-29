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
