// Fastify app 工廠：組裝 auth 中介層與路由。
// 與 env 載入分離，讓整合測試能直接以測試 config／pool／注入金鑰建構 app。
import Fastify, { type FastifyInstance } from "fastify";
import type { Queryable } from "@el/shared";
import { registerAuth, type AuthConfig, type KeyInput } from "./auth";

export interface BuildAppOpts {
  config: AuthConfig;
  pool: Queryable;
  getKey?: KeyInput;
  logger?: boolean;
}

export function buildApp(opts: BuildAppOpts): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  // 健康檢查（公開，供 docker healthcheck）。
  app.get("/healthz", async () => ({ ok: true, service: "api" }));

  registerAuth(app, {
    pool: opts.pool,
    config: opts.config,
    getKey: opts.getKey,
  });

  // 受保護的範例路由：回傳目前身分，供驗證中介層煙霧測試。
  app.get("/me", async (request) => ({ user: request.user }));

  return app;
}
