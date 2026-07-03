// 觀測端點：admin-only 平台統計彙總（含今日 LLM 查詢用量）。
import type { FastifyInstance } from "fastify";
import { getStats, type DbPool } from "@el/shared";
import { requireAdmin } from "../auth";
import type { LookupLimiter } from "../rateLimit";

export function registerStatsRoutes(
  app: FastifyInstance,
  pool: DbPool,
  limiter?: LookupLimiter,
): void {
  app.get("/stats", { preHandler: requireAdmin }, async () => ({
    ...(await getStats(pool)),
    lookupsToday: limiter
      ? { llmCalls: limiter.todayCount(), globalPerDay: limiter.limits.globalPerDay }
      : null,
  }));
}
