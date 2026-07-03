// 文章路由：上傳（admin only）。查詢／重試於後續任務加入同檔。
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  withTransaction,
  createArticle,
  createParagraph,
  createJob,
  listArticlesWithMeta,
  getArticleById,
  listParagraphsByArticle,
  setArticleStatus,
  resetFailedParagraphsByArticle,
  resetFailedJobsByArticle,
  deleteArticle,
  listWordIdsByArticle,
  getOrCreateCategoryByLabel,
  getOrCreateTag,
  addTagToArticle,
  clearArticleTags,
  updateArticleMeta,
  getCategoryById,
  listTagsByArticle,
  type DbPool,
} from "@el/shared";
import { requireAdmin } from "../auth";
import { splitParagraphs } from "../articleText";
import { removeAudioDir } from "../audio";

const CreateArticleBody = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  materialType: z.enum(["school", "extracurricular"]).optional(),
  grade: z.string().optional(),
  unit: z.string().optional(),
  week: z.number().int().optional(),
  page: z.number().int().optional(),
  categoryId: z.number().int().optional(),
  // 以 label 字串指派分類（不存在則建立頂層分類）。
  category: z.string().optional(),
  level: z.string().optional(),
  // 標籤：每項為 "label" 或 "kind:label"（未帶 kind 預設「主題」）。
  tags: z.array(z.string()).optional(),
});

const DEFAULT_TAG_KIND = "主題";

/** 解析標籤字串為 (kind, label)；空白會被去除。 */
function parseTag(raw: string): { kind: string; label: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const idx = s.indexOf(":");
  if (idx > 0) {
    const kind = s.slice(0, idx).trim();
    const label = s.slice(idx + 1).trim();
    if (kind && label) return { kind, label };
  }
  return { kind: DEFAULT_TAG_KIND, label: s };
}

export function registerArticleRoutes(
  app: FastifyInstance,
  pool: DbPool,
  audioDir?: string,
): void {
  // 上傳文章：切段落、寫 article + paragraphs(pending) + 每段一筆 job，回 202 + id。
  app.post(
    "/articles",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = CreateArticleBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "invalid body", details: parsed.error.flatten() });
      }
      const body = parsed.data;
      const paragraphs = splitParagraphs(body.text);
      if (paragraphs.length === 0) {
        return reply.code(400).send({ error: "no paragraphs in text" });
      }

      const id = await withTransaction(pool, async (tx) => {
        // 分類：優先用 categoryId，否則以 category label 取得/建立。
        let categoryId = body.categoryId ?? null;
        if (categoryId == null && body.category?.trim()) {
          categoryId = (
            await getOrCreateCategoryByLabel(tx, body.category.trim())
          ).id;
        }

        const article = await createArticle(tx, {
          title: body.title,
          materialType: body.materialType,
          grade: body.grade ?? null,
          unit: body.unit ?? null,
          week: body.week ?? null,
          page: body.page ?? null,
          categoryId,
          level: body.level ?? null,
          createdBy: request.user!.id,
        });

        // 標籤：解析後取得/建立並掛到文章。
        for (const raw of body.tags ?? []) {
          const parsed = parseTag(raw);
          if (!parsed) continue;
          const tag = await getOrCreateTag(tx, parsed.kind, parsed.label);
          await addTagToArticle(tx, article.id, tag.id);
        }

        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = await createParagraph(tx, {
            articleId: article.id,
            idx: i,
            text: paragraphs[i],
          });
          await createJob(tx, article.id, paragraph.id);
        }
        return article.id;
      });

      // 202 Accepted：文章與段落已建立、jobs 待 worker 非同步處理。
      return reply.code(202).send({ id });
    },
  );

  // 文章清單（任何已驗證身分；admin 輪詢狀態、learner 瀏覽）。含分類/標籤 meta。
  app.get("/articles", async () => ({
    articles: await listArticlesWithMeta(pool),
  }));

  // 文章詳情：含逐段文字、翻譯、狀態與音檔路徑。
  app.get("/articles/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid article id" });
    }
    const article = await getArticleById(pool, id);
    if (!article) {
      return reply.code(404).send({ error: "article not found" });
    }
    // 附上分類/標籤 meta，供後台編輯頁還原目前設定。
    const tags = await listTagsByArticle(pool, id);
    const category = article.categoryId
      ? await getCategoryById(pool, article.categoryId)
      : null;
    const paragraphs = await listParagraphsByArticle(pool, id);
    return {
      article: {
        ...article,
        category: category ? { id: category.id, label: category.label } : null,
        tags: tags.map((t) => ({ kind: t.kind, label: t.label })),
      },
      paragraphs,
    };
  });

  // 編輯文章 metadata（admin only）：標題／教材別／年級單元難度／分類／標籤。
  // 段落內文不在此更動。tags 提供時整組覆寫。
  const UpdateArticleBody = z.object({
    title: z.string().min(1),
    materialType: z.enum(["school", "extracurricular"]),
    grade: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    level: z.string().nullable().optional(),
    categoryId: z.number().int().nullable().optional(),
    tags: z.array(z.string()).optional(),
  });

  app.patch(
    "/articles/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: "invalid article id" });
      }
      const parsed = UpdateArticleBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "invalid body", details: parsed.error.flatten() });
      }
      const body = parsed.data;
      const existing = await getArticleById(pool, id);
      if (!existing) return reply.code(404).send({ error: "article not found" });

      await withTransaction(pool, async (tx) => {
        await updateArticleMeta(tx, id, {
          title: body.title,
          materialType: body.materialType,
          grade: body.grade ?? null,
          unit: body.unit ?? null,
          level: body.level ?? null,
          categoryId: body.categoryId ?? null,
        });
        if (body.tags !== undefined) {
          await clearArticleTags(tx, id);
          for (const raw of body.tags) {
            const p = parseTag(raw);
            if (!p) continue;
            const tag = await getOrCreateTag(tx, p.kind, p.label);
            await addTagToArticle(tx, id, tag.id);
          }
        }
      });
      return { ok: true };
    },
  );

  // 重試（admin only）：將該文章 failed 的段落／jobs 重設為 pending，文章轉 processing。
  app.post(
    "/articles/:id/retry",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: "invalid article id" });
      }
      const article = await getArticleById(pool, id);
      if (!article) {
        return reply.code(404).send({ error: "article not found" });
      }
      const reset = await withTransaction(pool, async (tx) => {
        const paragraphs = await resetFailedParagraphsByArticle(tx, id);
        const jobs = await resetFailedJobsByArticle(tx, id);
        await setArticleStatus(tx, id, "processing");
        return { paragraphs, jobs };
      });
      return { ok: true, reset };
    },
  );

  // 刪除文章（admin only）：DB cascade + 清理該文章相關音檔。
  app.delete(
    "/articles/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: "invalid article id" });
      }
      // 先取涉及的 word id（cascade 刪除前），以便清理 words/<id>/a<articleId> 音檔。
      const wordIds = await listWordIdsByArticle(pool, id);
      const deleted = await deleteArticle(pool, id);
      if (!deleted) {
        return reply.code(404).send({ error: "article not found" });
      }
      if (audioDir) {
        // 段落音檔整個 articles/<id> 目錄。
        await removeAudioDir(audioDir, `articles/${id}`);
        // 各單字在本文章的解釋音檔 words/<wordId>/a<articleId>（單字共用發音 en.wav 保留）。
        for (const wordId of wordIds) {
          await removeAudioDir(audioDir, `words/${wordId}/a${id}`);
        }
      }
      return { ok: true };
    },
  );
}
