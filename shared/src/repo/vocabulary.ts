import { withTransaction, type DbPool } from "../db";
import { type Queryable, toNum, toNumOrNull, toIso } from "./types";

export interface VocabularySource {
  id: number;
  articleId: number | null;
  paragraphId: number | null;
  title: string;
  text: string;
  materialType: "school" | "extracurricular";
  grade: string | null;
  unit: string | null;
  category: string | null;
  savedAt: string;
}
export interface VocabularyItem {
  id: number;
  word: string;
  status: "active" | "mastered";
  savedAt: string;
  sources: VocabularySource[];
}

export async function listVocabulary(db: Queryable, userId: number, id?: number): Promise<VocabularyItem[]> {
  // 單一查詢讓收藏與來源使用同一個資料庫快照。
  const result = await db.query(`SELECT i.*, s.id AS source_id, s.article_id, s.paragraph_id,
    s.title, s.text, s.material_type, s.grade, s.unit, s.category, s.saved_at AS source_saved_at
    FROM vocabulary_items i LEFT JOIN vocabulary_sources s ON s.item_id = i.id
    WHERE i.user_id = $1 AND ($2::bigint IS NULL OR i.id = $2)
    ORDER BY i.saved_at DESC, i.id DESC, s.saved_at DESC, s.id DESC`, [userId, id ?? null]);
  const items = new Map<number, VocabularyItem>();
  for (const row of result.rows) {
    const itemId = toNum(row.id);
    let item = items.get(itemId);
    if (!item) {
      item = { id: itemId, word: row.word, status: row.status, savedAt: toIso(row.saved_at), sources: [] };
      items.set(itemId, item);
    }
    if (row.source_id != null) item.sources.push({
      id: toNum(row.source_id), articleId: toNumOrNull(row.article_id), paragraphId: toNumOrNull(row.paragraph_id),
      title: row.title, text: row.text, materialType: row.material_type,
      grade: row.grade, unit: row.unit, category: row.category, savedAt: toIso(row.source_saved_at),
    });
  }
  return [...items.values()];
}

// 依既有身分序列化收藏異動，連首次收藏與取消收藏的競態也一起涵蓋。
async function lockOwner(db: Queryable, userId: number): Promise<void> {
  await db.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
}

export async function saveVocabulary(pool: DbPool, userId: number, input: {
  word: string; articleId: number; paragraphId: number;
}): Promise<VocabularyItem | null> {
  return withTransaction(pool, async (db) => {
    await lockOwner(db, userId);
    const source = await db.query(`SELECT a.title, a.material_type, a.grade, a.unit,
      c.label AS category, p.text FROM articles a
      JOIN paragraphs p ON p.article_id = a.id
      LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.id = $1 AND p.id = $2 FOR SHARE OF a, p`, [input.articleId, input.paragraphId]);
    if (!source.rows[0]) return null;
    const word = input.word.trim().toLowerCase();
    const previous = await db.query(`SELECT id, status FROM vocabulary_items WHERE user_id = $1 AND word = $2`, [userId, word]);
    const reactivated = previous.rows[0]?.status === "mastered";
    const saved = await db.query(`INSERT INTO vocabulary_items(user_id, word) VALUES ($1, $2)
      ON CONFLICT (user_id, word) DO UPDATE SET status = 'active',
      saved_at = CASE WHEN vocabulary_items.status = 'mastered' THEN clock_timestamp() ELSE vocabulary_items.saved_at END
      RETURNING id`, [userId, word]);
    const id = toNum(saved.rows[0].id);
    const s = source.rows[0];
    await db.query(`INSERT INTO vocabulary_sources(item_id, article_id, paragraph_id, title, text, material_type, grade, unit, category)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (item_id, article_id, paragraph_id) DO UPDATE
      SET saved_at = CASE WHEN $10 THEN clock_timestamp() ELSE vocabulary_sources.saved_at END`,
      [id, input.articleId, input.paragraphId, s.title, s.text, s.material_type, s.grade, s.unit, s.category, reactivated]);
    return (await listVocabulary(db, userId, id))[0];
  });
}

export async function setVocabularyStatus(pool: DbPool, userId: number, id: number, status: VocabularyItem["status"]): Promise<VocabularyItem | null> {
  return withTransaction(pool, async (db) => {
    await lockOwner(db, userId);
    const result = await db.query(`UPDATE vocabulary_items SET status = $3,
      saved_at = CASE WHEN status = 'mastered' AND $3 = 'active' THEN clock_timestamp() ELSE saved_at END
      WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId, status]);
    if (!result.rows[0]) return null;
    // 從熟悉清單恢復沒有指定來源，因此保留所有來源原收藏日期。
    return (await listVocabulary(db, userId, id))[0];
  });
}

export async function deleteVocabulary(pool: DbPool, userId: number, id: number): Promise<boolean> {
  return withTransaction(pool, async (db) => {
    await lockOwner(db, userId);
    const result = await db.query(`DELETE FROM vocabulary_items WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
    return result.rows.length > 0;
  });
}
