import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getScenarioRevision, importScenarioRevision, listScenarios, publishScenarioRevision, readScenarioAsset, scenarioDetail,
  ScenarioKeySchema, ScenarioContentSchema, ScenarioAssetSchema, ScenarioConflictError, ScenarioValidationError, type DbPool } from "@el/shared";
import { requireAdmin } from "../auth";
export interface ScenarioRouteDeps { imageDir: string; audioDir: string }
const Params = z.object({ key: ScenarioKeySchema, revision: z.coerce.number().int().positive().optional() });
const Empty = z.object({}).strict();
export function registerScenarioRoutes(app: FastifyInstance, pool: DbPool, roots?: ScenarioRouteDeps): void {
  // 媒體須先安全離線放進 volume；API 只驗證、建立草稿，不讀外部路徑或自動發布。
  app.post("/scenarios/import", { preHandler: requireAdmin }, async (request, reply) => {
    const body = z.object({ content: ScenarioContentSchema, media: z.object({ image: ScenarioAssetSchema, audio: ScenarioAssetSchema }).strict() }).strict().safeParse(request.body);
    if (!body.success || !Empty.safeParse(request.query).success) return reply.code(400).send({ error: "invalid scenario package" });
    if (!roots) return reply.code(503).send({ error: "scenario media unavailable" });
    try { return await importScenarioRevision(pool, body.data.content, body.data.media, roots); }
    catch (error) {
      request.log.error(error);
      return reply.code(error instanceof ScenarioConflictError ? 409 : error instanceof ScenarioValidationError ? 400 : 409).send({ error: "scenario import validation failed" });
    }
  });
  app.get("/scenarios", async (request, reply) => {
    const query = z.object({ includeDrafts: z.enum(["true", "false"]).optional() }).strict().safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid query" });
    if (query.data.includeDrafts === "true" && request.user?.role !== "admin") return reply.code(403).send({ error: "admin only" });
    return { scenarios: await listScenarios(pool, query.data.includeDrafts === "true") };
  });
  for (const url of ["/scenarios/:key", "/scenarios/:key/revisions/:revision"]) app.get(url, async (request, reply) => {
    const params = Params.safeParse(request.params);
    if (!params.success || !Empty.safeParse(request.query).success) return reply.code(400).send({ error: "invalid query" });
    const record = await getScenarioRevision(pool, params.data.key, params.data.revision, request.user?.role === "admin");
    return record ? scenarioDetail(record) : reply.code(404).send({ error: "scenario not found" });
  });
  app.get("/scenarios/:key/revisions/:revision/media/:kind", async (request, reply) => {
    const params = Params.extend({ revision: z.coerce.number().int().positive(), kind: z.enum(["image", "audio"]) }).safeParse(request.params);
    if (!params.success || !Empty.safeParse(request.query).success) return reply.code(400).send({ error: "invalid query" });
    const { key, revision, kind } = params.data;
    const record = await getScenarioRevision(pool, key, revision, request.user?.role === "admin");
    if (!record || !roots) return reply.code(404).send({ error: "media not found" });
    const asset = record.media[kind];
    let data: Buffer;
    try { data = await readScenarioAsset(kind === "image" ? roots.imageDir : roots.audioDir, asset); }
    catch { return reply.code(404).send({ error: "media not found" }); }
    reply.header("Cache-Control", "private, no-store").header("Content-Type", asset.contentType).header("X-Content-Type-Options", "nosniff").header("Accept-Ranges", "bytes");
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const suffix = match && !match[1] && match[2] ? Number(match[2]) : null;
      const start = suffix === null ? Number(match?.[1]) : Math.max(0, data.length - suffix);
      const end = suffix === null && match?.[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= data.length || suffix === 0) return reply.code(416).header("Content-Range", `bytes */${data.length}`).send();
      return reply.code(206).header("Content-Range", `bytes ${start}-${end}/${data.length}`).send(data.subarray(start, end + 1));
    }
    return reply.send(data);
  });
  app.post("/scenarios/:key/revisions/:revision/publish", { preHandler: requireAdmin }, async (request, reply) => {
    const params = Params.extend({ revision: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success || !Empty.safeParse(request.query).success || (request.body !== undefined && !Empty.safeParse(request.body).success)) return reply.code(400).send({ error: "invalid request" });
    if (!roots) return reply.code(503).send({ error: "scenario media unavailable" });
    try {
      const record = await publishScenarioRevision(pool, params.data.key, params.data.revision, roots);
      return record ? scenarioDetail(record) : reply.code(404).send({ error: "scenario not found" });
    } catch (error) {
      request.log.error(error);
      if (error instanceof ScenarioValidationError || error instanceof Error) return reply.code(409).send({ error: "scenario publication validation failed" });
      throw error;
    }
  });
}
