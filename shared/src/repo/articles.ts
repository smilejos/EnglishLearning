// articles 資料存取。
import type { Article, MaterialType, Status } from "../schemas";
import { type Queryable, toNum, toNumOrNull, toIso } from "./types";

function mapArticle(row: any): Article {
  return {
    id: toNum(row.id),
    title: row.title,
    materialType: row.material_type,
    grade: row.grade,
    unit: row.unit,
    week: toNumOrNull(row.week),
    page: toNumOrNull(row.page),
    categoryId: toNumOrNull(row.category_id),
    level: row.level,
    status: row.status,
    createdBy: toNumOrNull(row.created_by),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface CreateArticleInput {
  title: string;
  materialType?: MaterialType;
  grade?: string | null;
  unit?: string | null;
  week?: number | null;
  page?: number | null;
  categoryId?: number | null;
  level?: string | null;
  createdBy?: number | null;
}

export async function createArticle(
  db: Queryable,
  input: CreateArticleInput,
): Promise<Article> {
  const res = await db.query(
    `INSERT INTO articles
       (title, material_type, grade, unit, week, page, category_id, level, created_by)
     VALUES ($1, $2::material_type, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.title,
      input.materialType ?? "school",
      input.grade ?? null,
      input.unit ?? null,
      input.week ?? null,
      input.page ?? null,
      input.categoryId ?? null,
      input.level ?? null,
      input.createdBy ?? null,
    ],
  );
  return mapArticle(res.rows[0]);
}

export async function getArticleById(
  db: Queryable,
  id: number,
): Promise<Article | null> {
  const res = await db.query(`SELECT * FROM articles WHERE id = $1`, [id]);
  return res.rows[0] ? mapArticle(res.rows[0]) : null;
}

export async function listArticles(db: Queryable): Promise<Article[]> {
  const res = await db.query(`SELECT * FROM articles ORDER BY created_at DESC, id DESC`);
  return res.rows.map(mapArticle);
}

/** 更新文章狀態並刷新 updated_at。 */
export async function setArticleStatus(
  db: Queryable,
  id: number,
  status: Status,
): Promise<void> {
  await db.query(
    `UPDATE articles SET status = $2::processing_status, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}
