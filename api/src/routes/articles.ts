// 文章路由：上傳（admin only）。查詢／重試於後續任務加入同檔。
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  withTransaction,
  createArticle,
  createParagraph,
  createJob,
  listArticles,
  getArticleById,
  listParagraphsByArticle,
  setArticleStatus,
  resetFailedParagraphsByArticle,
  resetFailedJobsByArticle,
  deleteArticle,
  listWordIdsByArticle,
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
  level: z.string().optional(),
});

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
        const article = await createArticle(tx, {
          title: body.title,
          materialType: body.materialType,
          grade: body.grade ?? null,
          unit: body.unit ?? null,
          week: body.week ?? null,
          page: body.page ?? null,
          categoryId: body.categoryId ?? null,
          level: body.level ?? null,
          createdBy: request.user!.id,
        });
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

  // 文章清單（任何已驗證身分；admin 輪詢狀態、learner 瀏覽）。
  app.get("/articles", async () => ({ articles: await listArticles(pool) }));

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
    const paragraphs = await listParagraphsByArticle(pool, id);
    return { article, paragraphs };
  });

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
