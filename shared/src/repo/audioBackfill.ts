import { type Queryable, toNum } from "./types";

export type MissingAudioKind = "word" | "enExplanation" | "enExample";

export interface MissingAudioTarget {
  kind: MissingAudioKind;
  id: number;
  wordId: number;
  articleId: number | null;
  word: string;
  articleTitle: string | null;
  text: string;
}

function mapTarget(row: any): MissingAudioTarget {
  return {
    kind: row.kind,
    id: toNum(row.id),
    wordId: toNum(row.word_id),
    articleId: row.article_id === null ? null : toNum(row.article_id),
    word: row.word,
    articleTitle: row.article_title,
    text: row.text,
  };
}

/** 每個缺失的英文音檔各列一筆；單字發音跨來源共用，僅列一次。 */
export async function listMissingAudioTargets(db: Queryable): Promise<MissingAudioTarget[]> {
  const res = await db.query(`
    SELECT 'word' AS kind, w.id, w.id AS word_id, NULL::bigint AS article_id,
           w.normalized_word AS word,
           NULL::text AS article_title, w.normalized_word AS text
      FROM words w
     WHERE w.en_audio_path IS NULL
       AND EXISTS (SELECT 1 FROM word_explanations we WHERE we.word_id = w.id)
    UNION ALL
    SELECT 'enExplanation' AS kind, we.id, w.id AS word_id, a.id AS article_id,
           w.normalized_word AS word,
           a.title AS article_title, we.en_explanation AS text
      FROM word_explanations we
      JOIN words w ON w.id = we.word_id
      JOIN articles a ON a.id = we.article_id
     WHERE we.en_explanation IS NOT NULL AND we.en_explanation_audio_path IS NULL
    UNION ALL
    SELECT 'enExample' AS kind, we.id, w.id AS word_id, a.id AS article_id,
           w.normalized_word AS word,
           a.title AS article_title, we.en_example AS text
      FROM word_explanations we
      JOIN words w ON w.id = we.word_id
      JOIN articles a ON a.id = we.article_id
     WHERE we.en_example IS NOT NULL AND we.en_example_audio_path IS NULL
    ORDER BY word, article_title NULLS FIRST, kind, id
  `);
  return res.rows.map(mapTarget);
}

/** 執行前重新檢查目標是否仍缺檔，避免已補項目再次呼叫 TTS。 */
export async function findMissingAudioTarget(
  db: Queryable,
  kind: MissingAudioKind,
  id: number,
): Promise<MissingAudioTarget | null> {
  if (kind === "word") {
    const res = await db.query(
      `SELECT 'word' AS kind, w.id, w.id AS word_id, NULL::bigint AS article_id,
              w.normalized_word AS word,
              NULL::text AS article_title, w.normalized_word AS text
         FROM words w
        WHERE w.id = $1 AND w.en_audio_path IS NULL
          AND EXISTS (SELECT 1 FROM word_explanations we WHERE we.word_id = w.id)`,
      [id],
    );
    return res.rows[0] ? mapTarget(res.rows[0]) : null;
  }
  const columns = kind === "enExplanation"
    ? { text: "en_explanation", audio: "en_explanation_audio_path" }
    : { text: "en_example", audio: "en_example_audio_path" };
  const res = await db.query(
    `SELECT $2::text AS kind, we.id, w.id AS word_id, a.id AS article_id,
            w.normalized_word AS word,
            a.title AS article_title, we.${columns.text} AS text
       FROM word_explanations we
       JOIN words w ON w.id = we.word_id
       JOIN articles a ON a.id = we.article_id
      WHERE we.id = $1 AND we.${columns.text} IS NOT NULL
        AND we.${columns.audio} IS NULL`,
    [id, kind],
  );
  return res.rows[0] ? mapTarget(res.rows[0]) : null;
}
