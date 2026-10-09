import { wordbankTextHash } from "../wordbankAudio";
import type { WordbankEntry, WordbankLevelScheme } from "../wordbank";
import type { Queryable } from "./types";

export const WORDBANK_LEVELS = {
  list: ["basic", "advance", "expert"],
  cefr: ["A1", "A2", "B1", "B2", "C1", "C2"],
  tw_7000: ["1", "2", "3", "4", "5", "6"],
} as const;
export interface WordbankPracticeOptions {
  total: number;
  systems: Record<WordbankLevelScheme, Array<{ value: string; count: number }>>;
}
export interface WordbankPracticeEntry {
  guid: string;
  word: string;
  partsOfSpeech: string[];
  definition: string;
  explains: Array<{ guid: string; en: string; audioUrl: string | null }>;
  level: WordbankEntry["level"];
  wordAudioUrl: string | null;
  examples: Array<{ guid: string; en: string; zh: string; audioUrl: string | null }>;
}
export interface WordbankPracticeFilter {
  system: WordbankLevelScheme;
  levels: Array<string | null>;
}

export async function getWordbankPracticeOptions(db: Queryable): Promise<WordbankPracticeOptions> {
  const result = await db.query<{ total: number; counts: Record<WordbankLevelScheme, Record<string, number>> }>(
    `SELECT (SELECT count(*)::int FROM wordbank_entries) AS total,
      COALESCE((SELECT jsonb_object_agg(system, counts) FROM (
        SELECT system, jsonb_object_agg(value, count) AS counts FROM (
          SELECT system, COALESCE(e.level->>system, 'unclassified') AS value, count(*)::int AS count
          FROM wordbank_entries e CROSS JOIN (VALUES ('list'), ('cefr'), ('tw_7000')) systems(system)
          GROUP BY system, e.level->>system
        ) grouped GROUP BY system
      ) per_system), '{}'::jsonb) AS counts`);
  const { total, counts } = result.rows[0];
  const options = (system: WordbankLevelScheme) => [{ value: "all", count: total },
    ...[...WORDBANK_LEVELS[system], "unclassified"].map((value) => ({ value, count: counts[system]?.[value] ?? 0 }))];
  return { total, systems: { list: options("list"), cefr: options("cefr"), tw_7000: options("tw_7000") } };
}

interface AudioMetadata { relative_path: string; text_hash: string }
interface ExplanationWithAudio { guid: string; en: string; audio: AudioMetadata | null }
const audioUrl = (audio: AudioMetadata | null, text: string): string | null =>
  audio && audio.text_hash === wordbankTextHash(text) && /^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(audio.relative_path)
    ? `/audio/${audio.relative_path}` : null;

/** 選詞與選三句都在 DB；只回一筆，缺文字或音檔不排除任何詞條。 */
export async function getRandomWordbankPracticeEntry(
  db: Queryable, filter?: WordbankPracticeFilter,
): Promise<{ poolSize: number; entry: WordbankPracticeEntry | null }> {
  const where = filter ? `WHERE (level->>$1 = ANY($2::text[]) OR ($3::boolean AND level->>$1 IS NULL))` : "";
  const params = filter ? [filter.system, filter.levels.filter((level) => level !== null), filter.levels.includes(null)] : [];
  const result = await db.query<{ pool_size: number; entry: (WordbankEntry & { word_audio: AudioMetadata | null; explanations_audio: ExplanationWithAudio[]; selected_examples: Array<{ guid: string; en: string; zh: string; audio: AudioMetadata | null }> }) | null }>(
    `WITH eligible AS MATERIALIZED (SELECT * FROM wordbank_entries ${where}),
      chosen AS (SELECT * FROM eligible ORDER BY random() LIMIT 1)
      SELECT (SELECT count(*)::int FROM eligible) AS pool_size,
        (SELECT jsonb_build_object('guid', e.guid, 'word', e.word, 'parts_of_speech', e.parts_of_speech,
          'definition', e.definition, 'explains', e.explains, 'level', e.level,
          'explanations_audio', COALESCE((SELECT jsonb_agg(x.explanation || jsonb_build_object('audio',
            CASE WHEN a.asset_guid IS NULL THEN NULL ELSE jsonb_build_object('relative_path', a.relative_path, 'text_hash', a.text_hash) END) ORDER BY x.ordinality)
            FROM jsonb_array_elements(e.explains) WITH ORDINALITY x(explanation, ordinality)
            LEFT JOIN wordbank_audio a ON a.asset_guid = (x.explanation->>'guid')::uuid AND a.entry_guid = e.guid AND a.kind = 'explanation'), '[]'::jsonb),
          'word_audio', CASE WHEN w.asset_guid IS NULL THEN NULL ELSE jsonb_build_object('relative_path', w.relative_path, 'text_hash', w.text_hash) END,
          'selected_examples', COALESCE((SELECT jsonb_agg(s.example || jsonb_build_object('audio',
            CASE WHEN a.asset_guid IS NULL THEN NULL ELSE jsonb_build_object('relative_path', a.relative_path, 'text_hash', a.text_hash) END))
            FROM (SELECT value AS example FROM jsonb_array_elements(e.examples) ORDER BY random() LIMIT 3) s
            LEFT JOIN wordbank_audio a ON a.asset_guid = (s.example->>'guid')::uuid AND a.entry_guid = e.guid AND a.kind = 'example'), '[]'::jsonb))
         FROM chosen e LEFT JOIN wordbank_audio w ON w.asset_guid = e.guid AND w.entry_guid = e.guid AND w.kind = 'word') AS entry`, params);
  const row = result.rows[0];
  if (!row.entry) return { poolSize: row.pool_size, entry: null };
  const entry = row.entry;
  return { poolSize: row.pool_size, entry: {
    guid: entry.guid, word: entry.word, partsOfSpeech: entry.parts_of_speech,
    definition: entry.definition,
    explains: entry.explanations_audio.map((explanation) => ({ guid: explanation.guid, en: explanation.en,
      audioUrl: audioUrl(explanation.audio, explanation.en) })), level: entry.level,
    wordAudioUrl: audioUrl(entry.word_audio, entry.word),
    examples: entry.selected_examples.map((example) => ({ guid: example.guid, en: example.en, zh: example.zh,
      audioUrl: audioUrl(example.audio, example.en) })),
  } };
}

/** 按 GUID 查閱完整詞條，不套用練習頁的隨機三句限制。 */
export async function getWordbankPracticeEntry(db: Queryable, guid: string): Promise<WordbankPracticeEntry | null> {
  const result = await db.query(`SELECT e.*, COALESCE((SELECT jsonb_object_agg(a.asset_guid::text,
    jsonb_build_object('relative_path',a.relative_path,'text_hash',a.text_hash,'kind',a.kind))
    FROM wordbank_audio a WHERE a.entry_guid=e.guid), '{}'::jsonb) AS audio FROM wordbank_entries e WHERE e.guid=$1`, [guid]);
  const row = result.rows[0];
  if (!row) return null;
  const clip = (assetGuid: string, kind: string, text: string) => {
    const metadata = row.audio[assetGuid];
    return metadata?.kind === kind ? audioUrl(metadata, text) : null;
  };
  return { guid: row.guid, word: row.word, partsOfSpeech: row.parts_of_speech, definition: row.definition, level: row.level,
    wordAudioUrl: clip(row.guid, "word", row.word),
    explains: row.explains.map((x: { guid: string; en: string }) => ({ guid: x.guid, en: x.en, audioUrl: clip(x.guid, "explanation", x.en) })),
    examples: row.examples.map((x: { guid: string; en: string; zh: string }) => ({ guid: x.guid, en: x.en, zh: x.zh, audioUrl: clip(x.guid, "example", x.en) })) };
}
