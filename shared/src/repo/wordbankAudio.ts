import { withTransaction, type DbPool } from "../db";
import { WordbankEntrySchema } from "../wordbank";
import { WordbankAudioManifestSchema, validateWordbankAudioManifest, type WordbankAudioManifest } from "../wordbankAudio";

/** 僅保存 metadata；呼叫者另行將檔案放到 AUDIO_DIR 的相對路徑。 */
export async function importWordbankAudioManifest(pool: DbPool, input: WordbankAudioManifest): Promise<number> {
  const manifest = WordbankAudioManifestSchema.parse(input);
  return withTransaction(pool, async (tx) => {
    const result = await tx.query(
      `SELECT guid, source_id AS id, word, parts_of_speech, definition, explains, examples, level, category, scenario
       FROM wordbank_entries WHERE guid = ANY($1::uuid[]) FOR SHARE`,
      [[...new Set(manifest.entries.map((asset) => asset.entryGuid))]]);
    validateWordbankAudioManifest(manifest, result.rows.map((row) => WordbankEntrySchema.parse(row)));
    for (const asset of manifest.entries) {
      await tx.query(
        `INSERT INTO wordbank_audio (asset_guid, entry_guid, kind, relative_path, model, voice, instruct, language, text_hash, duration_seconds, bytes, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (asset_guid) DO UPDATE SET entry_guid = EXCLUDED.entry_guid, kind = EXCLUDED.kind,
           relative_path = EXCLUDED.relative_path, model = EXCLUDED.model, voice = EXCLUDED.voice,
           instruct = EXCLUDED.instruct, language = EXCLUDED.language, text_hash = EXCLUDED.text_hash,
           duration_seconds = EXCLUDED.duration_seconds, bytes = EXCLUDED.bytes, generated_at = EXCLUDED.generated_at`,
        [asset.assetGuid, asset.entryGuid, asset.kind, asset.relativePath, manifest.profile.model,
          manifest.profile.voice, manifest.profile.instruct, manifest.profile.lang_code, asset.textHash,
          asset.durationSeconds, asset.bytes, asset.generatedAt]);
    }
    return manifest.entries.length;
  });
}
