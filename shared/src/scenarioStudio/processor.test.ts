import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { DbPool } from "../db";
import { DEFAULT_GENERATION_SETTINGS } from "../generationSettings";
import { WordbankEntrySchema, type WordbankEntry } from "../wordbank";
import { ImageModelSchema } from "../illustrations/catalog";
import { scenarioHash, scenarioCanonicalJson } from "../scenarios";
import { wordbankTextHash } from "../wordbankAudio";
import { emptyStudioDraft, type StudioDraft, type StudioClaim, type StudioAsset } from "./contracts";
import { SERENA_PROFILE, StudioProviderError, type ScenarioStudioProviders } from "./providers";
import { processScenarioStudioJob, type ScenarioStudioWorkerDeps } from "./processor";
import * as repo from "./repository";
import * as storage from "./storage";
import * as story from "./story";
import { listWordbankEntries } from "../repo/wordbank";
import { importScenarioRevision } from "../repo/scenarios";
vi.mock("./repository", () => ({ claimStudioJob: vi.fn(), heartbeatStudioJob: vi.fn(), beginStudioAttempt: vi.fn(), finishStudioAttempt: vi.fn(), finishStudioJob: vi.fn(), getStudioDraft: vi.fn(), getStudioAsset: vi.fn(), listStudioAssets: vi.fn(), insertStudioAsset: vi.fn(), reserveStudioRevision: vi.fn(), storeStudioStoryCandidate: vi.fn() }));
vi.mock("./storage", () => ({ readStudioMedia: vi.fn(), writeStudioMedia: vi.fn(), validateStudioMp3: vi.fn() }));
vi.mock("./story", () => ({ analyzeStudioStory: vi.fn(), studioDraftChecks: vi.fn(), studioMissingAudioPlan: vi.fn() }));
vi.mock("../repo/wordbank", () => ({ listWordbankEntries: vi.fn() }));
vi.mock("../repo/scenarios", () => ({ importScenarioRevision: vi.fn() }));
let root: string, deps: ScenarioStudioWorkerDeps, claim: StudioClaim, entries: WordbankEntry[];
let query: ReturnType<typeof vi.fn>, txQuery: ReturnType<typeof vi.fn>;
let providers: { [K in keyof ScenarioStudioProviders]: ReturnType<typeof vi.fn<ScenarioStudioProviders[K]>> };
const imageModel = ImageModelSchema.parse({ id: "test", label: "test", enabled: true, apiModel: "test", provider: "openai", adapter: "openai-images-v1", pricingProfileId: "test", profiles: Object.fromEntries(["cover", "reference", "paragraph"].map(k => [k, { deliveryAspectRatio: "16:9", providerOptions: { size: "1536x1024", quality: "low" } }])) });
const audioBytes = Buffer.from("ID3-fake-media-not-real-generation");
const makeEntry = (word: string) => WordbankEntrySchema.parse({ guid: randomUUID(), id: 1, word, parts_of_speech: ["n"], level: { list: "basic" } });
const lastJobResult = () => vi.mocked(repo.finishStudioJob).mock.calls.at(-1)![3];
beforeEach(async () => {
  vi.resetAllMocks();
  root = await mkdtemp(path.join(tmpdir(), "studio-processor-"));
  for (const d of ["studio", "audio", "images"]) await mkdir(path.join(root, d));
  const pkg = JSON.parse(await readFile(new URL("../../../docs/scenarios/packages/living-room-15-v1/scenario.json", import.meta.url), "utf8"));
  const draft: StudioDraft = { ...emptyStudioDraft("living-room"), id: randomUUID(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), materializedRevision: null,
    titleZh: pkg.titleZh, targets: pkg.targets, story: pkg.story, sceneDescription: "午後客廳", review: { story: true, image: true, coordinates: true, audio: true } };
  claim = { draft, leaseToken: randomUUID(), job: { id: randomUUID(), draftId: draft.id, kind: "story", status: "processing", inputVersion: 1, inputHash: scenarioHash("input"), input: { draft, settings: DEFAULT_GENERATION_SETTINGS, imageModel }, output: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), leaseToken: null } };
  entries = [makeEntry("read")];
  query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
  txQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
  const pool = { query, connect: async () => ({ query: txQuery, release: vi.fn() }) } as unknown as DbPool;
  providers = { story: vi.fn(), image: vi.fn(), speech: vi.fn() };
  deps = { pool, providers, studioDir: path.join(root, "studio"), audioDir: path.join(root, "audio"), imageDir: path.join(root, "images"), validateAudioFile: vi.fn(async filename => ({ durationSeconds: 3, bytes: (await readFile(filename)).length })) };
  vi.mocked(repo.claimStudioJob).mockResolvedValue(claim);
  vi.mocked(repo.heartbeatStudioJob).mockResolvedValue(true);
  vi.mocked(repo.beginStudioAttempt).mockResolvedValue(randomUUID());
  vi.mocked(repo.finishStudioAttempt).mockResolvedValue(undefined);
  vi.mocked(repo.storeStudioStoryCandidate).mockResolvedValue(true);
  vi.mocked(repo.finishStudioJob).mockResolvedValue(true);
  vi.mocked(repo.getStudioDraft).mockResolvedValue(draft);
  vi.mocked(listWordbankEntries).mockResolvedValue(entries);
  vi.mocked(story.analyzeStudioStory).mockImplementation(async (_db, d) => ({ story: d.story, checks: [] }));
  vi.mocked(story.studioMissingAudioPlan).mockResolvedValue([]);
  vi.mocked(storage.writeStudioMedia).mockImplementation(async (_root, draftId, kind, bytes, contentType) => ({ draftId, kind, relativePath: `studio/${draftId}/${kind}/${scenarioHash(bytes)}.${kind === "image" ? "png" : "mp3"}`, sha256: scenarioHash(bytes), bytes: bytes.length, contentType, ...(kind === "image" ? { width: 1600, height: 900 } : { durationSeconds: 3 }) }));
  vi.mocked(repo.insertStudioAsset).mockImplementation(async (_db, asset) => ({ ...asset, id: randomUUID(), createdAt: new Date().toISOString() }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
describe("studio worker 手動階段、租約與單段音檔復原", () => {
  it("沒有queuedjob就不呼叫外部供應商", async () => {
    vi.mocked(repo.claimStudioJob).mockResolvedValue(null);
    expect(await processScenarioStudioJob(deps)).toBe(false);
    expect(providers.story).not.toHaveBeenCalled(); expect(repo.beginStudioAttempt).not.toHaveBeenCalled();
  });
  it("story先存sending，再單次產生，來源選定prompt快照不漂移；unknown留人工checks", async () => {
    claim.job.input.storyPrompt = "persisted exact prompt";
    providers.story.mockResolvedValue(JSON.stringify({ sentences: [{ en: "Reads mystery.", zh: "讀神秘內容。", links: [{ surface: "Reads", word: "read" }, { surface: "mystery", word: "missing" }] }] }));
    await processScenarioStudioJob(deps);
    expect(providers.story).toHaveBeenCalledWith(DEFAULT_GENERATION_SETTINGS.text, "persisted exact prompt");
    expect(vi.mocked(repo.beginStudioAttempt).mock.invocationCallOrder[0]).toBeLessThan(providers.story.mock.invocationCallOrder[0]);
    expect(lastJobResult()).toMatchObject({ status: "done", output: { issues: [{ reason: "unknown" }] }, draftPatch: { review: { story: false, audio: false }, selectedAudioId: null } });
    expect(repo.finishStudioAttempt).toHaveBeenLastCalledWith(deps.pool, expect.any(String), { state: "succeeded" });
  });
  it("timeout轉uncertain且不自動重送；驗證失敗為failed而非偷偷另生成", async () => {
    providers.story.mockRejectedValue(new StudioProviderError("供應商回應不明", true));
    await processScenarioStudioJob(deps);
    expect(lastJobResult().status).toBe("uncertain"); expect(providers.story).toHaveBeenCalledTimes(1);
    expect(repo.finishStudioAttempt).toHaveBeenLastCalledWith(deps.pool, expect.any(String), expect.objectContaining({ state: "uncertain" }));
    providers.story.mockResolvedValue("bad json");
    await processScenarioStudioJob(deps);
    expect(lastJobResult().status).toBe("failed"); expect(providers.story).toHaveBeenCalledTimes(2);
  });
  it("已送出的故事在取消後才回應，finish CAS不通過仍先保存候選且不重新付費", async () => {
    providers.story.mockImplementation(async () => {
      // 模擬管理者取消已經在sending的請求，後續CAS拒絕改狀態及草稿。
      claim.job.status = "cancelled";
      vi.mocked(repo.finishStudioJob).mockResolvedValue(false);
      return JSON.stringify({ sentences: [{ en: "Read.", zh: "閱讀。", links: [{ surface: "Read", word: "read" }] }] });
    });
    await processScenarioStudioJob(deps);
    expect(providers.story).toHaveBeenCalledTimes(1);
    expect(repo.storeStudioStoryCandidate).toHaveBeenCalledWith(deps.pool, claim.job.id, expect.objectContaining({ textEn: "Read.", textZh: "閱讀。" }));
    expect(vi.mocked(repo.storeStudioStoryCandidate).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(repo.finishStudioJob).mock.invocationCallOrder[0]);
    expect(claim.job.status).toBe("cancelled");
    expect(lastJobResult()).toMatchObject({ status: "done", output: { story: { textEn: "Read." } } });
  });
  it("租約失效或取消不再建立付費attempt", async () => {
    vi.mocked(repo.heartbeatStudioJob).mockResolvedValue(false);
    await processScenarioStudioJob(deps);
    expect(repo.beginStudioAttempt).not.toHaveBeenCalled(); expect(providers.story).not.toHaveBeenCalled();
    expect(lastJobResult()).toMatchObject({ status: "failed", error: "工作已取消或租約失效" });
  });
  it("長生成仍獨立續lease；成功只提議patch由repository CAS防改稿覆蓋", async () => {
    deps.heartbeatMs = 5;
    providers.story.mockImplementation(async () => { await new Promise(r => setTimeout(r, 20)); return JSON.stringify({ sentences: [{ en: "Read.", zh: "讀。", links: [{ surface: "Read", word: "read" }] }] }); });
    vi.mocked(repo.finishStudioJob).mockResolvedValue(false);
    await processScenarioStudioJob(deps);
    expect(vi.mocked(repo.heartbeatStudioJob).mock.calls.length).toBeGreaterThan(2);
    expect(providers.story).toHaveBeenCalledTimes(1);
    expect(lastJobResult().draftPatch?.story?.textEn).toBe("Read.");
    expect((lastJobResult().output as { story: { textEn: string } }).story.textEn).toBe("Read.");
  });
  it("image使用與API同一compiler，成功候選清空舊定位並等待驗收", async () => {
    claim.job.kind = "image";
    providers.image.mockResolvedValue({ bytes: Buffer.from("fake image"), contentType: "image/png", sha256: scenarioHash("fake image"), width: 1600, height: 900 });
    await processScenarioStudioJob(deps);
    expect(providers.image).toHaveBeenCalledWith(imageModel, expect.stringContaining("[TEXT RULES]"), claim.job.id);
    expect(lastJobResult()).toMatchObject({ status: "done", draftPatch: { selectedImageId: expect.any(String), review: { image: false, coordinates: false } } });
    expect(lastJobResult().draftPatch?.targets?.every(t => t.interaction.label === null && t.interaction.object === null)).toBe(true);
  });
  it("旁白exact全文單次Serena合成，metadata文字hash對应当前故事", async () => {
    claim.job.kind = "story-audio";
    providers.speech.mockResolvedValue({ bytes: audioBytes, contentType: "audio/mpeg", sha256: scenarioHash(audioBytes), durationSeconds: 3 });
    await processScenarioStudioJob(deps);
    expect(providers.speech).toHaveBeenCalledWith(SERENA_PROFILE, claim.draft.story!.textEn);
    expect(providers.speech).toHaveBeenCalledTimes(1);
    expect(repo.insertStudioAsset).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ textSha256: scenarioHash(claim.draft.story!.textEn), metadata: { profile: SERENA_PROFILE } }));
    expect(lastJobResult().draftPatch?.review?.audio).toBe(false);
  });
  it("wordbank逐clip current textHash再查metadata，已有有效檔不重產", async () => {
    claim.job.kind = "wordbank-audio";
    const entry = entries[0], clip = { assetGuid: entry.guid, entryGuid: entry.guid, kind: "word" as const, text: "read", textHash: wordbankTextHash("read") };
    claim.job.input.missingAudioPlan = [clip];
    const relative = `wordbank/existing/${entry.guid}.mp3`;
    await mkdir(path.join(deps.audioDir, "wordbank/existing"), { recursive: true }); await writeFile(path.join(deps.audioDir, relative), audioBytes);
    query.mockResolvedValue({ rows: [{ guid: entry.guid, word: "read", audio: { entry_guid: entry.guid, kind: "word", text_hash: clip.textHash, relative_path: relative, bytes: audioBytes.length } }], rowCount: 1 });
    await processScenarioStudioJob(deps);
    expect(providers.speech).not.toHaveBeenCalled(); expect(repo.beginStudioAttempt).not.toHaveBeenCalled();
    expect(lastJobResult()).toMatchObject({ status: "done", output: { generated: 0, skipped: 1, total: 1 } });
  });
  it("wordbank已下載檔metadata尚未commit可續接，不重送TTS；upsert前持lease與current字庫锁", async () => {
    claim.job.kind = "wordbank-audio";
    const entry = entries[0], clip = { assetGuid: entry.guid, entryGuid: entry.guid, kind: "word" as const, text: "read", textHash: wordbankTextHash("read") };
    claim.job.input.missingAudioPlan = [clip];
    const profileHash = scenarioHash(scenarioCanonicalJson(SERENA_PROFILE)).slice(0, 16);
    const relative = `wordbank/${profileHash}-${clip.textHash}/${entry.guid}.mp3`;
    await mkdir(path.dirname(path.join(deps.audioDir, relative)), { recursive: true }); await writeFile(path.join(deps.audioDir, relative), audioBytes);
    query.mockResolvedValue({ rows: [{ ...entry, audio: null }], rowCount: 1 });
    txQuery.mockImplementation(async sql => ({ rows: sql.includes("SELECT id FROM scenario_studio_jobs") ? [{ id: claim.job.id }] : sql.includes("SELECT * FROM wordbank_entries") ? [entry] : [], rowCount: 1 }));
    await processScenarioStudioJob(deps);
    expect(providers.speech).not.toHaveBeenCalled();
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("lease_until>now() FOR UPDATE"), [claim.job.id, claim.leaseToken]);
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("FOR SHARE"), [entry.guid]);
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO wordbank_audio"), expect.arrayContaining([relative, clip.textHash]));
    expect(lastJobResult()).toMatchObject({ status: "done", output: { generated: 1 } });
  });
  it("wordbank文字於下載期間修改，保留新版檔但不挂metadata或重新呼叫", async () => {
    claim.job.kind = "wordbank-audio";
    const entry = entries[0], clip = { assetGuid: entry.guid, entryGuid: entry.guid, kind: "word" as const, text: "read", textHash: wordbankTextHash("read") };
    claim.job.input.missingAudioPlan = [clip];
    query.mockResolvedValue({ rows: [{ ...entry, audio: null }], rowCount: 1 });
    txQuery.mockImplementation(async sql => ({ rows: sql.includes("SELECT id FROM scenario_studio_jobs") ? [{ id: claim.job.id }] : sql.includes("SELECT * FROM wordbank_entries") ? [{ ...entry, word: "reads" }] : [], rowCount: 1 }));
    providers.speech.mockResolvedValue({ bytes: audioBytes, contentType: "audio/mpeg", sha256: scenarioHash(audioBytes), durationSeconds: 3 });
    await processScenarioStudioJob(deps);
    expect(providers.speech).toHaveBeenCalledTimes(1);
    expect(txQuery.mock.calls.some(c => String(c[0]).includes("INSERT INTO wordbank_audio"))).toBe(false);
    expect(lastJobResult()).toMatchObject({ status: "failed", error: "字庫文字已更新，音檔保留但不掛上metadata" });
  });
  it("wordbank新產音原子發布後保存metadata，舊profile檔案完整保留", async () => {
    claim.job.kind = "wordbank-audio";
    const entry = entries[0], clip = { assetGuid: entry.guid, entryGuid: entry.guid, kind: "word" as const, text: "read", textHash: wordbankTextHash("read") };
    claim.job.input.missingAudioPlan = [clip];
    const oldRelative = `wordbank/older/${entry.guid}.mp3`, oldData = Buffer.from("ID3-old-text-version");
    await mkdir(path.dirname(path.join(deps.audioDir, oldRelative)), { recursive: true }); await writeFile(path.join(deps.audioDir, oldRelative), oldData);
    query.mockResolvedValue({ rows: [{ ...entry, audio: { relative_path: oldRelative, text_hash: wordbankTextHash("older-text"), kind: "word", entry_guid: entry.guid, bytes: oldData.length } }], rowCount: 1 });
    txQuery.mockImplementation(async sql => ({ rows: sql.includes("SELECT id FROM scenario_studio_jobs") ? [{ id: claim.job.id }] : sql.includes("SELECT * FROM wordbank_entries") ? [entry] : [], rowCount: 1 }));
    providers.speech.mockResolvedValue({ bytes: audioBytes, contentType: "audio/mpeg", sha256: scenarioHash(audioBytes), durationSeconds: 3 });
    await processScenarioStudioJob(deps);
    expect(lastJobResult()).toMatchObject({ status: "done", output: { generated: 1, skipped: 0 } });
    expect(vi.mocked(repo.beginStudioAttempt).mock.invocationCallOrder[0]).toBeLessThan(providers.speech.mock.invocationCallOrder[0]);
    const call = txQuery.mock.calls.find(c => String(c[0]).includes("INSERT INTO wordbank_audio"))!;
    const newRelative = (call[1] as unknown[])[3] as string;
    expect(newRelative).toContain(`-${clip.textHash}/${entry.guid}.mp3`);
    expect(await readFile(path.join(deps.audioDir, newRelative))).toEqual(audioBytes);
    expect(await readFile(path.join(deps.audioDir, oldRelative))).toEqual(oldData);
  });
  it.each([15, 25])("finalize %i詞只匯入不可覆寫draftrevision，不發布；copy使用hashpaths，租約allocator供重試冪等", async count => {
    claim.job.kind = "finalize";
    if (count === 25) {
      claim.draft.story!.paragraphBreakAfterSentenceIds = [claim.draft.story!.sentences[0].id];
      const known = new Set(claim.draft.targets.map(t => t.entryGuid));
      const words = new Set(claim.draft.targets.map(t => t.word));
      for (const link of claim.draft.story!.sentences.flatMap(s => s.wordLinks)) {
        if (known.has(link.entryGuid) || words.has(link.word)) continue;
        claim.draft.targets.push({ word: link.word, entryGuid: link.entryGuid, list: "basic", teachingPos: "n", senseZh: "測試詞義", interaction: { label: { x: .1, y: .2 }, object: { x: .3, y: .4 } } });
        known.add(link.entryGuid); words.add(link.word);
        if (claim.draft.targets.length === count) break;
      }
      for (const link of claim.draft.story!.sentences.flatMap(s => s.wordLinks)) link.isTarget = known.has(link.entryGuid);
      expect(claim.draft.targets).toHaveLength(25);
    }
    claim.draft.selectedImageId = randomUUID(); claim.draft.selectedAudioId = randomUUID();
    const image: StudioAsset = { id: claim.draft.selectedImageId, draftId: claim.draft.id, kind: "image", relativePath: "studio/image.png", sha256: scenarioHash("fake image"), bytes: 10, width: 1600, height: 900, contentType: "image/png", inputHash: claim.job.inputHash, metadata: {}, createdAt: new Date().toISOString() };
    const audio: StudioAsset = { ...image, id: claim.draft.selectedAudioId, kind: "story-audio", relativePath: "studio/audio.mp3", sha256: scenarioHash(audioBytes), bytes: audioBytes.length, contentType: "audio/mpeg", textSha256: scenarioHash(claim.draft.story!.textEn) };
    vi.mocked(repo.listStudioAssets).mockResolvedValue([image, audio]); vi.mocked(repo.getStudioAsset).mockImplementation(async (_db, _d, id) => id === image.id ? image : audio);
    vi.mocked(story.studioDraftChecks).mockResolvedValue([]); vi.mocked(repo.reserveStudioRevision).mockResolvedValue(2);
    vi.mocked(storage.readStudioMedia).mockImplementation(async (_r, a) => a.kind === "image" ? Buffer.from("fake image") : audioBytes);
    vi.mocked(importScenarioRevision).mockImplementation(async (_p, content, media, roots, prepare) => { await prepare!(); return { inserted: true, scenarioKey: "living-room", revision: 2, status: "draft" }; });
    await processScenarioStudioJob(deps);
    expect(importScenarioRevision).toHaveBeenCalledTimes(1);
    expect(vi.mocked(importScenarioRevision).mock.calls[0][1]).toMatchObject({ revision: 2, targetCount: count });
    if (count === 25) expect(vi.mocked(importScenarioRevision).mock.calls[0][1]).toMatchObject({ story: { paragraphBreakAfterSentenceIds: claim.draft.story!.paragraphBreakAfterSentenceIds } });
    else expect(vi.mocked(importScenarioRevision).mock.calls[0][1]).not.toHaveProperty("story.paragraphBreakAfterSentenceIds");
    expect(providers.image).not.toHaveBeenCalled(); expect(providers.speech).not.toHaveBeenCalled();
    expect(lastJobResult()).toMatchObject({ status: "done", materializedRevision: 2, output: { status: "draft" } });
    expect(await readFile(path.join(deps.audioDir, `scenarios/living-room/2/${audio.sha256}.mp3`))).toEqual(audioBytes);
    expect(txQuery).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext($1))", [`scenario-studio-draft:${claim.draft.id}`]);
    const lockIndex = txQuery.mock.calls.findIndex(c => String(c[0]).includes("pg_advisory_xact_lock"));
    const commitIndex = txQuery.mock.calls.findIndex(c => c[0] === "COMMIT");
    expect(txQuery.mock.invocationCallOrder[lockIndex]).toBeLessThan(vi.mocked(repo.getStudioDraft).mock.invocationCallOrder[0]);
    expect(txQuery.mock.invocationCallOrder[commitIndex]).toBeGreaterThan(vi.mocked(repo.finishStudioJob).mock.invocationCallOrder[0]);
    expect(txQuery.mock.calls.some(c => String(c[0]).includes("FOR UPDATE"))).toBe(false);
  });
  it("finalize等待共用草稿鎖時先完成的改稿，取得鎖後重新讀version而不匯入旧版", async () => {
    claim.job.kind = "finalize";
    let unlock!: () => void;
    let reached!: () => void;
    const lockReached = new Promise<void>(resolve => { reached = resolve; });
    txQuery.mockImplementation(async sql => {
      if (String(sql).includes("pg_advisory_xact_lock")) {
        const pending = new Promise<void>(resolve => { unlock = resolve; });
        reached(); await pending;
      }
      return { rows: [], rowCount: 0 };
    });
    const execution = processScenarioStudioJob(deps);
    await lockReached;
    expect(repo.getStudioDraft).not.toHaveBeenCalled();
    // 模擬另一個持相同鎖的PUT先完成，再由finalize取得鎖。
    vi.mocked(repo.getStudioDraft).mockResolvedValue({ ...claim.draft, version: 2 });
    unlock(); await execution;
    expect(importScenarioRevision).not.toHaveBeenCalled(); expect(repo.reserveStudioRevision).not.toHaveBeenCalled();
    expect(lastJobResult()).toMatchObject({ status: "failed", error: "草稿已更新，請重新確認後再匯入" });
  });
  it("finalize缺驗收或草稿新版本不分配revision、不匯入", async () => {
    claim.job.kind = "finalize";
    vi.mocked(story.studioDraftChecks).mockResolvedValue([{ code: "review-audio", blocking: true, message: "請試聽旁白" }]);
    await processScenarioStudioJob(deps);
    expect(repo.reserveStudioRevision).not.toHaveBeenCalled(); expect(importScenarioRevision).not.toHaveBeenCalled();
    vi.mocked(repo.getStudioDraft).mockResolvedValue({ ...claim.draft, version: 2 });
    await processScenarioStudioJob(deps);
    expect(lastJobResult().error).toBe("草稿已更新，請重新確認後再匯入");
  });
  it("finalize執行前再次完整核對字庫錄音，排隊期間失效則不匯入", async () => {
    claim.job.kind = "finalize";
    vi.mocked(repo.listStudioAssets).mockResolvedValue([]);
    vi.mocked(story.studioDraftChecks).mockResolvedValue([]);
    vi.mocked(story.studioMissingAudioPlan).mockResolvedValue([{ assetGuid: entries[0].guid, entryGuid: entries[0].guid, kind: "word", text: "read", textHash: wordbankTextHash("read") }]);
    await processScenarioStudioJob(deps);
    expect(story.studioMissingAudioPlan).toHaveBeenCalledWith(deps.pool, claim.draft, deps.audioDir, true);
    expect(repo.reserveStudioRevision).not.toHaveBeenCalled(); expect(importScenarioRevision).not.toHaveBeenCalled();
    expect(lastJobResult().error).toBe("字庫錄音仍有缺漏或已失效，請先補齊");
  });
});
