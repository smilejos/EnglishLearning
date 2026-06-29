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
