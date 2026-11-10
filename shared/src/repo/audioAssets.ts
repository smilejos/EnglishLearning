import { withTransaction, type DbPool } from "../db";
import { AudioAssetsManifestSchema, type AudioAssetManifestEntry, type AudioAssetsManifest,
  type AudioAssetsResponse } from "../audioAssets";
import type { Queryable } from "./types";

const assetKey = (entry: AudioAssetManifestEntry) => `${entry.assetGuid}/${entry.profileHash}`;
const bindingKey = (entry: AudioAssetManifestEntry) => `${entry.scope}/${entry.lessonId}/${entry.key}`;
const assetIdentity = (entry: AudioAssetManifestEntry) => JSON.stringify({
  assetGuid: entry.assetGuid, profileHash: entry.profileHash, profile: entry.profile,
  kind: entry.kind, text: entry.text, textHash: entry.textHash, relativePath: entry.relativePath,
  sha256: entry.sha256, bytes: entry.bytes, durationSeconds: entry.durationSeconds,
});

/** 僅寫 metadata；呼叫者須先驗證 AUDIO_DIR 內的實體檔案 hash、大小及完整解碼。 */
export async function importAudioAssetsManifest(pool: DbPool, input: AudioAssetsManifest): Promise<{ assets: number; bindings: number }> {
  const manifest = AudioAssetsManifestSchema.parse(input);
  const assets = new Map<string, AudioAssetManifestEntry>();
  const bindings = new Map<string, AudioAssetManifestEntry>();
  for (const entry of manifest.entries) {
    const asset = assets.get(assetKey(entry));
    if (asset && assetIdentity(asset) !== assetIdentity(entry)) throw new Error(`共用音訊素材衝突：${assetKey(entry)}`);
    const binding = bindings.get(bindingKey(entry));
    if (binding && assetKey(binding) !== assetKey(entry)) throw new Error(`音訊綁定衝突：${bindingKey(entry)}`);
    assets.set(assetKey(entry), entry);
    bindings.set(bindingKey(entry), entry);
  }
  return withTransaction(pool, async (tx) => {
    // 固定鎖定順序，並以 ON CONFLICT + FOR UPDATE 防止同時匯入覆蓋不同內容。
    for (const [, entry] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
      await tx.query(`INSERT INTO audio_assets
        (asset_guid, profile_hash, profile, kind, text, text_hash, relative_path, sha256, bytes, duration_seconds, generated_at)
        VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (asset_guid, profile_hash) DO NOTHING`,
      [entry.assetGuid, entry.profileHash, JSON.stringify(entry.profile), entry.kind, entry.text,
        entry.textHash, entry.relativePath, entry.sha256, entry.bytes, entry.durationSeconds, entry.generatedAt]);
      const current = (await tx.query(`SELECT * FROM audio_assets WHERE asset_guid=$1 AND profile_hash=$2 FOR UPDATE`,
        [entry.assetGuid, entry.profileHash])).rows[0];
      if (!current || current.kind !== entry.kind || current.text !== entry.text || current.text_hash !== entry.textHash
        || current.relative_path !== entry.relativePath || current.sha256 !== entry.sha256 || Number(current.bytes) !== entry.bytes
        || Number(current.duration_seconds) !== entry.durationSeconds
        || JSON.stringify(Object.fromEntries(Object.keys(entry.profile).map((key) => [key, current.profile[key]]))) !== JSON.stringify(entry.profile))
        throw new Error(`既有共用音訊素材衝突，拒絕覆寫：${assetKey(entry)}`);
    }
    for (const [, entry] of [...bindings].sort(([a], [b]) => a.localeCompare(b))) {
      await tx.query(`INSERT INTO audio_asset_bindings (scope, lesson_id, key, asset_guid, profile_hash)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (scope,lesson_id,key) DO NOTHING`,
      [entry.scope, entry.lessonId, entry.key, entry.assetGuid, entry.profileHash]);
      const current = (await tx.query(`SELECT asset_guid, profile_hash FROM audio_asset_bindings
        WHERE scope=$1 AND lesson_id=$2 AND key=$3 FOR UPDATE`, [entry.scope, entry.lessonId, entry.key])).rows[0];
      if (!current || current.asset_guid !== entry.assetGuid || current.profile_hash !== entry.profileHash)
        throw new Error(`既有音訊綁定衝突，拒絕覆寫：${bindingKey(entry)}`);
    }
    return { assets: assets.size, bindings: bindings.size };
  });
}

/** 字庫有有效的最新錄音就即時沿用；其他素材仍由同一個 AUDIO_DIR／audio 路由提供。 */
export async function getAudioAssets(db: Queryable, scope: string, lessonId: string): Promise<AudioAssetsResponse | null> {
  const result = await db.query(`SELECT b.key, a.asset_guid, a.text, a.relative_path,
      w.relative_path AS wordbank_path
    FROM audio_asset_bindings b
    JOIN audio_assets a ON a.asset_guid=b.asset_guid AND a.profile_hash=b.profile_hash
    LEFT JOIN wordbank_audio w ON w.asset_guid=a.asset_guid AND w.text_hash=a.text_hash
      AND w.kind=CASE WHEN a.kind='sentence' THEN 'example' ELSE a.kind END
      AND EXISTS (SELECT 1 FROM wordbank_entries e WHERE e.guid=w.entry_guid AND (
        (w.kind='word' AND e.guid=w.asset_guid AND btrim(e.word)=a.text)
        OR (w.kind='example' AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.examples) x
          WHERE x->>'guid'=w.asset_guid::text AND btrim(x->>'en')=a.text))
        OR (w.kind='explanation' AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.explains) x
          WHERE x->>'guid'=w.asset_guid::text AND btrim(x->>'en')=a.text))))
    WHERE b.scope=$1 AND b.lesson_id=$2 ORDER BY b.key`, [scope, lessonId]);
  if (!result.rows.length) return null;
  const assets: AudioAssetsResponse["assets"] = Object.create(null);
  for (const row of result.rows) {
    // 即使 metadata 曾遭錯接，也不對外送出越界路徑或其他素材的檔名。
    const wordbankPath = typeof row.wordbank_path === "string"
      && new RegExp(`^wordbank/[a-zA-Z0-9_-]+/${row.asset_guid}\\.mp3$`).test(row.wordbank_path) ? row.wordbank_path : null;
    const relativePath = wordbankPath ?? row.relative_path;
    if (!new RegExp(`^(wordbank|assets)/[a-zA-Z0-9_-]+/${row.asset_guid}\\.mp3$`).test(relativePath)) continue;
    assets[row.key] = { url: `/audio/${relativePath}`, text: row.text, assetGuid: row.asset_guid };
  }
  return { assets };
}
