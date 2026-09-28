import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildApp } from "../app";
import {
  createPool,
  loadImageModelCatalog,
  LocalImageStorage,
  processImageJob,
  recoverImageJobs,
  cleanupImageFiles,
  ImageProviderError,
  estimateImageCost,
  createVisualRun,
  type VisualPlan,
  type VisualSource,
} from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";

const pool = createPool(resolveTestDatabaseUrl());
const catalog = loadImageModelCatalog(
  new URL("../../../config/image-models.json", import.meta.url).pathname,
  new URL("../../../config/image-pricing.json", import.meta.url).pathname,
);
let dir: string;
const adminConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "admin@example.com",
  adminEmails: ["admin@example.com"],
};
let app: ReturnType<typeof buildApp>, reader: ReturnType<typeof buildApp>;
let articleId: number, paragraphId: number, imageBytes: Buffer;
const source = (): VisualSource => ({
  title: "Cat",
  grade: null,
  level: null,
  categoryId: null,
  paragraphs: [{ id: paragraphId, idx: 0, text: "The cat sits." }],
});
function plan(character = false): VisualPlan {
  const scene = {
    learningGoal: "Recognize a cat",
    subject: "cat",
    action: "sitting",
    setting: "garden",
    composition: "central cat",
    continuityNotes: [],
  };
  return {
    articleSummary: "A sitting cat",
    audience: { ageBand: "6–9", englishLevel: "beginner" },
    styleBible: {
      medium: "watercolor",
      palette: ["green"],
      lighting: "soft",
      compositionRules: [],
      forbiddenElements: [],
    },
    characterBible: character
      ? [
          {
            id: "cat",
            name: "Cat",
            visualDescription: "orange cat",
            clothing: "no clothes",
            continuityRules: [],
          },
        ]
      : [],
    coverBrief: scene,
    coverAltText: "A cat",
    paragraphs: [
      {
        paragraphId,
        idx: 0,
        required: true,
        skipReason: null,
        scene,
        altText: "A sitting cat",
        teachingTargets: [
          {
            word: "cat",
            normalizedWord: "cat",
            reason: "animal",
            visualObject: "cat",
          },
        ],
      },
    ],
  };
}
const post = (path: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method: "POST", url: path, payload: /\/slots\/\d+\/(plan|generate)$/.test(path) && !payload.idempotencyKey ? {...payload,idempotencyKey:randomUUID()} : payload });
const base = () => `/articles/${articleId}/illustration-runs`;
async function createRun() {
  const q = await post(`/articles/${articleId}/illustration-estimates`, {
    modelId: catalog.models[0].id,
    scope: { kind: "all" },
  });
  expect(q.statusCode).toBe(200);
  const body = {
    estimateId: q.json().estimateId,
    idempotencyKey: randomUUID(),
  };
  const actor = Number((await pool.query("SELECT id FROM users WHERE email='admin@example.com'")).rows[0].id);
  const run = await createVisualRun(pool,catalog,articleId,actor,body.estimateId,body.idempotencyKey,1);
  return { id: Number(run.id), body, quote: q.json() };
}
const detail = async (id: number) =>
  (await app.inject(`${base()}/${id}`)).json();
async function approve(id: number) {
  const d = await detail(id);
  for (const s of d.slots)
    for (const c of s.candidates)
      if (c.status === "ready") {
        const r = await post(`${base()}/${id}/candidates/${c.id}/review`, {
          decision: "approved",
          altText: c.alt_text,
          teachingTargets: c.teaching_targets.map((t: any) => ({
            ...t,
            anchor: { x: 0.5, y: 0.5 },
            confidence: 1,
            placementSource: "manual",
          })),
          confirmed: true,
        });
        expect(r.statusCode, r.body).toBe(200);
      }
}
function deps(character = false) {
  const generate = vi
    .fn()
    .mockResolvedValue({ bytes: imageBytes, mimeType: "image/png" });
  return {
    pool,
    storage: new LocalImageStorage(dir),
    planner: { plan: vi.fn().mockResolvedValue({ value: plan(character) }) },
    adapters: { "openai-images-v1": { generate } },
    generate,
  };
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "el-illustrations-test-"));
  imageBytes = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  const illustrations = {
    catalog,
    imageDir: dir,
    availableModelIds: async () => catalog.models.map((m) => m.id),
  };
  app = buildApp({ pool, config: adminConfig, illustrations });
  reader = buildApp({
    pool,
    config: { ...adminConfig, devUserEmail: "reader@example.com" },
    illustrations,
  });
});
afterAll(async () => {
  await app.close();
  await reader.close();
  await pool.end();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE users,articles,illustration_assets,illustration_cleanup_jobs RESTART IDENTITY CASCADE",
  );
  await app.inject("/me");
  articleId = Number(
    (
      await pool.query(
        "INSERT INTO articles(title,status) VALUES('Cat','done') RETURNING id",
      )
    ).rows[0].id,
  );
  paragraphId = Number(
    (
      await pool.query(
        "INSERT INTO paragraphs(article_id,idx,text,status) VALUES($1,0,'The cat sits.','done') RETURNING id",
        [articleId],
      )
    ).rows[0].id,
  );
});
describe("AI visual lifecycle (mock providers, isolated test DB)", () => {
  it("requires admin, binds quotes and makes duplicate creation idempotent", async () => {
    expect((await reader.inject("/image-models")).statusCode).toBe(403);
    const r = await createRun();
    const duplicate = await post(base(), r.body);
    expect(Number(duplicate.json().run.id)).toBe(r.id);
    expect(
      (await post(base(), { ...r.body, idempotencyKey: randomUUID() }))
        .statusCode,
    ).toBe(409);
    expect((await detail(r.id)).slots).toHaveLength(2);
    expect(
      (await pool.query("SELECT count(*)::int n FROM jobs")).rows[0].n,
    ).toBe(0);
    expect(
      (await pool.query("SELECT status FROM articles WHERE id=$1", [articleId]))
        .rows[0].status,
    ).toBe("done");
    const q = await post(`/articles/${articleId}/illustration-estimates`, {
      modelId: catalog.models[0].id,
      scope: { kind: "all" },
    });
    await pool.query("UPDATE articles SET title='Changed' WHERE id=$1", [
      articleId,
    ]);
    expect(
      (
        await post(base(), {
          estimateId: q.json().estimateId,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("generates, requires review, publishes atomically, and protects draft image files", async () => {
    const r = await createRun();
    const d = deps();
    for (let i = 0; i < 3; i++) expect(await processImageJob(d)).toBe(true);
    expect(d.generate).toHaveBeenCalledTimes(2);
    const v = await detail(r.id);
    expect(v.run.status).toBe("review");
    const url = v.slots[0].candidates[0].url;
    expect((await reader.inject(url)).statusCode).toBe(404);
    expect((await app.inject(url)).statusCode).toBe(200);
    expect((await post(`${base()}/${r.id}/publish`)).statusCode).toBe(409);
    expect(
      (await reader.inject(`/articles/${articleId}`)).json().article.cover,
    ).toBeNull();
    await approve(r.id);
    expect((await post(`${base()}/${r.id}/publish`)).statusCode).toBe(200);
    expect((await reader.inject(url)).statusCode).toBe(200);
    const published = (await reader.inject(`/articles/${articleId}`)).json();
    expect(published.article.cover.revision).toBe(1);
    expect(published.paragraphs[0].illustration.teachingTargets[0].word).toBe(
      "cat",
    );
    expect(JSON.stringify(published)).not.toContain("prompt_json");
    const next = await createRun();
    expect(
      (await reader.inject(`/articles/${articleId}`)).json().article.cover
        .revision,
    ).toBe(1);
    expect(
      (await app.inject({ method: "DELETE", url: `${base()}/${r.id}` }))
        .statusCode,
    ).toBe(409);
    await post(`${base()}/${next.id}/cancel`);
    expect(
      (await reader.inject(`/articles/${articleId}`)).json().article.cover
        .revision,
    ).toBe(1);
  });
  it("waits for character reference approval before sending body image requests", async () => {
    const r = await createRun();
    const d = deps(true);
    await processImageJob(d);
    await processImageJob(d);
    expect(await processImageJob(d)).toBe(false);
    expect(d.generate).toHaveBeenCalledTimes(1);
    expect((await detail(r.id)).run.status).toBe("waiting_reference_review");
    await approve(r.id);
    await processImageJob(d);
    expect(d.generate.mock.calls[1][1].references).toHaveLength(1);
  });
  it("retains uncertain charges and never retries after network loss or stale sending", async () => {
    const r = await createRun();
    const d = deps();
    await processImageJob(d);
    d.generate.mockRejectedValue(new ImageProviderError(0, true));
    await processImageJob(d);
    const v = await detail(r.id);
    expect(
      v.attempts.some(
        (a: any) => a.state === "uncertain" && a.billing_status === "unknown",
      ),
    ).toBe(true);
    const calls = d.generate.mock.calls.length;
    await processImageJob(d);
    await processImageJob(d);
    expect(d.generate.mock.calls.length).toBe(calls + 1); // Other slot only; neither uncertain request repeats.
    const s = (await detail(r.id)).slots[0];
    expect(
      (await post(`${base()}/${r.id}/slots/${s.id}/regenerate`)).statusCode,
    ).toBe(409);
    await pool.query(
      "UPDATE illustration_jobs SET status='processing',updated_at=now()-interval '11 minutes' WHERE run_id=$1",
      [r.id],
    );
    await pool.query(
      "UPDATE illustration_attempts SET state='sending' WHERE run_id=$1",
      [r.id],
    );
    await recoverImageJobs(pool);
    expect(
      (
        await pool.query(
          "SELECT DISTINCT state FROM illustration_attempts WHERE run_id=$1",
          [r.id],
        )
      ).rows,
    ).toEqual([{ state: "uncertain" }]);
  });
  it("concurrent workers cannot reserve beyond the run budget", async () => {
    const r = await createRun();
    const d = deps();
    await processImageJob(d);
    const planned = await detail(r.id);
    const oneImageBudget = Math.max(
      ...planned.slots.map((s: any) =>
        estimateImageCost(
          catalog.models[0],
          catalog.pricing[0],
          s.kind,
          Buffer.byteLength(s.candidates[0].prompt_json.prompt),
          false,
        ),
      ),
    );
    await pool.query(
      "UPDATE article_visual_runs SET max_cost_usd_micros=reserved_cost_usd_micros+$2 WHERE id=$1",
      [r.id, oneImageBudget],
    );
    await Promise.all([processImageJob(d), processImageJob(d)]);
    expect(d.generate).toHaveBeenCalledTimes(1);
    const v = await detail(r.id);
    expect(Number(v.run.reserved_cost_usd_micros)).toBeLessThanOrEqual(
      Number(v.run.max_cost_usd_micros),
    );
  });
  it("does not schedule image calls after an invalid whole-article plan", async () => {
    const r = await createRun();
    const d = deps();
    d.planner.plan.mockResolvedValue({ value: null });
    await processImageJob(d);
    expect(d.generate).not.toHaveBeenCalled();
    const v = await detail(r.id);
    expect(v.attempts[0].state).toBe("failed");
    expect(v.attempts[0].error).toContain("規劃格式不符：root");
    expect(v.slots.every((s: any) => s.candidates.length === 0)).toBe(true);
    expect(await processImageJob(d)).toBe(false); // Planner retry respects backoff.
  });
  it("dismisses displayed failures while preserving attempts and showing later failures", async () => {
    const r = await createRun();
    const d = deps();
    d.planner.plan.mockResolvedValue({ value: null });
    await processImageJob(d);
    const first = await detail(r.id);
    const firstFailure = first.attempts.find((attempt: any) => attempt.state === "failed");
    expect(firstFailure?.error).toBeTruthy();
    expect((await reader.inject({ method: "POST", url: `${base()}/${r.id}/dismiss-failures` })).statusCode).toBe(403);
    const dismissed = await post(`${base()}/${r.id}/dismiss-failures`);
    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json().dismissedFailedAttemptId).toBe(String(firstFailure.id));
    const afterDismissal = await detail(r.id);
    expect(afterDismissal.dismissedFailedAttemptId).toBe(String(firstFailure.id));
    expect(afterDismissal.attempts[0].error).toBe(firstFailure.error);

    await pool.query("UPDATE illustration_jobs SET available_at=now()-interval '1 second' WHERE run_id=$1 AND status='pending'", [r.id]);
    await processImageJob(d);
    const later = await detail(r.id);
    expect(later.attempts.filter((attempt: any) => attempt.state === "failed")).toHaveLength(2);
    expect(BigInt(later.attempts[1].id)).toBeGreaterThan(BigInt(later.dismissedFailedAttemptId));
  });
  it("repairs planner word normalization and duplicates before storing image candidates", async () => {
    const r = await createRun();
    const d = deps();
    const response = plan();
    const target = response.paragraphs[0].teachingTargets[0];
    response.paragraphs[0].teachingTargets = [
      { ...target, normalizedWord: "CATS" },
      { ...target, normalizedWord: "wrong", reason: "duplicate reason" },
    ];
    d.planner.plan.mockResolvedValue({ value: response });
    for (let i = 0; i < 3; i++) expect(await processImageJob(d)).toBe(true);
    expect(d.planner.plan).toHaveBeenCalledTimes(1);
    expect(d.generate).toHaveBeenCalledTimes(2);
    const v = await detail(r.id);
    expect(v.run.status).toBe("review");
    expect(v.run.plan_json.paragraphs[0].teachingTargets).toEqual([target]);
    const paragraph = v.slots.find((s: any) => s.kind === "paragraph");
    expect(paragraph.candidates[0].teaching_targets).toEqual([target]);
    expect(v.attempts.every((a: any) => a.state === "succeeded")).toBe(true);
  });
  it("adds a manual source word to an existing unlabeled image and publishes it without regeneration", async () => {
    const r = await createRun();
    const d = deps();
    const response = plan();
    response.paragraphs[0].teachingTargets = [];
    d.planner.plan.mockResolvedValue({ value: response });
    for (let i = 0; i < 3; i++) expect(await processImageJob(d)).toBe(true);
    const v = await detail(r.id);
    const candidate = v.slots.find((s: any) => s.kind === "paragraph").candidates[0];
    expect(candidate.teaching_targets).toEqual([]);
    const target = {
      word: "cat", normalizedWord: "cat", reason: "辨認原文中的貓",
      visualObject: "坐在草地上的貓", anchor: { x: 0.25, y: 0.75 },
      confidence: 1, placementSource: "manual",
    };
    const reviewPath = `${base()}/${r.id}/candidates/${candidate.id}/review`;
    const review = {
      decision: "approved", altText: candidate.alt_text,
      teachingTargets: [target], confirmed: true,
    };
    const result = await post(reviewPath, review);
    expect(result.statusCode, result.body).toBe(200);
    const updated = await detail(r.id);
    const saved = updated.slots.find((s: any) => s.kind === "paragraph").candidates[0];
    expect(saved.teaching_targets).toEqual([target]);
    expect(saved.asset_id).toBe(candidate.asset_id);
    expect(saved.url).toBe(candidate.url);
    await approve(r.id);
    expect((await post(`${base()}/${r.id}/publish`)).statusCode).toBe(200);
    const published = (await reader.inject(`/articles/${articleId}`)).json();
    expect(published.paragraphs[0].illustration.teachingTargets).toEqual([target]);
    expect((await post(reviewPath, review)).statusCode).toBe(409);
    expect(await processImageJob(d)).toBe(false);
    expect(d.planner.plan).toHaveBeenCalledTimes(1);
    expect(d.generate).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("continues images after skipping invalid teaching words (keep valid: %s)", async (keepValid) => {
    const r = await createRun();
    const d = deps();
    const response = plan();
    const target = response.paragraphs[0].teachingTargets[0];
    response.paragraphs[0].teachingTargets = [
      ...(keepValid ? [target] : []),
      { ...target, word: "window box" },
      { ...target, word: "cats" },
    ];
    d.planner.plan.mockResolvedValue({ value: response });
    for (let i = 0; i < 3; i++) expect(await processImageJob(d)).toBe(true);
    expect(d.planner.plan).toHaveBeenCalledTimes(1);
    expect(d.generate).toHaveBeenCalledTimes(2);
    const v = await detail(r.id);
    expect(v.run.status).toBe("review");
    expect(v.attempts.every((a: any) => a.state === "succeeded" && a.error === null)).toBe(true);
    const expected = keepValid ? [target] : [];
    expect(v.run.plan_json.paragraphs[0].teachingTargets).toEqual(expected);
    expect(v.slots.find((s: any) => s.kind === "paragraph").candidates[0].teaching_targets).toEqual(expected);
    expect(v.run.plan_json.validationWarnings).toHaveLength(2);
    expect(v.run.plan_json.validationWarnings[0]).toContain(String(paragraphId));
    expect(v.run.plan_json.validationWarnings[0]).toContain('"window box"');
    expect(v.run.plan_json.validationWarnings[1]).toContain('"cats"');
  });
  it("cleans assets via outbox when an article is deleted", async () => {
    const r = await createRun();
    const d = deps();
    for (let i = 0; i < 3; i++) await processImageJob(d);
    const files = (
      await pool.query("SELECT object_key FROM illustration_asset_files")
    ).rows;
    expect(files).toHaveLength(7);
    expect(
      (await app.inject({ method: "DELETE", url: `/articles/${articleId}` }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM illustration_cleanup_jobs",
        )
      ).rows[0].n,
    ).toBe(7);
    await cleanupImageFiles(pool, d.storage);
    for (const f of files)
      await expect(d.storage.read(f.object_key)).rejects.toThrow();
  });
});

describe("逐步圖片製作", () => {
  it("舊版仍有待處理工作時拒絕轉換；工作結束後保留空白 Prompt", async () => {
    const legacy = await createRun();
    await expect(pool.query("SELECT import_legacy_illustration_runs()"))
      .rejects.toThrow("Legacy illustration jobs are still active");
    expect((await detail(legacy.id)).run.workflow_version).toBe(1);
    await pool.query("UPDATE illustration_jobs SET status='failed' WHERE run_id=$1", [legacy.id]);
    expect((await pool.query("SELECT import_legacy_illustration_runs() AS count")).rows[0].count).toBe(1);
    const view = await detail(legacy.id);
    expect(view.run.workflow_version).toBe(2);
    expect(view.run.legacy_imported).toBe(true);
    expect(view.slots.map((slot: any) => slot.kind).sort()).toEqual(["cover", "paragraph", "reference"]);
    expect(view.slots.every((slot: any) => slot.prompt_draft === null)).toBe(true);
    expect(view.slots.find((slot: any) => slot.kind === "reference").required).toBe(false);
    expect((await pool.query("SELECT import_legacy_illustration_runs() AS count")).rows[0].count).toBe(0);
  });
  it("舊發布版無參考圖時保留空白，繼承封面並直接補略過段落", async () => {
    const legacy = await createRun();
    const d = deps();
    const legacyPlan = plan();
    legacyPlan.paragraphs[0].required = false;
    legacyPlan.paragraphs[0].skipReason = "no image needed";
    legacyPlan.paragraphs[0].scene = null;
    d.planner.plan.mockResolvedValueOnce({value:legacyPlan});
    expect(await processImageJob(d)).toBe(true);
    expect(await processImageJob(d)).toBe(true);
    await approve(legacy.id);
    expect((await post(`${base()}/${legacy.id}/publish`)).statusCode).toBe(200);
    const before = await detail(legacy.id);
    const legacyCover = before.slots.find((s:any)=>s.kind === "cover").candidates[0].asset_id;
    const originalPrompt = before.slots.find((s:any)=>s.kind === "cover").candidates[0].prompt_json.prompt;
    const coverSlot = before.slots.find((s:any)=>s.kind === "cover");
    const teachingTargets = [{word:"crisp",normalizedWord:"crisp",reason:"Autumn detail",visualObject:"leaf",placementSource:"manual"}];
    await pool.query("UPDATE illustration_candidates SET teaching_targets=$2::jsonb WHERE id=$1", [coverSlot.selected_candidate_id,JSON.stringify(teachingTargets)]);
    await pool.query(
      `INSERT INTO illustration_candidates(slot_id,candidate_no,status,prompt_json,model_snapshot,asset_id,alt_text)
       SELECT slot_id,2,'rejected',jsonb_set(prompt_json,'{prompt}',to_jsonb('Unused later prompt'::text)),model_snapshot,asset_id,alt_text
       FROM illustration_candidates WHERE id=$1`,
      [coverSlot.selected_candidate_id],
    );
    expect((await pool.query("SELECT import_legacy_illustration_runs() AS count")).rows[0].count).toBe(1);
    const imported = await detail(legacy.id);
    expect(imported.run.status).toBe("published");
    expect(imported.run.legacy_imported).toBe(true);
    expect(imported.slots.find((s:any)=>s.kind === "cover").prompt_draft).toBe(originalPrompt);
    expect(imported.slots.find((s:any)=>s.kind === "reference").prompt_draft).toBeNull();
    expect((await pool.query("SELECT run_id FROM article_visual_publications WHERE article_id=$1", [articleId])).rows[0].run_id).toBe(String(legacy.id));
    const estimate = await post(`/articles/${articleId}/illustration-estimates`,{modelId:catalog.models[1].id,scope:{kind:"all"}});
    const fork = await post(`${base()}/${legacy.id}/fork`,{estimateId:estimate.json().estimateId,idempotencyKey:randomUUID()});
    expect(fork.statusCode,fork.body).toBe(202);
    const forkId=Number(fork.json().run.id);
    let view=await detail(forkId);
    expect(view.run.workflow_version).toBe(2);
    expect(view.run.model_id).toBe(catalog.models[1].id);
    expect(view.run.visual_bible).toContain("watercolor");
    expect(view.slots.find((s:any)=>s.kind === "cover").candidates[0].asset_id).toBe(legacyCover);
    expect(view.slots.find((s:any)=>s.kind === "cover").candidates[0].teaching_targets).toEqual(teachingTargets);
    expect(view.slots.find((s:any)=>s.kind === "cover").candidates[0].model_snapshot.id).toBe(catalog.models[0].id);
    const ref=view.slots.find((s:any)=>s.kind === "reference");
    const para=view.slots.find((s:any)=>s.kind === "paragraph");
    expect(view.run.legacy_imported).toBe(true);
    expect(ref.prompt_status).toBe("empty");
    expect(ref.required).toBe(false);
    expect(ref.candidates).toHaveLength(0);
    expect(await processImageJob(d)).toBe(false);
    expect((await post(`${base()}/${forkId}/slots/${ref.id}/plan`)).statusCode).toBe(409);
    d.planner.plan.mockResolvedValue({value:{prompt:"Watercolor cat in the garden, no text",altText:"An orange cat in a garden",visualBible:""}});
    (d.adapters as Record<string,unknown>)[catalog.models[1].adapter]={generate:d.generate};
    expect((await post(`${base()}/${forkId}/slots/${para.id}/plan`)).statusCode).toBe(200);
    expect(await processImageJob(d)).toBe(true);
    view=await detail(forkId);
    const paraDraft=view.slots.find((s:any)=>s.kind === "paragraph");
    expect((await post(`${base()}/${forkId}/slots/${para.id}/generate`,{prompt:paraDraft.prompt_draft,revision:paraDraft.prompt_revision})).statusCode).toBe(200);
    expect(await processImageJob(d)).toBe(true);
    await approve(forkId);
    expect((await post(`${base()}/${forkId}/publish`)).statusCode).toBe(200);
    expect(d.generate).toHaveBeenCalledTimes(2);
  });
  it("結果不明時標示部分失敗，重試須承認可能重複計費", async () => {
    const estimate = await post(`/articles/${articleId}/illustration-estimates`,{modelId:catalog.models[0].id,scope:{kind:"all"}});
    const created = await post(base(),{estimateId:estimate.json().estimateId,idempotencyKey:randomUUID()});
    const runId = Number(created.json().run.id);
    const reference = (await detail(runId)).slots.find((s:any)=>s.kind === "reference");
    const d = deps();
    d.planner.plan.mockResolvedValue({value:{prompt:"A garden reference, no text",altText:"Garden",visualBible:"Garden"}});
    expect(await processImageJob(d)).toBe(true);
    d.generate.mockRejectedValueOnce(new ImageProviderError(0,true));
    const draft = (await detail(runId)).slots.find((s:any)=>s.kind === "reference");
    expect((await post(`${base()}/${runId}/slots/${reference.id}/generate`,{prompt:draft.prompt_draft,revision:draft.prompt_revision})).statusCode).toBe(200);
    expect(await processImageJob(d)).toBe(true);
    expect((await detail(runId)).run.status).toBe("partial_failed");
    expect((await post(`${base()}/${runId}/slots/${reference.id}/generate`,{prompt:draft.prompt_draft,revision:draft.prompt_revision})).statusCode).toBe(409);
    expect((await post(`${base()}/${runId}/slots/${reference.id}/generate`,{prompt:draft.prompt_draft,revision:draft.prompt_revision,acceptUnknownCharge:true})).statusCode).toBe(200);
  });
  it("只在按下生成後生圖、略過可發布，fork 繼承圖片後補段落", async () => {
    const estimate = await post(`/articles/${articleId}/illustration-estimates`, {
      modelId: catalog.models[0].id, scope: { kind: "all" },
    });
    expect(estimate.statusCode).toBe(200);
    const created = await post(base(), { estimateId: estimate.json().estimateId, idempotencyKey: randomUUID() });
    expect(created.statusCode,created.body).toBe(202);
    const runId = Number(created.json().run.id);
    let view = await detail(runId);
    expect(view.run.workflow_version).toBe(2);
    const reference = view.slots.find((s: any) => s.kind === "reference");
    const cover = view.slots.find((s: any) => s.kind === "cover");
    const paragraph = view.slots.find((s: any) => s.kind === "paragraph");
    expect(view.slots.flatMap((s: any) => s.candidates)).toHaveLength(0);
    expect((await post(`${base()}/${runId}/slots/${cover.id}/plan`)).statusCode).toBe(409);
    const d = deps();
    d.planner.plan.mockResolvedValue({ value: { prompt: "Draw a consistent green garden scene, no text", altText: "Garden style sheet", visualBible: "Green garden, watercolor, orange cat" } });
    expect(await processImageJob(d)).toBe(true);
    expect(d.generate).not.toHaveBeenCalled();
    view = await detail(runId);
    expect(view.slots.find((s: any) => s.kind === "reference").prompt_draft).toContain("green garden");
    expect(view.slots.find((s: any) => s.kind === "reference").prompt_alt_text).toBe("Garden style sheet");
    expect((await app.inject({method:"PUT",url:`${base()}/${runId}/visual-bible`,payload:{visualBible:"Blue garden, watercolor, orange cat"}})).statusCode).toBe(200);
    const quote = await post(`${base()}/${runId}/slots/${reference.id}/quote`,{prompt:"Draw a blue garden reference"});
    expect(quote.json().generateCostUsdMicros).toBeGreaterThan(0);
    const saved = await app.inject({method:"PUT",url:`${base()}/${runId}/slots/${reference.id}/prompt`,payload:{prompt:"Draw a blue garden reference",revision:1}});
    expect(saved.statusCode,saved.body).toBe(200);
    const refGenerateKey=randomUUID();
    const generated=await post(`${base()}/${runId}/slots/${reference.id}/generate`,{prompt:"Draw a blue garden reference",revision:saved.json().revision,idempotencyKey:refGenerateKey});
    expect(generated.statusCode).toBe(200);
    const repeated=await post(`${base()}/${runId}/slots/${reference.id}/generate`,{prompt:"Draw a blue garden reference",revision:saved.json().revision,idempotencyKey:refGenerateKey});
    expect(repeated.json().candidateId).toBe(generated.json().candidateId);
    expect((await detail(runId)).slots.find((s:any)=>s.kind === "reference").candidates).toHaveLength(1);
    expect(await processImageJob(d)).toBe(true);
    expect(d.generate).toHaveBeenCalledTimes(1);
    expect((await detail(runId)).slots.find((s:any)=>s.kind === "reference").candidates[0].prompt_json.prompt).toBe("Draw a blue garden reference");
    expect((await detail(runId)).slots.find((s:any)=>s.kind === "reference").candidates[0].alt_text).toBe("Garden style sheet");
    await approve(runId);
    view = await detail(runId);
    expect(view.run.visual_bible).toContain("Blue garden");
    expect((await post(`${base()}/${runId}/slots/${reference.id}/plan`)).statusCode).toBe(409);
    const coverPlanKey=randomUUID();
    const planned=await post(`${base()}/${runId}/slots/${cover.id}/plan`,{idempotencyKey:coverPlanKey});
    expect(planned.statusCode).toBe(200);
    expect((await post(`${base()}/${runId}/slots/${cover.id}/plan`,{idempotencyKey:coverPlanKey})).json().jobId).toBe(planned.json().jobId);
    expect(await processImageJob(d)).toBe(true);
    expect(d.planner.plan.mock.calls.at(-1)?.[1]).toContain("Blue garden, watercolor, orange cat");
    view = await detail(runId);
    const coverDraft = view.slots.find((s: any) => s.kind === "cover");
    expect(coverDraft.prompt_draft).toContain("green garden");
    expect(coverDraft.prompt_alt_text).toBe("Garden style sheet");
    expect((await post(`${base()}/${runId}/slots/${cover.id}/generate`,{prompt:coverDraft.prompt_draft,revision:coverDraft.prompt_revision})).statusCode).toBe(200);
    expect(await processImageJob(d)).toBe(true);
    await approve(runId);
    expect((await app.inject({method:"POST",url:`${base()}/${runId}/slots/${paragraph.id}/skip`})).statusCode).toBe(200);
    view = await detail(runId);
    expect(view.run.status).toBe("review");
    expect((await post(`${base()}/${runId}/publish`)).statusCode).toBe(200);
    const originalCoverAsset = (await detail(runId)).slots.find((s: any) => s.kind === "cover").candidates[0].asset_id;

    const forkEstimate = await post(`/articles/${articleId}/illustration-estimates`,{modelId:catalog.models[0].id,scope:{kind:"all"}});
    const forked = await post(`${base()}/${runId}/fork`,{estimateId:forkEstimate.json().estimateId,idempotencyKey:randomUUID()});
    expect(forked.statusCode,forked.body).toBe(202);
    const forkId = Number(forked.json().run.id);
    view = await detail(forkId);
    expect(view.run.actual_cost_usd_micros).toBe("0");
    expect(view.slots.find((s: any) => s.kind === "cover").candidates[0].asset_id).toBe(originalCoverAsset);
    const missing = view.slots.find((s: any) => s.kind === "paragraph");
    expect(missing.required).toBe(false);
    expect((await post(`${base()}/${forkId}/slots/${missing.id}/plan`)).statusCode).toBe(200);
    expect(await processImageJob(d)).toBe(true);
    view = await detail(forkId);
    const draft = view.slots.find((s: any) => s.kind === "paragraph");
    expect((await post(`${base()}/${forkId}/slots/${missing.id}/generate`,{prompt:draft.prompt_draft,revision:draft.prompt_revision})).statusCode).toBe(200);
    expect(await processImageJob(d)).toBe(true);
    await approve(forkId);
    expect((await detail(forkId)).run.status).toBe("review");
    expect((await post(`${base()}/${forkId}/publish`)).statusCode).toBe(200);
    expect((await detail(runId)).run.status).toBe("superseded");
    expect(d.generate).toHaveBeenCalledTimes(3);
  });
});
