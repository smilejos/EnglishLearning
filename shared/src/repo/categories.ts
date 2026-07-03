// categories 資料存取（課外教材分類樹，自我參照）。
import { type Queryable, toNum, toNumOrNull } from "./types";

export interface Category {
  id: number;
  parentId: number | null;
  label: string;
  sortOrder: number;
}

function mapCategory(row: any): Category {
  return {
    id: toNum(row.id),
    parentId: toNumOrNull(row.parent_id),
    label: row.label,
    sortOrder: toNum(row.sort_order),
  };
}

export interface CreateCategoryInput {
  label: string;
  parentId?: number | null;
  sortOrder?: number;
}

export async function createCategory(
  db: Queryable,
  input: CreateCategoryInput,
): Promise<Category> {
  const res = await db.query(
    `INSERT INTO categories (parent_id, label, sort_order)
     VALUES ($1, $2, COALESCE($3, 0))
     RETURNING *`,
    [input.parentId ?? null, input.label, input.sortOrder ?? null],
  );
  return mapCategory(res.rows[0]);
}

export async function getCategoryById(
  db: Queryable,
  id: number,
): Promise<Category | null> {
  const res = await db.query(`SELECT * FROM categories WHERE id = $1`, [id]);
  return res.rows[0] ? mapCategory(res.rows[0]) : null;
}

/**
 * 依 label 取得或建立分類（同一 parent 下唯一）；後台以字串指派分類時使用。
 * 注意：頂層分類 parent_id 為 NULL，而 Postgres 唯一鍵視 NULL 為相異，
 * 故無法靠 ON CONFLICT，改以「先查（IS NOT DISTINCT FROM）再插」。
 */
export async function getOrCreateCategoryByLabel(
  db: Queryable,
  label: string,
  parentId: number | null = null,
): Promise<Category> {
  const existing = await db.query(
    `SELECT * FROM categories
      WHERE parent_id IS NOT DISTINCT FROM $1 AND label = $2`,
    [parentId, label],
  );
  if (existing.rows[0]) return mapCategory(existing.rows[0]);
  const res = await db.query(
    `INSERT INTO categories (parent_id, label) VALUES ($1, $2) RETURNING *`,
    [parentId, label],
  );
  return mapCategory(res.rows[0]);
}

/** 列出全部分類（頂層在前，同層依 sort_order）。 */
export async function listCategories(db: Queryable): Promise<Category[]> {
  const res = await db.query(
    `SELECT * FROM categories ORDER BY parent_id NULLS FIRST, sort_order ASC, id ASC`,
  );
  return res.rows.map(mapCategory);
}

/** 更新分類 label／排序（後台管理用）。回傳更新後的分類，找不到回 null。 */
export async function updateCategory(
  db: Queryable,
  id: number,
  patch: { label?: string; sortOrder?: number },
): Promise<Category | null> {
  const res = await db.query(
    `UPDATE categories
        SET label = COALESCE($2, label),
            sort_order = COALESCE($3, sort_order)
      WHERE id = $1
      RETURNING *`,
    [id, patch.label ?? null, patch.sortOrder ?? null],
  );
  return res.rows[0] ? mapCategory(res.rows[0]) : null;
}

/** 刪除分類（子分類 cascade；文章的 category_id 由 FK 設為 NULL）。回傳是否刪到。 */
export async function deleteCategory(
  db: Queryable,
  id: number,
): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM categories WHERE id = $1 RETURNING id`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}
