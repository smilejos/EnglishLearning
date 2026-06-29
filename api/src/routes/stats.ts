// 觀測端點：admin-only 平台統計彙總。
import type { FastifyInstance } from "fastify";
import { getStats, type DbPool } from "@el/shared";
import { requireAdmin } from "../auth";

export function registerStatsRoutes(app: FastifyInstance, pool: DbPool): void {
  app.get("/stats", { preHandler: requireAdmin }, async () => getStats(pool));
}
