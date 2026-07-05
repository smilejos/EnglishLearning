// word_explanations 資料存取（單字解釋變體）。
import type { WordExplanation, WordExplanationWithSource } from "../schemas";
import { type Queryable, toNum, toNumOrNull, toIso } from "./types";
import { extractVocabWords } from "../tokenizeWords";
import { listParagraphsByArticle } from "./paragraphs";

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
    headword: row.headword,
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
  headword?: string | null;
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
       zh_example, zh_example_audio_path, headword
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
      input.headword ?? null,
    ],
  );
  return mapExplanation(res.rows[0]);
}

/** 列出某文章底下所有解釋涉及的 word id（刪文章時據此清理對應音檔目錄）。 */
export async function listWordIdsByArticle(
  db: Queryable,
  articleId: number,
): Promise<number[]> {
  const res = await db.query<{ word_id: string | number }>(
    `SELECT DISTINCT word_id FROM word_explanations WHERE article_id = $1`,
    [articleId],
  );
  return res.rows.map((r) => toNum(r.word_id));
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

/** 某文章已解釋過的單字（normalized）清單，前台據此標示已查單字。 */
export async function listExplainedWordsByArticle(
  db: Queryable,
  articleId: number,
): Promise<string[]> {
  const res = await db.query<{ normalized_word: string }>(
    `SELECT w.normalized_word
       FROM word_explanations we
       JOIN words w ON w.id = we.word_id
      WHERE we.article_id = $1
      ORDER BY w.normalized_word`,
    [articleId],
  );
  return res.rows.map((r) => r.normalized_word);
}

/**
 * 前台底線用：本篇段落文字中出現、且該 normalized 單字在「全站任一文章」有解釋的清單。
 * 斷詞規則與前端一致（見 extractVocabWords）。
 */
export async function listGloballyExplainedWordsInArticle(
  db: Queryable,
  articleId: number,
): Promise<string[]> {
  const paragraphs = await listParagraphsByArticle(db, articleId);
  const words = new Set<string>();
  for (const p of paragraphs)
    for (const w of extractVocabWords(p.text)) words.add(w);
  if (words.size === 0) return [];
  const res = await db.query<{ normalized_word: string }>(
    `SELECT DISTINCT w.normalized_word
       FROM words w
       JOIN word_explanations we ON we.word_id = w.id
      WHERE w.normalized_word = ANY($1::text[])
      ORDER BY w.normalized_word`,
    [[...words]],
  );
  return res.rows.map((r) => r.normalized_word);
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

/** 缺音檔的解釋（任一組「有文字但音檔為 null」即入列），補產音檔用。 */
export async function listExplanationsMissingAudio(
  db: Queryable,
  limit: number,
): Promise<WordExplanation[]> {
  const res = await db.query(
    `SELECT * FROM word_explanations
      WHERE (en_explanation IS NOT NULL AND en_explanation_audio_path IS NULL)
         OR (en_example     IS NOT NULL AND en_example_audio_path     IS NULL)
         OR (zh_translation IS NOT NULL AND zh_translation_audio_path IS NULL)
         OR (zh_explanation IS NOT NULL AND zh_explanation_audio_path IS NULL)
         OR (zh_example     IS NOT NULL AND zh_example_audio_path     IS NULL)
      ORDER BY id
      LIMIT $1`,
    [limit],
  );
  return res.rows.map(mapExplanation);
}

export interface ExplanationWithWord extends WordExplanation {
  word: { id: number; normalizedWord: string };
}

/** 某文章產生過的所有解釋（含單字），後台文章內清單用。 */
export async function listExplanationsByArticle(
  db: Queryable,
  articleId: number,
): Promise<ExplanationWithWord[]> {
  const res = await db.query(
    `SELECT we.*, w.normalized_word
       FROM word_explanations we
       JOIN words w ON w.id = we.word_id
      WHERE we.article_id = $1
      ORDER BY w.normalized_word ASC, we.id ASC`,
    [articleId],
  );
  return res.rows.map((row: any) => ({
    ...mapExplanation(row),
    word: { id: toNum(row.word_id), normalizedWord: row.normalized_word },
  }));
}

/** 依 id 取單一解釋（刪除前用來得知 word/article 以清音檔）。 */
export async function getExplanationById(
  db: Queryable,
  id: number,
): Promise<WordExplanation | null> {
  const res = await db.query(`SELECT * FROM word_explanations WHERE id = $1`, [id]);
  return res.rows[0] ? mapExplanation(res.rows[0]) : null;
}

/** 刪除單一解釋，回其 word/article（供音檔清理）。 */
export async function deleteExplanation(
  db: Queryable,
  id: number,
): Promise<{ wordId: number; articleId: number } | null> {
  const res = await db.query(
    `DELETE FROM word_explanations WHERE id = $1 RETURNING word_id, article_id`,
    [id],
  );
  return res.rows[0]
    ? { wordId: toNum(res.rows[0].word_id), articleId: toNum(res.rows[0].article_id) }
    : null;
}
