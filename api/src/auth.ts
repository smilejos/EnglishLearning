// Cloudflare Access 驗證中介層。
// 驗證 `Cf-Access-Jwt-Assertion` JWT（以 team domain 的 JWKS 取公鑰、驗 aud、取 email），
// upsert users 並把 { id, email, role } 掛到 request.user。
// 本機開發以 DEV_AUTH_BYPASS=1 注入假身分繞過。
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  jwtVerify,
  createRemoteJWKSet,
  type KeyLike,
  type JWTVerifyGetKey,
} from "jose";
import { upsertUser, type Queryable, type UserRole } from "@el/shared";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

/** jwtVerify 第二參數可為金鑰或 getKey 函式；測試可注入本地公鑰。 */
export type KeyInput = KeyLike | Uint8Array | JWTVerifyGetKey;

/** admin 角色判定：email 命中允許清單則為 admin，否則 reader（設計 §9.6）。 */
export function resolveRole(email: string, adminEmails: string[]): UserRole {
  return adminEmails.includes(email.toLowerCase()) ? "admin" : "reader";
}

/** 由 team domain 建立遠端 JWKS 解析器。 */
export function buildKeyResolver(teamDomain: string): KeyInput {
  const base = /^https?:\/\//i.test(teamDomain)
    ? teamDomain
    : `https://${teamDomain}`;
  return createRemoteJWKSet(new URL(`${base}/cdn-cgi/access/certs`));
}

/** 驗證 Access JWT，回傳其 email claim；失敗則拋錯。 */
export async function verifyAccessJwt(
  token: string,
  opts: { aud: string; getKey: KeyInput },
): Promise<{ email: string }> {
  // getKey 可能是金鑰或 getKey 函式；jwtVerify 於執行期自行判別，TS 上以函式重載型別 cast。
  const { payload } = await jwtVerify(
    token,
    opts.getKey as JWTVerifyGetKey,
    { audience: opts.aud },
  );
  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!email) throw new Error("token missing email claim");
  return { email };
}

export interface AuthConfig {
  cfAccess: { teamDomain: string; aud: string } | null;
  devAuthBypass: boolean;
  devUserEmail: string;
  adminEmails: string[];
}

export interface RegisterAuthOpts {
  pool: Queryable;
  config: AuthConfig;
  /** 注入金鑰解析器（測試用）；未提供時由 cfAccess.teamDomain 建立遠端 JWKS。 */
  getKey?: KeyInput;
  /** 免驗證的公開路徑前綴，預設健康檢查與靜態音檔。 */
  publicPaths?: string[];
}

const ACCESS_HEADER = "cf-access-jwt-assertion";

/** 在 app 上註冊全域 preHandler 驗證，並設定 request.user。 */
export function registerAuth(
  app: FastifyInstance,
  opts: RegisterAuthOpts,
): void {
  const publicPaths = opts.publicPaths ?? ["/healthz", "/audio/"];
  const getKey =
    opts.getKey ??
    (opts.config.cfAccess
      ? buildKeyResolver(opts.config.cfAccess.teamDomain)
      : undefined);

  app.decorateRequest("user", null);

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (publicPaths.some((p) => path === p || path.startsWith(p))) return;

    const { config } = opts;
    let email: string;

    if (config.devAuthBypass) {
      email = config.devUserEmail;
    } else {
      const token = request.headers[ACCESS_HEADER];
      if (typeof token !== "string" || token === "") {
        return reply
          .code(403)
          .send({ error: "missing Cloudflare Access token" });
      }
      if (!config.cfAccess || !getKey) {
        return reply.code(403).send({ error: "auth not configured" });
      }
      try {
        ({ email } = await verifyAccessJwt(token, {
          aud: config.cfAccess.aud,
          getKey,
        }));
      } catch {
        return reply
          .code(403)
          .send({ error: "invalid Cloudflare Access token" });
      }
    }

    const role = resolveRole(email, config.adminEmails);
    const user = await upsertUser(opts.pool, { email, role });
    request.user = { id: user.id, email: user.email, role: user.role };
  });
}

/** 路由層守衛：限 admin 角色，供上傳／重試等管理路由使用。 */
export const requireAdmin: preHandlerHookHandler = async (request, reply) => {
  if (!request.user || request.user.role !== "admin") {
    return reply.code(403).send({ error: "admin only" });
  }
};
