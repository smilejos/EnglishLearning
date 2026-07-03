// 分類（categories）與標籤（tags）的管理路由。
// 讀取開放給任何已驗證身分（前台篩選、後台挑選）；異動限 admin。
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listTags,
  getOrCreateTag,
  updateTag,
  deleteTag,
  renameTagKind,
  type DbPool,
} from "@el/shared";
import { requireAdmin } from "../auth";

function idParam(request: { params: unknown }): number {
  return Number((request.params as { id: string }).id);
}

export function registerTaxonomyRoutes(app: FastifyInstance, pool: DbPool): void {
  // ---- categories ----
  app.get("/categories", async () => ({ categories: await listCategories(pool) }));

  const CategoryBody = z.object({
    label: z.string().min(1),
    parentId: z.number().int().nullable().optional(),
    sortOrder: z.number().int().optional(),
  });

  app.post("/categories", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = CategoryBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }
    const category = await createCategory(pool, {
      label: parsed.data.label,
      parentId: parsed.data.parentId ?? null,
      sortOrder: parsed.data.sortOrder,
    });
    return reply.code(201).send({ category });
  });

  const CategoryPatch = z.object({
    label: z.string().min(1).optional(),
    sortOrder: z.number().int().optional(),
  });

  app.patch("/categories/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParam(request);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid id" });
    }
    const parsed = CategoryPatch.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const category = await updateCategory(pool, id, parsed.data);
    if (!category) return reply.code(404).send({ error: "category not found" });
    return { category };
  });

  app.delete("/categories/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParam(request);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid id" });
    }
    const ok = await deleteCategory(pool, id);
    if (!ok) return reply.code(404).send({ error: "category not found" });
    return { ok: true };
  });

  // ---- tags ----
  app.get("/tags", async () => ({ tags: await listTags(pool) }));

  const TagBody = z.object({
    kind: z.string().min(1),
    label: z.string().min(1),
  });

  app.post("/tags", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = TagBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const tag = await getOrCreateTag(pool, parsed.data.kind, parsed.data.label);
    return reply.code(201).send({ tag });
  });

  const TagPatch = z.object({
    kind: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
  });

  app.patch("/tags/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParam(request);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid id" });
    }
    const parsed = TagPatch.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const tag = await updateTag(pool, id, parsed.data);
    if (!tag) return reply.code(404).send({ error: "tag not found" });
    return { tag };
  });

  app.delete("/tags/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = idParam(request);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid id" });
    }
    const ok = await deleteTag(pool, id);
    if (!ok) return reply.code(404).send({ error: "tag not found" });
    return { ok: true };
  });

  // 整批改名某維度（kind）。
  const RenameKindBody = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
  });

  app.post("/tag-kinds/rename", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = RenameKindBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const updated = await renameTagKind(pool, parsed.data.from, parsed.data.to);
    return { updated };
  });
}
