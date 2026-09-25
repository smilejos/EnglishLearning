import type { Queryable } from "./types";
import { DEFAULT_GENERATION_SETTINGS, GenerationSettingsSchema, type GenerationSettings } from "../generationSettings";

export interface StoredGenerationSettings {
  settings: GenerationSettings;
  version: number;
}

export async function getGenerationSettings(db: Queryable): Promise<StoredGenerationSettings> {
  const result = await db.query("SELECT settings, version FROM generation_settings WHERE id = 1");
  const row = result.rows[0];
  if (!row) return { settings: DEFAULT_GENERATION_SETTINGS, version: 0 };
  return { settings: GenerationSettingsSchema.parse(row.settings), version: Number(row.version) };
}

/** 以版本防止多個管理頁互相覆蓋；回傳 null 表示版本已過期。 */
export async function updateGenerationSettings(
  db: Queryable,
  settings: GenerationSettings,
  expectedVersion: number,
): Promise<StoredGenerationSettings | null> {
  const result = await db.query(
    `UPDATE generation_settings
       SET settings = $1, version = version + 1, updated_at = now()
     WHERE id = 1 AND version = $2
     RETURNING settings, version`,
    [settings, expectedVersion],
  );
  const row = result.rows[0];
  return row ? { settings: GenerationSettingsSchema.parse(row.settings), version: Number(row.version) } : null;
}
