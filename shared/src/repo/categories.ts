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

/** 列出全部分類（頂層在前，同層依 sort_order）。 */
export async function listCategories(db: Queryable): Promise<Category[]> {
  const res = await db.query(
    `SELECT * FROM categories ORDER BY parent_id NULLS FIRST, sort_order ASC, id ASC`,
  );
  return res.rows.map(mapCategory);
}
