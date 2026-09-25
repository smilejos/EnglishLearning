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
  app.inject({ method: "POST", url: path, payload });
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
  const response = await post(base(), body);
  expect(response.statusCode, response.body).toBe(202);
  return { id: Number(response.json().run.id), body, quote: q.json() };
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
