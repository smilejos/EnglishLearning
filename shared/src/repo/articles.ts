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

/** 文章 + 分類標籤（供清單分類/篩選；單次查詢避免 N+1）。 */
export interface ArticleWithMeta extends Article {
  category: { id: number; label: string } | null;
  tags: { kind: string; label: string }[];
}

export async function listArticlesWithMeta(
  db: Queryable,
): Promise<ArticleWithMeta[]> {
  const res = await db.query(
    `SELECT a.*,
            c.label AS category_label,
            COALESCE(
              (SELECT json_agg(json_build_object('kind', t.kind, 'label', t.label)
                               ORDER BY t.kind, t.label)
                 FROM article_tags at
                 JOIN tags t ON t.id = at.tag_id
                WHERE at.article_id = a.id),
              '[]'::json) AS tags
       FROM articles a
       LEFT JOIN categories c ON c.id = a.category_id
      ORDER BY a.created_at DESC, a.id DESC`,
  );
  return res.rows.map((row: any) => ({
    ...mapArticle(row),
    category:
      row.category_id != null
        ? { id: toNum(row.category_id), label: row.category_label }
        : null,
    tags: row.tags ?? [],
  }));
}

/**
 * 更新文章 metadata（後台編輯用）。scalar 欄位直接覆寫（grade/unit/level/categoryId
 * 傳 null 代表清空）。回傳是否更新到。標籤另由 article_tags 處理。
 */
export async function updateArticleMeta(
  db: Queryable,
  id: number,
  f: {
    title: string;
    materialType: MaterialType;
    grade: string | null;
    unit: string | null;
    level: string | null;
    categoryId: number | null;
  },
): Promise<boolean> {
  const res = await db.query(
    `UPDATE articles SET
       title = $2,
       material_type = $3::material_type,
       grade = $4,
       unit = $5,
       level = $6,
       category_id = $7,
       updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [id, f.title, f.materialType, f.grade, f.unit, f.level, f.categoryId],
  );
  return (res.rowCount ?? 0) > 0;
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

/** 刪除文章（外鍵 cascade 連帶刪 paragraphs/jobs/word_explanations）。回傳是否刪到。 */
export async function deleteArticle(
  db: Queryable,
  id: number,
): Promise<boolean> {
  const res = await db.query(`DELETE FROM articles WHERE id = $1 RETURNING id`, [
    id,
  ]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * 僅在文章目前為 pending 時轉為 processing（worker 認領 job 時呼叫）。
 * 避免覆寫 sibling 段落已造成的 failed 終態（見併發一致性）。
 */
export async function markArticleProcessingIfPending(
  db: Queryable,
  id: number,
): Promise<void> {
  await db.query(
    `UPDATE articles SET status = 'processing', updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}
