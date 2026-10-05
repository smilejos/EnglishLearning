import { withTransaction, type DbPool } from "../db";
import { mergeWordbankEntry, WordbankEntrySchema, type WordbankEntry, type WordbankLevelScheme } from "../wordbank";
import type { Queryable } from "./types";

const SELECT_ENTRY = `guid, source_id AS id, word, parts_of_speech, definition, explains, examples, level, category, scenario`;

function values(entry: WordbankEntry): unknown[] {
  return [entry.guid, entry.id, entry.word, entry.parts_of_speech, entry.definition,
    JSON.stringify(entry.explains), JSON.stringify(entry.examples), JSON.stringify(entry.level), entry.category, entry.scenario];
}

export async function getWordbankEntry(db: Queryable, guid: string): Promise<WordbankEntry | null> {
  const result = await db.query(`SELECT ${SELECT_ENTRY} FROM wordbank_entries WHERE guid = $1`, [guid]);
  return result.rows[0] ? WordbankEntrySchema.parse(result.rows[0]) : null;
}

/** 一次只採用一套分級，null 代表未分類；沒有 filter 就取全部。 */
export async function listWordbankEntries(
  db: Queryable,
  filter?: { scheme: WordbankLevelScheme; value: string | number | null },
): Promise<WordbankEntry[]> {
  const where = filter ? `WHERE level->>$1 IS NOT DISTINCT FROM $2::text` : "";
  const result = await db.query(`SELECT ${SELECT_ENTRY} FROM wordbank_entries ${where} ORDER BY source_id, guid`,
    filter ? [filter.scheme, filter.value === null ? null : String(filter.value)] : []);
  return result.rows.map((row) => WordbankEntrySchema.parse(row));
}

/** 全部匯入在單一交易內完成；重匯時鎖住該筆，避免覆寫同時進行的補寫。 */
export async function importWordbankEntries(pool: DbPool, input: WordbankEntry[]): Promise<{ inserted: number; existing: number }> {
  const entries = input.map((entry) => WordbankEntrySchema.parse(entry));
  if (new Set(entries.map((entry) => entry.guid)).size !== entries.length) throw new Error("字庫 GUID 重複");
  return withTransaction(pool, async (tx) => {
    let inserted = 0;
    for (const entry of entries) {
      const result = await tx.query(
        `INSERT INTO wordbank_entries (guid, source_id, word, parts_of_speech, definition, explains, examples, level, category, scenario)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
         ON CONFLICT (guid) DO NOTHING RETURNING guid`, values(entry));
      if (result.rows.length) { inserted++; continue; }
      const current = await tx.query(`SELECT ${SELECT_ENTRY} FROM wordbank_entries WHERE guid = $1 FOR UPDATE`, [entry.guid]);
      const merged = mergeWordbankEntry(WordbankEntrySchema.parse(current.rows[0]), entry);
      await tx.query(
        `UPDATE wordbank_entries SET source_id = $2, word = $3, parts_of_speech = $4, definition = $5,
         explains = $6::jsonb, examples = $7::jsonb, level = $8::jsonb, category = $9, scenario = $10,
         updated_at = now() WHERE guid = $1`, values(merged));
    }
    return { inserted, existing: entries.length - inserted };
  });
}
