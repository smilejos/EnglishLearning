// word_explanations 資料存取（單字解釋變體）。
import type { WordExplanation, WordExplanationWithSource } from "../schemas";
import { type Queryable, toNum, toNumOrNull, toIso } from "./types";

function mapExplanation(row: any): WordExplanation {
  return {
    id: toNum(row.id),
    wordId: toNum(row.word_id),
    articleId: toNum(row.article_id),
    paragraphId: toNumOrNull(row.paragraph_id),
    enExplanation: row.en_explanation,
    enExplanationAudioPath: row.en_explanation_audio_path,
    enExample: row.en_example,
    enExampleAudioPath: row.en_example_audio_path,
    zhTranslation: row.zh_translation,
    zhTranslationAudioPath: row.zh_translation_audio_path,
    zhExplanation: row.zh_explanation,
    zhExplanationAudioPath: row.zh_explanation_audio_path,
    zhExample: row.zh_example,
    zhExampleAudioPath: row.zh_example_audio_path,
    createdAt: toIso(row.created_at),
  };
}

export interface CreateExplanationInput {
  wordId: number;
  articleId: number;
  paragraphId?: number | null;
  enExplanation?: string | null;
  enExplanationAudioPath?: string | null;
  enExample?: string | null;
  enExampleAudioPath?: string | null;
  zhTranslation?: string | null;
  zhTranslationAudioPath?: string | null;
  zhExplanation?: string | null;
  zhExplanationAudioPath?: string | null;
  zhExample?: string | null;
  zhExampleAudioPath?: string | null;
}

export async function createExplanation(
  db: Queryable,
  input: CreateExplanationInput,
): Promise<WordExplanation> {
  const res = await db.query(
    `INSERT INTO word_explanations (
       word_id, article_id, paragraph_id,
       en_explanation, en_explanation_audio_path,
       en_example, en_example_audio_path,
       zh_translation, zh_translation_audio_path,
       zh_explanation, zh_explanation_audio_path,
       zh_example, zh_example_audio_path
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      input.wordId,
      input.articleId,
      input.paragraphId ?? null,
      input.enExplanation ?? null,
      input.enExplanationAudioPath ?? null,
      input.enExample ?? null,
      input.enExampleAudioPath ?? null,
      input.zhTranslation ?? null,
      input.zhTranslationAudioPath ?? null,
      input.zhExplanation ?? null,
      input.zhExplanationAudioPath ?? null,
      input.zhExample ?? null,
      input.zhExampleAudioPath ?? null,
    ],
  );
  return mapExplanation(res.rows[0]);
}

/** 快取鍵查詢：某單字在某文章是否已有解釋。 */
export async function findExplanation(
  db: Queryable,
  wordId: number,
  articleId: number,
): Promise<WordExplanation | null> {
  const res = await db.query(
    `SELECT * FROM word_explanations WHERE word_id = $1 AND article_id = $2`,
    [wordId, articleId],
  );
  return res.rows[0] ? mapExplanation(res.rows[0]) : null;
}

/**
 * 列出某單字的所有解釋（含來源文章 id／title），依 created_at 排序（設計 §9.3）。
 * 供前端彈窗列出多份累積解釋與跳轉連結。
 */
export async function listExplanationsByWord(
  db: Queryable,
  wordId: number,
): Promise<WordExplanationWithSource[]> {
  const res = await db.query(
    `SELECT we.*, a.title AS article_title
       FROM word_explanations we
       JOIN articles a ON a.id = we.article_id
      WHERE we.word_id = $1
      ORDER BY we.created_at ASC, we.id ASC`,
    [wordId],
  );
  return res.rows.map((row) => ({
    ...mapExplanation(row),
    article: { id: toNum(row.article_id), title: row.article_title },
  }));
}

export interface ExplanationAudioPaths {
  enExplanationAudioPath?: string | null;
  enExampleAudioPath?: string | null;
  zhTranslationAudioPath?: string | null;
  zhExplanationAudioPath?: string | null;
  zhExampleAudioPath?: string | null;
}

/** 補寫解釋的各項語音路徑（僅更新提供者）。 */
export async function updateExplanationAudioPaths(
  db: Queryable,
  id: number,
  paths: ExplanationAudioPaths,
): Promise<void> {
  await db.query(
    `UPDATE word_explanations SET
       en_explanation_audio_path = COALESCE($2, en_explanation_audio_path),
       en_example_audio_path     = COALESCE($3, en_example_audio_path),
       zh_translation_audio_path = COALESCE($4, zh_translation_audio_path),
       zh_explanation_audio_path = COALESCE($5, zh_explanation_audio_path),
       zh_example_audio_path     = COALESCE($6, zh_example_audio_path)
     WHERE id = $1`,
    [
      id,
      paths.enExplanationAudioPath ?? null,
      paths.enExampleAudioPath ?? null,
      paths.zhTranslationAudioPath ?? null,
      paths.zhExplanationAudioPath ?? null,
      paths.zhExampleAudioPath ?? null,
    ],
  );
}
