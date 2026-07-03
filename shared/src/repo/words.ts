// words 資料存取（單字主要身分）。
import type { Word } from "../schemas";
import { type Queryable, toNum, toIso } from "./types";

function mapWord(row: any): Word {
  return {
    id: toNum(row.id),
    normalizedWord: row.normalized_word,
    enAudioPath: row.en_audio_path,
    createdAt: toIso(row.created_at),
  };
}

/**
 * 取得或建立單字（依 normalized_word 唯一）。
 * 已存在則回既有列，確保全站同一單字只有一筆主要身分。
 */
export async function getOrCreateWord(
  db: Queryable,
  normalizedWord: string,
): Promise<Word> {
  const res = await db.query(
    `INSERT INTO words (normalized_word) VALUES ($1)
     ON CONFLICT (normalized_word) DO UPDATE SET normalized_word = EXCLUDED.normalized_word
     RETURNING *`,
    [normalizedWord],
  );
  return mapWord(res.rows[0]);
}

export async function findWordByNormalized(
  db: Queryable,
  normalizedWord: string,
): Promise<Word | null> {
  const res = await db.query(
    `SELECT * FROM words WHERE normalized_word = $1`,
    [normalizedWord],
  );
  return res.rows[0] ? mapWord(res.rows[0]) : null;
}

/** 設定單字英文發音路徑（跨解釋共用，產生一次）。 */
export async function setWordEnAudioPath(
  db: Queryable,
  wordId: number,
  enAudioPath: string,
): Promise<void> {
  await db.query(`UPDATE words SET en_audio_path = $2 WHERE id = $1`, [
    wordId,
    enAudioPath,
  ]);
}

/** 缺英文發音、且至少有一筆解釋的單字（補產音檔用）。 */
export async function listWordsMissingEnAudio(
  db: Queryable,
  limit: number,
): Promise<Word[]> {
  const res = await db.query(
    `SELECT * FROM words w
      WHERE w.en_audio_path IS NULL
        AND EXISTS (SELECT 1 FROM word_explanations we WHERE we.word_id = w.id)
      ORDER BY w.id
      LIMIT $1`,
    [limit],
  );
  return res.rows.map(mapWord);
}
