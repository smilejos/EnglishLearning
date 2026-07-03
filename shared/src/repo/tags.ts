// tags / article_tags 資料存取（開放、可多值分類）。
import { type Queryable, toNum } from "./types";

export interface Tag {
  id: number;
  kind: string;
  label: string;
}

function mapTag(row: any): Tag {
  return { id: toNum(row.id), kind: row.kind, label: row.label };
}

/** 取得或建立 tag（依 (kind, label) 唯一）。 */
export async function getOrCreateTag(
  db: Queryable,
  kind: string,
  label: string,
): Promise<Tag> {
  const res = await db.query(
    `INSERT INTO tags (kind, label) VALUES ($1, $2)
     ON CONFLICT (kind, label) DO UPDATE SET label = EXCLUDED.label
     RETURNING *`,
    [kind, label],
  );
  return mapTag(res.rows[0]);
}

/** 將 tag 掛到文章（重複掛載為無操作）。 */
export async function addTagToArticle(
  db: Queryable,
  articleId: number,
  tagId: number,
): Promise<void> {
  await db.query(
    `INSERT INTO article_tags (article_id, tag_id) VALUES ($1, $2)
     ON CONFLICT (article_id, tag_id) DO NOTHING`,
    [articleId, tagId],
  );
}

/** 移除某文章的所有標籤掛載（後台重設標籤前先清空）。 */
export async function clearArticleTags(
  db: Queryable,
  articleId: number,
): Promise<void> {
  await db.query(`DELETE FROM article_tags WHERE article_id = $1`, [articleId]);
}

export async function listTagsByArticle(
  db: Queryable,
  articleId: number,
): Promise<Tag[]> {
  const res = await db.query(
    `SELECT t.* FROM tags t
       JOIN article_tags at ON at.tag_id = t.id
      WHERE at.article_id = $1
      ORDER BY t.kind, t.label`,
    [articleId],
  );
  return res.rows.map(mapTag);
}

/** 列出全部 tag（供後台挑選與前台篩選選項）。 */
export async function listTags(db: Queryable): Promise<Tag[]> {
  const res = await db.query(`SELECT * FROM tags ORDER BY kind, label`);
  return res.rows.map(mapTag);
}

/** 更新單一 tag 的 kind／label（後台管理用）。找不到回 null。 */
export async function updateTag(
  db: Queryable,
  id: number,
  patch: { kind?: string; label?: string },
): Promise<Tag | null> {
  const res = await db.query(
    `UPDATE tags
        SET kind = COALESCE($2, kind),
            label = COALESCE($3, label)
      WHERE id = $1
      RETURNING *`,
    [id, patch.kind ?? null, patch.label ?? null],
  );
  return res.rows[0] ? mapTag(res.rows[0]) : null;
}

/** 刪除 tag（article_tags 由 FK cascade 一併移除）。回傳是否刪到。 */
export async function deleteTag(db: Queryable, id: number): Promise<boolean> {
  const res = await db.query(`DELETE FROM tags WHERE id = $1 RETURNING id`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** 整批改名某維度（kind）；回傳受影響筆數。供後台管理「維度」用。 */
export async function renameTagKind(
  db: Queryable,
  from: string,
  to: string,
): Promise<number> {
  const res = await db.query(
    `UPDATE tags SET kind = $2 WHERE kind = $1`,
    [from, to],
  );
  return res.rowCount ?? 0;
}
