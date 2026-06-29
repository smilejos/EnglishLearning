// 單字查詢路由。GET 既有解釋清單；POST 重新解釋（Task 4.7）。
import type { FastifyInstance } from "fastify";
import {
  normalizeWord,
  findWordByNormalized,
  listExplanationsByWord,
  type DbPool,
} from "@el/shared";

export function registerLookupRoutes(app: FastifyInstance, pool: DbPool): void {
  // 某單字的所有既有解釋（含各自來源文章，依 created_at 排序）。
  app.get("/words/:word/explanations", async (request) => {
    const normalized = normalizeWord((request.params as { word: string }).word);
    const word = await findWordByNormalized(pool, normalized);
    if (!word) return { word: null, explanations: [] };
    const explanations = await listExplanationsByWord(pool, word.id);
    return { word, explanations };
  });
}
