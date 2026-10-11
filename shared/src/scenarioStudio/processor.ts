import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, mkdir, lstat, open, link, unlink } from "node:fs/promises";
import path from "node:path";
import { withTransaction, type DbPool } from "../db";
import { listWordbankEntries } from "../repo/wordbank";
import { importScenarioRevision } from "../repo/scenarios";
import { ScenarioContentSchema, copyScenarioAsset, scenarioHash, scenarioCanonicalJson, scenarioSafePath, type ScenarioAsset } from "../scenarios";
import { wordbankTextHash } from "../wordbankAudio";
import { ImageModelSchema } from "../illustrations/catalog";
import { GenerationSettingsSchema } from "../generationSettings";
import { claimStudioJob, heartbeatStudioJob, beginStudioAttempt, finishStudioAttempt, finishStudioJob, getStudioDraft, getStudioAsset, listStudioAssets, insertStudioAsset, reserveStudioRevision, storeStudioStoryCandidate } from "./repository";
import { analyzeStudioStory, studioDraftChecks, studioMissingAudioPlan } from "./story";
import { readStudioMedia, writeStudioMedia, validateStudioMp3 } from "./storage";
import { STUDIO_SERENA, studioCompiledPrompt, type StudioAudioClip, type StudioClaim, type StudioAsset } from "./contracts";
import { compileScenarioStoryPrompt, parseScenarioStory, StudioProviderError, StudioSpeechProfileSchema, type ScenarioStudioProviders, type StudioSpeechProfile } from "./providers";

export interface ScenarioStudioWorkerDeps { pool: DbPool; providers: ScenarioStudioProviders; studioDir: string; imageDir: string; audioDir: string;
  leaseSeconds?: number; heartbeatMs?: number; validateAudioFile?: typeof validateStudioMp3 }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function speechProfile(job: StudioClaim["job"]): StudioSpeechProfile {
  // UI 只提供允許的profile；endpoint與credential永遠不在job快照。
  const settings = job.input.settings as { studioSpeech?: unknown } | undefined;
  return StudioSpeechProfileSchema.parse(settings?.studioSpeech ?? STUDIO_SERENA);
}
function safeDiagnostic(error: unknown): string {
  if (error instanceof StudioProviderError) return error.message.slice(0, 1000);
  // 外部原始錯誤可能含provider內容或憑證，僅顯示可控本地訊息。
  return error instanceof Error && /^(故事|圖片|音檔|素材|工作|草稿|字庫|目標|英文|旁白|十五|情境|MP3|ffprobe|ffmpeg|不是|每句|請|需要)/.test(error.message) ? error.message.slice(0, 1000) : "情境工作失敗，請檢查設定與素材後人工重試";
}
async function assertLease(deps: ScenarioStudioWorkerDeps, claim: StudioClaim): Promise<void> {
  if (!await heartbeatStudioJob(deps.pool, claim.job.id, claim.leaseToken, deps.leaseSeconds ?? 60)) throw new Error("工作已取消或租約失效");
}

/** 呼叫一項由管理者明確建立的工作；每項外部request持久保存attempt，完全不自動重送。 */
export async function processScenarioStudioJob(deps: ScenarioStudioWorkerDeps): Promise<boolean> {
  const claim = await claimStudioJob(deps.pool, deps.leaseSeconds ?? 60);
  if (!claim) return false;
  let lostLease = false;
  const heartbeat = setInterval(() => { void heartbeatStudioJob(deps.pool, claim.job.id, claim.leaseToken, deps.leaseSeconds ?? 60).then(ok => { if (!ok) lostLease = true; }).catch(() => { lostLease = true; }); }, deps.heartbeatMs ?? 15_000);
  heartbeat.unref();
  const active = async () => { if (lostLease) throw new Error("工作租約失效"); await assertLease(deps, claim); };
  try {
    await active();
    if (claim.job.kind === "wordbank-audio") await processWordbankAudio(deps, claim, active);
    else if (claim.job.kind === "finalize") await finalizeStudio(deps, claim, active);
    else await processGeneration(deps, claim, active);
  } catch (error) {
    const uncertain = error instanceof StudioProviderError && error.uncertain;
    // DB失連／commit不明時finish可能再次失敗，保留processing租約供保守recover判定。
    await finishStudioJob(deps.pool, claim.job.id, claim.leaseToken, { status: uncertain ? "uncertain" : "failed", error: safeDiagnostic(error) }).catch(() => {});
  } finally { clearInterval(heartbeat); }
  return true;
}

async function processGeneration(deps: ScenarioStudioWorkerDeps, claim: StudioClaim, active: () => Promise<void>) {
  const { job, draft, leaseToken } = claim;
  let attempt: string | undefined;
  let received = false;
  try {
    if (job.kind === "story") {
      const settings = GenerationSettingsSchema.parse(job.input.settings);
      const entries = await listWordbankEntries(deps.pool);
      const dictionary = entries.filter(e => draft.vocabularyFilter.levels.includes(e.level.list as "basic" | "advance"));
      const prompt = job.input.storyPrompt ?? compileScenarioStoryPrompt({ titleZh: draft.titleZh, targets: draft.targets, imageSettings: { sceneDescription: draft.sceneDescription } }, dictionary);
      await active();
      attempt = await beginStudioAttempt(deps.pool, job.id, leaseToken, { provider: settings.text.provider, model: settings.text.model, estimatedCostUsdMicros: quoteCost(job) });
      const raw = await deps.providers.story(settings.text, prompt);
      received = true;
      await finishStudioAttempt(deps.pool, attempt, { state: "received" });
      const proposal = parseScenarioStory(raw, entries, draft.targets);
      const analyzed = await analyzeStudioStory(deps.pool, { ...draft, story: proposal.story });
      if (!analyzed.story) throw new Error("故事解析結果無效");
      // 已送出的付費請求可能在取消／租約失效後才回來；仍保存候選，沒有權限覆寫草稿或狀態。
      await storeStudioStoryCandidate(deps.pool, job.id, analyzed.story);
      await finishStudioAttempt(deps.pool, attempt, { state: "succeeded" });
      await finishStudioJob(deps.pool, job.id, leaseToken, { status: "done", output: { story: analyzed.story, issues: proposal.issues, missingTargetGuids: proposal.missingTargetGuids, checks: analyzed.checks },
        draftPatch: { story: analyzed.story, selectedAudioId: null, review: { ...draft.review, story: false, audio: false } } });
    } else if (job.kind === "image") {
      const model = ImageModelSchema.parse(job.input.imageModel);
      await active();
      attempt = await beginStudioAttempt(deps.pool, job.id, leaseToken, { provider: model.provider, model: model.apiModel, estimatedCostUsdMicros: quoteCost(job) });
      const image = await deps.providers.image(model, studioCompiledPrompt(draft), job.id);
      received = true;
      await finishStudioAttempt(deps.pool, attempt, { state: "received", providerRequestId: image.providerRequestId, usage: image.usage });
      const stored = await writeStudioMedia(deps.studioDir, draft.id, "image", image.bytes, image.contentType);
      const asset = await insertStudioAsset(deps.pool, { ...stored, inputHash: job.inputHash, metadata: { model: model.id, prompt: studioCompiledPrompt(draft), providerRequestId: image.providerRequestId, usage: image.usage } });
      await finishStudioAttempt(deps.pool, attempt, { state: "succeeded", providerRequestId: image.providerRequestId, usage: image.usage });
      await finishStudioJob(deps.pool, job.id, leaseToken, { status: "done", output: { assetId: asset.id }, draftPatch: { selectedImageId: asset.id,
        targets: draft.targets.map(t => ({ ...t, interaction: { label: null, object: null } })), review: { ...draft.review, image: false, coordinates: false } } });
    } else if (job.kind === "story-audio") {
      if (!draft.story?.textEn.trim()) throw new Error("故事尚未準備");
      const profile = speechProfile(job);
      await active();
      attempt = await beginStudioAttempt(deps.pool, job.id, leaseToken, { provider: "local-qwen", model: profile.model });
      const audio = await deps.providers.speech(profile, draft.story.textEn);
      received = true;
      await finishStudioAttempt(deps.pool, attempt, { state: "received" });
      const stored = await writeStudioMedia(deps.studioDir, draft.id, "story-audio", audio.bytes, audio.contentType);
      const asset = await insertStudioAsset(deps.pool, { ...stored, textSha256: scenarioHash(draft.story.textEn), inputHash: job.inputHash, metadata: { profile } });
      await finishStudioAttempt(deps.pool, attempt, { state: "succeeded" });
      await finishStudioJob(deps.pool, job.id, leaseToken, { status: "done", output: { assetId: asset.id }, draftPatch: { selectedAudioId: asset.id, review: { ...draft.review, audio: false } } });
    }
  } catch (error) {
    if (attempt) {
      // 已收到結果但寫metadata失败时保留received，可恢复本地候选；未收到且网络不明则uncertain。
      const uncertain = error instanceof StudioProviderError && error.uncertain;
      await finishStudioAttempt(deps.pool, attempt, { state: uncertain ? "uncertain" : "failed", error: safeDiagnostic(error) }).catch(() => {});
    }
    if (!received && !(error instanceof StudioProviderError) && attempt) throw new StudioProviderError("供應商回應不明，請人工確認後重試", true);
    throw error;
  }
}
function quoteCost(job: StudioClaim["job"]): number { const quote = job.input.quote as { estimatedCostUsdMicros?: unknown } | undefined; return typeof quote?.estimatedCostUsdMicros === "number" && quote.estimatedCostUsdMicros >= 0 ? quote.estimatedCostUsdMicros : 0; }

interface CurrentClip { text: string; audio: { relative_path: string; text_hash: string; kind: string; bytes: string | number; entry_guid: string } | null }
async function currentClip(pool: DbPool, clip: StudioAudioClip): Promise<CurrentClip> {
  const row = (await pool.query("SELECT e.*, to_jsonb(a) AS audio FROM wordbank_entries e LEFT JOIN wordbank_audio a ON a.asset_guid=$2 WHERE e.guid=$1", [clip.entryGuid, clip.assetGuid])).rows[0];
  if (!row) throw new Error("字庫單字已不存在");
  const text = clip.kind === "word" ? (clip.assetGuid === row.guid ? row.word : undefined) : (clip.kind === "example" ? row.examples : row.explains).find((v: { guid: string }) => v.guid === clip.assetGuid)?.en;
  if (typeof text !== "string" || text.trim() !== clip.text || wordbankTextHash(text) !== clip.textHash) throw new Error("字庫文字已更新，請重新建立補音計畫");
  return { text: text.trim(), audio: row.audio };
}
async function validExistingAudio(deps: ScenarioStudioWorkerDeps, clip: StudioAudioClip, current: CurrentClip): Promise<boolean> {
  const a = current.audio;
  if (!a || a.entry_guid !== clip.entryGuid || a.kind !== clip.kind || a.text_hash !== clip.textHash || !/^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(a.relative_path)) return false;
  try {
    const file = await scenarioSafePath(deps.audioDir, a.relative_path);
    const result = await (deps.validateAudioFile ?? validateStudioMp3)(file);
    return result.bytes === Number(a.bytes);
  } catch { return false; }
}
async function storeWordbankAudio(root: string, relative: string, bytes: Buffer) {
  const base = await realpath(root);
  let directory = base;
  for (const part of relative.split("/").slice(0, -1)) { directory = path.join(directory, part); await mkdir(directory).catch(e => { if (e.code !== "EEXIST") throw e; }); const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("音檔路徑不可使用 symlink"); }
  const file = path.join(base, relative), temporary = `${file}.partial-${randomUUID()}`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    // hardlink 發布完整已fsync的檔案，不暴露部分寫入，不覆寫其他工作或symlink。
    try { await link(temporary, file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const old = await readFile(await scenarioSafePath(base, relative)); if (scenarioHash(old) !== scenarioHash(bytes)) throw new Error("音檔已有不同內容，保留舊檔，請人工檢查"); }
  } finally { await unlink(temporary).catch(() => {}); }
}
/** 每一 clip 先保存 attempt；完成的metadata可於手動重試時跳過，未知結果不自動重新呼叫。 */
async function processWordbankAudio(deps: ScenarioStudioWorkerDeps, claim: StudioClaim, active: () => Promise<void>) {
  const profile = speechProfile(claim.job);
  const profileHash = hash(scenarioCanonicalJson(profile)).slice(0, 16);
  let generated = 0, skipped = 0;
  for (const clip of claim.job.input.missingAudioPlan ?? []) {
    await active();
    const current = await currentClip(deps.pool, clip);
    if (await validExistingAudio(deps, clip, current)) { skipped++; continue; }
    const relative = `wordbank/${profileHash}-${clip.textHash}/${clip.assetGuid}.mp3`;
    let bytes: Buffer | undefined;
    // 先前已保存但COMMIT回应不明的本地结果可验证续接，不重新调用TTS。
    try { const file = await scenarioSafePath(deps.audioDir, relative); await (deps.validateAudioFile ?? validateStudioMp3)(file); bytes = await readFile(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("音檔復原路徑已有無效素材，請人工檢查後重試"); }
    const attempt = await beginStudioAttempt(deps.pool, claim.job.id, claim.leaseToken, { provider: "local-qwen", model: profile.model, clipKey: `${clip.assetGuid}:${clip.textHash}:${profileHash}` });
    let received = Boolean(bytes);
    try {
      if (!bytes) { bytes = (await deps.providers.speech(profile, clip.text)).bytes; received = true; await finishStudioAttempt(deps.pool, attempt, { state: "received" }); await storeWordbankAudio(deps.audioDir, relative, bytes); }
      const file = await scenarioSafePath(deps.audioDir, relative);
      const metadata = await (deps.validateAudioFile ?? validateStudioMp3)(file);
      await withTransaction(deps.pool, async tx => {
        const job = (await tx.query("SELECT id FROM scenario_studio_jobs WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now() FOR UPDATE", [claim.job.id, claim.leaseToken])).rows[0];
        if (!job) throw new Error("工作已取消或租約失效");
        const row = (await tx.query("SELECT * FROM wordbank_entries WHERE guid=$1 FOR SHARE", [clip.entryGuid])).rows[0];
        const text = clip.kind === "word" ? (clip.assetGuid === row?.guid ? row.word : undefined) : (clip.kind === "example" ? row?.examples : row?.explains)?.find((v: { guid: string }) => v.guid === clip.assetGuid)?.en;
        if (typeof text !== "string" || wordbankTextHash(text) !== clip.textHash || text.trim() !== clip.text) throw new Error("字庫文字已更新，音檔保留但不掛上metadata");
        await tx.query(`INSERT INTO wordbank_audio(asset_guid,entry_guid,kind,relative_path,model,voice,instruct,language,text_hash,duration_seconds,bytes,generated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(asset_guid) DO UPDATE SET entry_guid=EXCLUDED.entry_guid,kind=EXCLUDED.kind,relative_path=EXCLUDED.relative_path,model=EXCLUDED.model,voice=EXCLUDED.voice,instruct=EXCLUDED.instruct,language=EXCLUDED.language,text_hash=EXCLUDED.text_hash,duration_seconds=EXCLUDED.duration_seconds,bytes=EXCLUDED.bytes,generated_at=EXCLUDED.generated_at`,
          [clip.assetGuid, clip.entryGuid, clip.kind, relative, profile.model, profile.voice, profile.instruct, profile.lang_code, clip.textHash, metadata.durationSeconds, metadata.bytes]);
        await finishStudioAttempt(tx, attempt, { state: "succeeded" });
      });
      generated++;
    } catch (error) {
      const uncertain = error instanceof StudioProviderError && error.uncertain;
      await finishStudioAttempt(deps.pool, attempt, { state: uncertain ? "uncertain" : "failed", error: safeDiagnostic(error) }).catch(() => {});
      if (!received && !(error instanceof StudioProviderError)) throw new StudioProviderError("TTS 結果不明，請人工確認後重試", true);
      throw error;
    }
  }
  await finishStudioJob(deps.pool, claim.job.id, claim.leaseToken, { status: "done", output: { generated, skipped, total: claim.job.input.missingAudioPlan?.length ?? 0 } });
}

async function finalizeStudio(deps: ScenarioStudioWorkerDeps, claim: StudioClaim, active: () => Promise<void>) {
  const { draft, job, leaseToken } = claim;
  // 與PUT／cancel共用鎖，從版本核對到正式匯入指標掛回都禁止改稿。
  // 外層只持advisory lock；不跨nested pool交易持job/draft row lock，避免互鎖。
  await withTransaction(deps.pool, async tx => {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scenario-studio-draft:${draft.id}`]);
  await active();
  const current = await getStudioDraft(deps.pool, draft.id);
  if (!current || current.version !== job.inputVersion) throw new Error("草稿已更新，請重新確認後再匯入");
  const assets = await listStudioAssets(deps.pool, draft.id);
  const checks = await studioDraftChecks(deps.pool, draft, assets);
  if (checks.some(c => c.blocking)) throw new Error(`情境尚未完成：${checks.filter(c => c.blocking).map(c => c.message).join("；")}`);
  if ((await studioMissingAudioPlan(deps.pool, draft, deps.audioDir, true)).length) throw new Error("字庫錄音仍有缺漏或已失效，請先補齊");
  const image = await getStudioAsset(deps.pool, draft.id, draft.selectedImageId!);
  const audio = await getStudioAsset(deps.pool, draft.id, draft.selectedAudioId!);
  if (!image || !audio || audio.textSha256 !== scenarioHash(draft.story!.textEn)) throw new Error("素材或故事旁白已失效");
  const imageBytes = await readStudioMedia(deps.studioDir, image), audioBytes = await readStudioMedia(deps.studioDir, audio);
  await active();
  const revision = await reserveStudioRevision(deps.pool, claim);
  const content = ScenarioContentSchema.parse({ schemaVersion: 1, scenarioKey: draft.scenarioKey, revision, titleZh: draft.titleZh, vocabularyFilter: draft.vocabularyFilter, targetCount: draft.targets.length, targets: draft.targets,
    story: { ...draft.story, sentences: draft.story!.sentences.map(({ baseWords: _baseWords, ...sentence }) => sentence) } });
  const asset = (a: StudioAsset): ScenarioAsset => ({ relativePath: `scenarios/${content.scenarioKey}/${revision}/${a.sha256}.${a.kind === "story-audio" ? "mp3" : a.contentType === "image/jpeg" ? "jpg" : a.contentType === "image/webp" ? "webp" : "png"}`,
    sha256: a.sha256, bytes: a.bytes, contentType: a.contentType, ...(a.kind === "image" ? { width: a.width, height: a.height } : { textSha256: a.textSha256 }) });
  const media = { image: asset(image), audio: asset(audio) };
  await active();
  const result = await importScenarioRevision(deps.pool, content, media, { imageDir: deps.imageDir, audioDir: deps.audioDir }, async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try { const i = await copyScenarioAsset(deps.imageDir, media.image, imageBytes); if (i) cleanup.push(i); const a = await copyScenarioAsset(deps.audioDir, media.audio, audioBytes); if (a) cleanup.push(a); }
    catch (error) { await Promise.allSettled(cleanup.map(c => c())); throw error; }
    return async () => { await Promise.allSettled(cleanup.map(c => c())); };
  });
  const attached = await finishStudioJob(deps.pool, job.id, leaseToken, { status: "done", output: result, materializedRevision: revision });
  if (!attached) throw new Error("工作租約失效；版本已匯入，人工重試會沿用同一版本");
  });
}
