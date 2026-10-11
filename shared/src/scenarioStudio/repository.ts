import { randomUUID } from "node:crypto";
import { withTransaction, type DbPool } from "../db";
import type { Queryable } from "../repo/types";
import { scenarioCanonicalJson } from "../scenarios";
import { StudioEditableSchema, StudioStorySchema, type StudioEditable, type StudioDraft, type StudioJob, type StudioAsset, type StudioClaim } from "./contracts";

export class StudioConflictError extends Error {}
export class StudioUncertainChargeError extends StudioConflictError {}
/** finalizer 可跨檔案驗證／既有匯入交易持有同一草稿鎖；不要在此外層取得 row lock。 */
export async function withStudioDraftLock<T>(pool:DbPool,id:string,callback:()=>Promise<T>):Promise<T>{return withTransaction(pool,async tx=>{await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`scenario-studio-draft:${id}`]);return callback();});}
const iso = (value: Date | string): string => new Date(value).toISOString();
const draftRow = (r: any): StudioDraft => ({ ...r.draft, id: r.id, version: r.version, materializedRevision: r.materialized_revision, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const jobRow = (r: any): StudioJob => ({ id: r.id, draftId: r.draft_id, kind: r.kind, status: r.status, requiresUncertainAcknowledgement:r.status==="uncertain"||Boolean(r.requires_uncertain_acknowledgement), inputVersion: r.input_version, inputHash: r.input_hash, input: r.input, output: r.output, error: r.error, leaseToken: r.lease_token, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const assetRow = (r: any): StudioAsset => ({ id: r.id, draftId: r.draft_id, kind: r.kind, relativePath: r.relative_path, sha256: r.sha256, bytes: Number(r.bytes), contentType: r.content_type, ...(r.width ? { width: r.width, height: r.height } : {}), ...(r.duration_seconds ? { durationSeconds: r.duration_seconds } : {}), ...(r.text_sha256 ? { textSha256: r.text_sha256 } : {}), inputHash: r.input_hash, metadata: r.metadata, createdAt: iso(r.created_at) });
export async function getStudioDraft(db: Queryable, id: string): Promise<StudioDraft | null> { const row = (await db.query("SELECT * FROM scenario_studio_drafts WHERE id=$1", [id])).rows[0]; return row ? draftRow(row) : null; }
export async function listStudioDrafts(db: Queryable): Promise<StudioDraft[]> { return (await db.query("SELECT * FROM scenario_studio_drafts ORDER BY updated_at DESC LIMIT 100")).rows.map(draftRow); }
export async function createStudioDraft(db: Queryable, input: StudioEditable, actorId?: string|number): Promise<StudioDraft> { const draft = StudioEditableSchema.parse(input); const row = (await db.query("INSERT INTO scenario_studio_drafts(scenario_key,draft,created_by) VALUES($1,$2::jsonb,$3) RETURNING *", [draft.scenarioKey, JSON.stringify(draft), actorId ?? null])).rows[0]; return draftRow(row); }
/** 保存會明確作廢受影響的驗收；未變的驗收可由管理者手動確認。 */
export async function updateStudioDraft(pool: DbPool, id: string, expectedVersion: number, input: StudioEditable): Promise<StudioDraft> {
  const next = StudioEditableSchema.parse(input);
  return withTransaction(pool, async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`scenario-studio-draft:${id}`]);
    const old = (await tx.query("SELECT * FROM scenario_studio_drafts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!old || old.version !== expectedVersion) throw new StudioConflictError("草稿已更新，請重新載入後再儲存");
    if (old.materialized_revision !== null) throw new StudioConflictError("教材已固定為版本，請複製成新草稿再修改");
    const current = draftRow(old);
    const changed = (a: unknown, b: unknown) => scenarioCanonicalJson(a) !== scenarioCanonicalJson(b);
    if (changed(current.targets.map(t => ({ ...t, interaction: undefined })), next.targets.map(t => ({ ...t, interaction: undefined }))) || current.sceneDescription !== next.sceneDescription || changed(current.promptSettings, next.promptSettings)) { next.review.image = false; next.review.story = false; }
    if (changed(current.story, next.story)) { next.review.story = false; next.review.audio = false; }
    if (current.selectedImageId !== next.selectedImageId) { next.review.image = false; next.review.coordinates = false; }
    if (changed(current.targets.map(t => t.interaction), next.targets.map(t => t.interaction))) next.review.coordinates = false;
    if (current.selectedAudioId !== next.selectedAudioId) next.review.audio = false;
    return draftRow((await tx.query("UPDATE scenario_studio_drafts SET scenario_key=$3,draft=$4::jsonb,version=version+1,materialized_revision=NULL,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *", [id, expectedVersion, next.scenarioKey, JSON.stringify(next)])).rows[0]);
  });
}
export async function listStudioJobs(db: Queryable, id: string): Promise<StudioJob[]> { return (await db.query("SELECT j.*,EXISTS(SELECT 1 FROM scenario_studio_attempts a WHERE a.job_id=j.id AND a.state='uncertain') AS requires_uncertain_acknowledgement FROM scenario_studio_jobs j WHERE draft_id=$1 ORDER BY created_at DESC LIMIT 100", [id])).rows.map(jobRow); }
export async function getStudioJob(db: Queryable, id: string): Promise<StudioJob | null> { const row = (await db.query("SELECT j.*,EXISTS(SELECT 1 FROM scenario_studio_attempts a WHERE a.job_id=j.id AND a.state='uncertain') AS requires_uncertain_acknowledgement FROM scenario_studio_jobs j WHERE id=$1", [id])).rows[0]; return row ? jobRow(row) : null; }
export async function studioHasUncertainCharge(db:Queryable,draftId:string):Promise<boolean>{return Boolean((await db.query("SELECT 1 FROM scenario_studio_jobs j WHERE j.draft_id=$1 AND (j.status='uncertain' OR EXISTS(SELECT 1 FROM scenario_studio_attempts a WHERE a.job_id=j.id AND a.state='uncertain')) LIMIT 1",[draftId])).rows.length);}
export async function enqueueStudioJob(pool: DbPool, id: string, expectedVersion: number, input: { kind: StudioJob["kind"]; inputHash: string; input: StudioJob["input"]; idempotencyKey: string;ackUncertain?:boolean }): Promise<StudioJob> {
  return withTransaction(pool, async tx => {
    const existing = (await tx.query("SELECT * FROM scenario_studio_jobs WHERE draft_id=$1 AND idempotency_key=$2", [id, input.idempotencyKey])).rows[0];
    if (existing) { if (existing.input_hash !== input.inputHash || existing.kind !== input.kind) throw new StudioConflictError("相同操作編號不可改用另一份輸入"); return jobRow(existing); }
    const draft = (await tx.query("SELECT version,materialized_revision FROM scenario_studio_drafts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!draft || draft.version !== expectedVersion) throw new StudioConflictError("草稿版本已更新");
    if (draft.materialized_revision !== null) throw new StudioConflictError("教材已固定為版本，請複製成新草稿再生成");
    if(!input.ackUncertain&&await studioHasUncertainCharge(tx,id))throw new StudioUncertainChargeError("先前請求或取消中的請求結果不明；重送可能重複計費，請明確接受後再操作");
    const busy = (await tx.query("SELECT id FROM scenario_studio_jobs WHERE draft_id=$1 AND status IN ('queued','processing')", [id])).rows[0];
    if (busy) throw new StudioConflictError("已有工作執行中，完成或取消後再操作");
    return jobRow((await tx.query("INSERT INTO scenario_studio_jobs(draft_id,kind,input_version,input_hash,input,idempotency_key) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *", [id, input.kind, expectedVersion, input.inputHash, JSON.stringify(input.input), input.idempotencyKey])).rows[0]);
  });
}
export async function claimStudioJob(pool: DbPool, leaseSeconds = 60): Promise<StudioClaim | null> {
  return withTransaction(pool, async tx => {
    const row = (await tx.query("SELECT * FROM scenario_studio_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if (!row) return null;
    const token = randomUUID();
    const updated = (await tx.query("UPDATE scenario_studio_jobs SET status='processing',lease_token=$2,lease_until=now()+$3*interval '1 second',updated_at=now() WHERE id=$1 RETURNING *", [row.id, token, leaseSeconds])).rows[0];
    return { job: jobRow(updated), draft: row.input.draft, leaseToken: token };
  });
}
export async function heartbeatStudioJob(db: Queryable, id: string, token: string, leaseSeconds = 60): Promise<boolean> { return Boolean((await db.query("UPDATE scenario_studio_jobs SET lease_until=now()+$3*interval '1 second',updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now() RETURNING id", [id, token, leaseSeconds])).rows.length); }
export async function beginStudioAttempt(pool: DbPool, id: string, token: string, input: { provider: string; model: string; clipKey?: string; estimatedCostUsdMicros?: number }): Promise<string> {
  return withTransaction(pool, async tx => {
    const job = (await tx.query("SELECT id FROM scenario_studio_jobs WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now() FOR UPDATE", [id, token])).rows[0];
    if (!job) throw new StudioConflictError("工作已取消或租約失效");
    return (await tx.query("INSERT INTO scenario_studio_attempts(job_id,clip_key,provider,model,state,estimated_cost_usd_micros) VALUES($1,$2,$3,$4,'sending',$5) RETURNING id", [id, input.clipKey ?? null, input.provider, input.model, input.estimatedCostUsdMicros ?? 0])).rows[0].id;
  });
}
export async function finishStudioAttempt(db: Queryable, id: string, input: { state: "received" | "succeeded" | "failed" | "uncertain"; providerRequestId?: string; usage?: unknown; error?: string }): Promise<void> { await db.query("UPDATE scenario_studio_attempts SET state=$2,provider_request_id=$3,usage=$4::jsonb,error=$5,finished_at=now() WHERE id=$1 AND state IN ('sending','received')", [id, input.state, input.providerRequestId ?? null, JSON.stringify(input.usage ?? null), input.error?.slice(0, 1000) ?? null]); }
/** 付費文字結果獨立保存為候選；取消／租約失效只阻擋套稿，不丟棄已取得的故事。 */
export async function storeStudioStoryCandidate(db:Queryable,id:string,input:NonNullable<StudioEditable["story"]>):Promise<boolean>{
  const story=StudioStorySchema.parse(input);
  return Boolean((await db.query("UPDATE scenario_studio_jobs SET output=COALESCE(output,'{}'::jsonb)||jsonb_build_object('story',$2::jsonb),updated_at=now() WHERE id=$1 AND kind='story' RETURNING id",[id,JSON.stringify(story)])).rows.length);
}
export async function finishStudioJob(pool: DbPool, id: string, token: string, input: { status: "done" | "failed" | "uncertain"; output?: unknown; error?: string; draftPatch?: Partial<StudioEditable>; materializedRevision?: number }): Promise<boolean> {
  return withTransaction(pool, async tx => {
    const job = (await tx.query("SELECT * FROM scenario_studio_jobs WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now() FOR UPDATE", [id, token])).rows[0];
    if (!job) return false;
    if (input.status === "done" && (input.draftPatch || input.materializedRevision !== undefined)) {
      const row = (await tx.query("SELECT * FROM scenario_studio_drafts WHERE id=$1 FOR UPDATE", [job.draft_id])).rows[0];
      if (row.version === job.input_version) {
        const draft = StudioEditableSchema.parse({ ...row.draft, ...input.draftPatch });
        await tx.query("UPDATE scenario_studio_drafts SET draft=$2::jsonb,version=version+1,materialized_revision=$3,updated_at=now() WHERE id=$1", [row.id, JSON.stringify(draft), input.materializedRevision ?? null]);
      }
    }
    await tx.query("UPDATE scenario_studio_jobs SET status=$3,output=CASE WHEN $6::boolean THEN CASE WHEN jsonb_typeof(output)='object' AND jsonb_typeof($4::jsonb)='object' THEN output||$4::jsonb ELSE $4::jsonb END ELSE output END,error=$5,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2", [id, token, input.status, JSON.stringify(input.output ?? null), input.error?.slice(0, 1000) ?? null,input.output!==undefined]);
    return true;
  });
}
export async function cancelStudioJob(pool: DbPool, id: string): Promise<StudioJob | null> { return withTransaction(pool, async tx => {
  const info=(await tx.query("SELECT draft_id FROM scenario_studio_jobs WHERE id=$1",[id])).rows[0];
  if(!info)return null;
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`scenario-studio-draft:${info.draft_id}`]);
  const row = (await tx.query("UPDATE scenario_studio_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND status IN ('queued','processing') RETURNING *", [id])).rows[0];
  if (row) {await tx.query("UPDATE scenario_studio_attempts SET state='uncertain',error='管理者取消；外部請求結果仍可能不明',finished_at=now() WHERE job_id=$1 AND state='sending'", [id]);await tx.query("UPDATE scenario_studio_jobs SET error=CASE WHEN EXISTS(SELECT 1 FROM scenario_studio_attempts WHERE job_id=$1 AND state='uncertain') THEN '已取消；已送出的請求結果不明，重送可能重複計費' ELSE '已取消，沒有自動重送' END WHERE id=$1",[id]);}
  return getStudioJob(tx, id);
}); }
export async function recoverStudioJobs(pool: DbPool): Promise<number> { return withTransaction(pool, async tx => {
  const rows = (await tx.query("UPDATE scenario_studio_jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM scenario_studio_attempts a WHERE a.job_id=scenario_studio_jobs.id AND a.state IN ('sending','uncertain')) THEN 'uncertain' ELSE 'failed' END,error='工作租約逾期，請人工檢查後重試',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='processing' AND lease_until<=now() RETURNING id")).rows;
  if (rows.length) await tx.query("UPDATE scenario_studio_attempts SET state='uncertain',error='租約逾期，沒有自動重送',finished_at=now() WHERE job_id=ANY($1::uuid[]) AND state='sending'", [rows.map(r => r.id)]);
  return rows.length;
}); }
export async function listStudioAssets(db: Queryable, id: string): Promise<StudioAsset[]> { return (await db.query("SELECT * FROM scenario_studio_assets WHERE draft_id=$1 ORDER BY created_at DESC", [id])).rows.map(assetRow); }
export async function getStudioAsset(db: Queryable, draftId: string, id: string): Promise<StudioAsset | null> { const row = (await db.query("SELECT * FROM scenario_studio_assets WHERE draft_id=$1 AND id=$2", [draftId, id])).rows[0]; return row ? assetRow(row) : null; }
export async function insertStudioAsset(db: Queryable, a: Omit<StudioAsset, "id" | "createdAt" | "url">): Promise<StudioAsset> {
  const row = (await db.query("INSERT INTO scenario_studio_assets(draft_id,kind,relative_path,sha256,bytes,content_type,width,height,duration_seconds,text_sha256,input_hash,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) ON CONFLICT(relative_path) DO UPDATE SET relative_path=EXCLUDED.relative_path RETURNING *", [a.draftId,a.kind,a.relativePath,a.sha256,a.bytes,a.contentType,a.width??null,a.height??null,a.durationSeconds??null,a.textSha256??null,a.inputHash,JSON.stringify(a.metadata)])).rows[0];
  if (row.draft_id !== a.draftId || row.sha256 !== a.sha256 || row.kind !== a.kind || Number(row.bytes) !== a.bytes) throw new StudioConflictError("素材路徑衝突");
  return assetRow(row);
}
export async function announceStudioWorker(db: Queryable, id: string, capabilities: unknown): Promise<void> { await db.query("INSERT INTO scenario_studio_worker_heartbeats(id,capabilities) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET capabilities=EXCLUDED.capabilities,updated_at=now()", [id,JSON.stringify(capabilities)]); }
export async function listStudioWorkers(db: Queryable): Promise<Array<{ id: string; capabilities: unknown; updatedAt: string }>> { return (await db.query("SELECT * FROM scenario_studio_worker_heartbeats WHERE updated_at>now()-interval '60 seconds'")).rows.map(r=>({id:r.id,capabilities:r.capabilities,updatedAt:iso(r.updated_at)})); }
export async function reserveStudioRevision(pool:DbPool,claim:StudioClaim):Promise<number>{return withTransaction(pool,async tx=>{
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`scenario:${claim.draft.scenarioKey}`]);
  const valid=(await tx.query("SELECT id FROM scenario_studio_jobs WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now() FOR UPDATE",[claim.job.id,claim.leaseToken])).rows[0];
  if(!valid)throw new StudioConflictError("工作租約失效");
  const old=(await tx.query("SELECT r.revision FROM scenario_studio_revision_reservations r JOIN scenario_studio_jobs j ON j.id=r.job_id WHERE j.draft_id=$1 AND j.input_hash=$2 AND j.kind='finalize' ORDER BY r.revision LIMIT 1",[claim.job.draftId,claim.job.inputHash])).rows[0];if(old)return old.revision;
  const revision=Number((await tx.query("SELECT GREATEST(COALESCE((SELECT max(revision) FROM scenario_revisions WHERE scenario_key=$1),0),COALESCE((SELECT max(revision) FROM scenario_studio_revision_reservations WHERE scenario_key=$1),0))+1 AS revision",[claim.draft.scenarioKey])).rows[0].revision);
  await tx.query("INSERT INTO scenario_studio_revision_reservations(job_id,scenario_key,revision) VALUES($1,$2,$3)",[claim.job.id,claim.draft.scenarioKey,revision]);return revision;
});}
export async function getStudioCompletedClips(db:Queryable,draftId:string,inputHash:string):Promise<string[]>{return (await db.query("SELECT DISTINCT a.clip_key FROM scenario_studio_attempts a JOIN scenario_studio_jobs j ON j.id=a.job_id WHERE j.draft_id=$1 AND j.input_hash=$2 AND a.state='succeeded' AND a.clip_key IS NOT NULL",[draftId,inputHash])).rows.map(r=>r.clip_key);}
