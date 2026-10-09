import { withTransaction, type DbPool } from "../db";
import { ScenarioContentSchema, scenarioRevisionHash, validateScenarioMedia, verifyScenarioAssets,
  type ScenarioContent, type ScenarioMedia, type ScenarioRecord, type ScenarioSummary } from "../scenarios";
import type { Queryable } from "./types";

export class ScenarioConflictError extends Error {}
export class ScenarioValidationError extends Error {}
export class ScenarioCommitRecoveryError extends Error {
  constructor(public readonly mediaDisposition: "cleaned" | "retained" | "unknown", public readonly originalError: unknown) {
    super(mediaDisposition === "cleaned" ? "提交失敗已回滾；已清理本次新增媒體，可重跑匯入"
      : mediaDisposition === "retained" ? "提交回應失敗，但版本已存在；保留新增媒體，可冪等重跑匯入"
      : "無法確認資料庫提交結果；保留新增媒體避免誤刪，請恢復連線後冪等重跑匯入");
  }
}
export async function validateScenarioWordbank(db: Queryable, content: ScenarioContent): Promise<void> {
  const links = [...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)];
  const refs = new Map<string, string>();
  for (const link of links) {
    if (refs.has(link.entryGuid) && refs.get(link.entryGuid) !== link.word) throw new ScenarioValidationError("同 GUID 的單字不一致");
    refs.set(link.entryGuid, link.word);
  }
  const result = await db.query<{ guid: string; word: string; parts_of_speech: string[]; level: { list?: string } }>(
    "SELECT guid, word, parts_of_speech, level FROM wordbank_entries WHERE guid = ANY($1::uuid[]) FOR SHARE", [[...refs.keys()]]);
  const entries = new Map(result.rows.map(row => [row.guid, row]));
  for (const [guid, word] of refs) if (entries.get(guid)?.word !== word) throw new ScenarioValidationError(`字庫 GUID/單字不符：${word}`);
  for (const target of content.targets) {
    const entry = entries.get(target.entryGuid)!;
    if (entry.level.list !== target.list || !entry.parts_of_speech.includes(target.teachingPos)) throw new ScenarioValidationError(`字庫分級/詞性不符：${target.word}`);
  }
}
export async function importScenarioRevision(pool: DbPool, input: unknown, mediaInput: ScenarioMedia,
  roots: { imageDir: string; audioDir: string }, prepareMedia?: () => Promise<() => Promise<void>>,
): Promise<{ inserted: boolean; scenarioKey: string; revision: number; status: "draft" | "published" }> {
  const content = ScenarioContentSchema.parse(input);
  const media = validateScenarioMedia(content, mediaInput);
  const hash = scenarioRevisionHash(content, media);
  let cleanupMedia: (() => Promise<void>) | undefined;
  let callbackSucceeded = false;
  try {
    return await withTransaction(pool, async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scenario:${content.scenarioKey}`]);
      await validateScenarioWordbank(tx, content);
      const current = await getScenarioRevision(tx, content.scenarioKey, content.revision, true);
      if (current && current.contentHash !== hash) throw new ScenarioConflictError("同 key/revision 已存在不同內容；請增加 revision");
      const cleanup = await prepareMedia?.();
      cleanupMedia = cleanup;
      try {
        await verifyScenarioAssets(content, media, roots);
        if (current) { callbackSucceeded = true; return { inserted: false, scenarioKey: content.scenarioKey, revision: content.revision, status: current.status }; }
        await tx.query("INSERT INTO learning_scenarios (scenario_key) VALUES ($1) ON CONFLICT DO NOTHING", [content.scenarioKey]);
        await tx.query("INSERT INTO scenario_revisions (scenario_key, revision, content, media, content_hash) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)",
          [content.scenarioKey, content.revision, JSON.stringify(content), JSON.stringify(media), hash]);
        const refs = new Map([...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)].map(link => [link.entryGuid, link.word]));
        for (const [guid, word] of refs) await tx.query("INSERT INTO scenario_word_links (scenario_key,revision,entry_guid,word) VALUES ($1,$2,$3,$4)", [content.scenarioKey, content.revision, guid, word]);
        callbackSucceeded = true;
        return { inserted: true, scenarioKey: content.scenarioKey, revision: content.revision, status: "draft" as const };
      } catch (error) { await cleanup?.(); cleanupMedia = undefined; throw error; }
    });
  } catch (error) {
    if (!callbackSucceeded || !cleanupMedia) throw error;
    // COMMIT 回應失敗不等於提交失敗。新連線持同一把鎖，等舊交易結果確定後才判斷。
    let disposition: "cleaned" | "retained" | "unknown" = "unknown";
    try {
      await withTransaction(pool, async tx => {
        await tx.query("SET LOCAL lock_timeout = '2s'");
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scenario:${content.scenarioKey}`]);
        const committed = await getScenarioRevision(tx, content.scenarioKey, content.revision, true);
        if (committed) disposition = "retained";
        else { await cleanupMedia!(); disposition = "cleaned"; }
      });
    } catch { /* 無法重查／取得鎖時保留素材，不因連線中斷誤刪已提交檔案。 */ }
    throw new ScenarioCommitRecoveryError(disposition, error);
  }
}
interface RevisionRow { content: ScenarioContent; media: ScenarioMedia; status: "draft" | "published"; content_hash: string }
const mapRecord = (row: RevisionRow): ScenarioRecord =>
  ({ content: row.content, media: row.media, status: row.status, contentHash: row.content_hash });
export async function getScenarioRevision(db: Queryable, key: string, revision?: number, includeDrafts = false): Promise<ScenarioRecord | null> {
  const result = await db.query<RevisionRow>("SELECT r.content, r.media, r.status, r.content_hash FROM scenario_revisions r JOIN learning_scenarios s USING (scenario_key) WHERE r.scenario_key=$1 AND " +
    (revision === undefined ? "r.revision=s.published_revision" : "r.revision=$2") + (includeDrafts ? "" : " AND r.status='published'"), revision === undefined ? [key] : [key, revision]);
  return result.rows[0] ? mapRecord(result.rows[0]) : null;
}
export async function listScenarios(db: Queryable, includeDrafts = false): Promise<ScenarioSummary[]> {
  const result = await db.query("SELECT r.content, r.status FROM scenario_revisions r JOIN learning_scenarios s USING (scenario_key) WHERE " +
    (includeDrafts ? "r.revision=(SELECT max(revision) FROM scenario_revisions WHERE scenario_key=s.scenario_key)" : "r.revision=s.published_revision AND r.status='published'") + " ORDER BY r.scenario_key");
  return result.rows.map(({ content, status }) => ({ scenarioKey: content.scenarioKey, revision: content.revision, status,
    titleZh: content.titleZh, vocabularyFilter: content.vocabularyFilter, targetCount: content.targetCount }));
}
export async function publishScenarioRevision(pool: DbPool, key: string, revision: number, roots: { imageDir: string; audioDir: string }): Promise<ScenarioRecord | null> {
  return withTransaction(pool, async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scenario:${key}`]);
    const record = await getScenarioRevision(tx, key, revision, true);
    if (!record) return null;
    const content = ScenarioContentSchema.parse(record.content);
    if (scenarioRevisionHash(content, record.media) !== record.contentHash) throw new ScenarioValidationError("版本內容 hash 不符");
    await validateScenarioWordbank(tx, content);
    await verifyScenarioAssets(content, record.media, roots);
    await tx.query("UPDATE scenario_revisions SET status='published', published_at=COALESCE(published_at,now()) WHERE scenario_key=$1 AND revision=$2", [key, revision]);
    await tx.query("UPDATE learning_scenarios SET published_revision=$2 WHERE scenario_key=$1", [key, revision]);
    return { ...record, status: "published" };
  });
}
