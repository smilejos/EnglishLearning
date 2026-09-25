import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { regenerateVisualSlot, skipVisualSlot } from "@el/shared";
import { requireAdmin } from "../auth";
import {
  createVisualEstimate,
  createVisualRun,
  cancelVisualRun,
  publishVisualRun,
  reviewVisualCandidate,
  deleteVisualRun,
  listVisualRuns,
  visualRunDetail,
  GenerationScopeSchema,
  ReviewSchema,
  type DbPool,
  type ImageCatalog,
  VisualError,
} from "@el/shared";

export interface IllustrationDeps {
  catalog: ImageCatalog;
  imageDir: string;
  availableModelIds: () => Promise<string[]>;
  resolveCatalog?: () => Promise<ImageCatalog>;
}
export function registerIllustrationRoutes(
  app: FastifyInstance,
  pool: DbPool,
  deps: IllustrationDeps,
) {
  const base = "/articles/:id/illustration-runs";
  function ids(params: unknown) {
    const input = params as Record<string, string>;
    const result = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, Number(v)]),
    );
    if (Object.values(result).some((v) => !Number.isSafeInteger(v) || v <= 0))
      throw new VisualError("invalid id", 400);
    return result;
  }
  const admin = { preHandler: requireAdmin };
  const availableCatalog = async () => {
    const ids = await deps.availableModelIds();
    const selected = deps.resolveCatalog ? await deps.resolveCatalog() : deps.catalog;
    return {
      ...selected,
      models: selected.models.filter((m) => ids.includes(m.id)),
    };
  };
  app.get("/image-models", admin, async () => {
    const catalog = await availableCatalog();
    return {
      defaultModelId: catalog.defaultModelId,
      models: catalog.models
        .filter((m) => m.enabled)
        .map((m) => ({
          id: m.id,
          label: m.label,
          provider: m.provider,
          profiles: m.profiles,
          lastVerifiedAt: catalog.pricing.find(
            (p) => p.id === m.pricingProfileId,
          )!.lastVerifiedAt,
        })),
    };
  });
  app.post("/articles/:id/illustration-estimates", admin, async (request) => {
    const body = z
      .object({
        modelId: z.string(),
        scope: GenerationScopeSchema,
        maxCostUsdMicros: z.number().int().positive().optional(),
      })
      .strict()
      .safeParse(request.body);
    if (!body.success)
      throw new VisualError(
        "invalid estimate request; Phase 1 supports scope=all",
        400,
      );
    const catalog = await availableCatalog();
    if (deps.resolveCatalog && body.data.modelId !== catalog.defaultModelId)
      throw new VisualError("image model changed; request a new estimate", 409);
    return createVisualEstimate(
      pool,
      catalog,
      ids(request.params).id,
      request.user!.id,
      body.data.modelId,
      body.data.maxCostUsdMicros,
    );
  });
  app.post(base, admin, async (request, reply) => {
    const body = z
      .object({
        estimateId: z.string().uuid(),
        idempotencyKey: z.string().uuid(),
      })
      .strict()
      .safeParse(request.body);
    if (!body.success) throw new VisualError("invalid run request", 400);
    const run = await createVisualRun(
      pool,
      await availableCatalog(),
      ids(request.params).id,
      request.user!.id,
      body.data.estimateId,
      body.data.idempotencyKey,
    );
    return reply.code(202).send({ run });
  });
  app.get(base, admin, async (request) => ({
    runs: await listVisualRuns(pool, ids(request.params).id),
  }));
  app.get(`${base}/:runId`, admin, async (request) => {
    const p = ids(request.params);
    return visualRunDetail(pool, p.id, p.runId);
  });
  for (const [action, fn] of Object.entries({
    cancel: cancelVisualRun,
    publish: publishVisualRun,
  })) {
    app.post(`${base}/:runId/${action}`, admin, async (request) => {
      const p = ids(request.params);
      await fn(pool, p.id, p.runId, request.user!.id);
      return { ok: true };
    });
  }
  app.post(
    `${base}/:runId/candidates/:candidateId/review`,
    admin,
    async (request) => {
      const p = ids(request.params);
      const body = ReviewSchema.safeParse(request.body);
      if (!body.success)
        throw new VisualError(
          "confirm image safety, alt text and word positions",
          400,
        );
      await reviewVisualCandidate(
        pool,
        p.id,
        p.runId,
        p.candidateId,
        request.user!.id,
        body.data,
      );
      return { ok: true };
    },
  );
  app.delete(`${base}/:runId`, admin, async (request) => {
    const p = ids(request.params);
    await deleteVisualRun(pool, p.id, p.runId, request.user!.id);
    return { ok: true };
  });
  app.post(
    `${base}/:runId/slots/:slotId/regenerate`,
    admin,
    async (request) => {
      const p = ids(request.params);
      const body = z
        .object({ acceptUnknownCharge: z.boolean().default(false) })
        .strict()
        .safeParse(request.body ?? {});
      if (!body.success) throw new VisualError("invalid retry request", 400);
      await regenerateVisualSlot(
        pool,
        p.id,
        p.runId,
        p.slotId,
        request.user!.id,
        body.data.acceptUnknownCharge,
      );
      return { ok: true };
    },
  );
  app.post(`${base}/:runId/slots/:slotId/skip`, admin, async (request) => {
    const p = ids(request.params);
    const body = z
      .object({ reason: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(request.body);
    if (!body.success) throw new VisualError("skip reason required", 400);
    await skipVisualSlot(
      pool,
      p.id,
      p.runId,
      p.slotId,
      request.user!.id,
      body.data.reason,
    );
    return { ok: true };
  });
  // Every file lookup checks application auth AND publication; a guessed draft URL is not sufficient.
  app.get<{ Params: { "*": string } }>("/images/*", async (request, reply) => {
    const key = request.params["*"];
    if (
      !/^[a-zA-Z0-9/_.-]+$/.test(key) ||
      key.split("/").some((p) => p === ".." || p === ".")
    )
      return reply.code(404).send();
    const file = (
      await pool.query(
        `SELECT f.* FROM illustration_asset_files f WHERE f.object_key=$1 AND ($2::boolean OR EXISTS (
      SELECT 1 FROM illustration_candidates c JOIN illustration_slots s ON s.selected_candidate_id=c.id
      JOIN article_visual_publications p ON p.run_id=s.run_id
      WHERE c.asset_id=f.asset_id AND c.status='approved' AND s.required AND s.kind!='reference'))`,
        [key, request.user!.role === "admin"],
      )
    ).rows[0];
    if (!file) return reply.code(404).send();
    const root = resolve(deps.imageDir);
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) return reply.code(404).send();
    reply
      .header("Cache-Control", "private, no-cache")
      .header("X-Content-Type-Options", "nosniff")
      .type(file.mime_type);
    return reply.send(createReadStream(path));
  });
}
