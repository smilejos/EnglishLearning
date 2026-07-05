// Fastify app 工廠：組裝 auth 中介層與路由。
// 與 env 載入分離，讓整合測試能直接以測試 config／pool／注入金鑰建構 app。
import Fastify, { type FastifyInstance } from "fastify";
import type { DbPool } from "@el/shared";
import { registerAuth, type AuthConfig, type KeyInput } from "./auth";
import { registerStatic } from "./static";
import { registerArticleRoutes } from "./routes/articles";
import { registerTaxonomyRoutes } from "./routes/taxonomy";
import { registerLookupRoutes, type LookupDeps } from "./routes/lookups";
import { registerStatsRoutes } from "./routes/stats";
import type { LookupLimiter } from "./rateLimit";

export interface BuildAppOpts {
  config: AuthConfig;
  pool: DbPool;
  /** 靜態音檔來源目錄（AUDIO_DIR）；提供時掛載 /audio/*。 */
  audioDir?: string;
  /** 重新解釋（POST /lookups）的 LLM／TTS 依賴；未提供時不掛載該路由。 */
  lookupDeps?: LookupDeps;
  /** lookups 用量韁繩；未提供時不限流（測試預設行為不變）。 */
  lookupLimiter?: LookupLimiter;
  getKey?: KeyInput;
  logger?: boolean;
}

export function buildApp(opts: BuildAppOpts): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  // 全域錯誤處理：詳情只記在 server 端 log，對外回一般訊息，
  // 避免把上游（如 Gemini）的錯誤內文或實作細節暴露給呼叫端。
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.status(status).send({ error: status >= 500 ? "internal server error" : error.message });
  });

  // 健康檢查（公開，供 docker healthcheck）。
  app.get("/healthz", async () => ({ ok: true, service: "api" }));

  registerAuth(app, {
    pool: opts.pool,
    config: opts.config,
    getKey: opts.getKey,
  });

  // 靜態音檔（公開路徑 /audio/，已於 auth 中介層放行）。
  if (opts.audioDir) registerStatic(app, opts.audioDir);

  // 受保護的範例路由：回傳目前身分，供驗證中介層煙霧測試。
  app.get("/me", async (request) => ({ user: request.user }));

  // 業務路由。
  registerArticleRoutes(app, opts.pool, opts.audioDir);
  registerTaxonomyRoutes(app, opts.pool);
  registerLookupRoutes(app, opts.pool, opts.audioDir, opts.lookupDeps, opts.lookupLimiter);
  registerStatsRoutes(app, opts.pool, opts.lookupLimiter);

  return app;
}
