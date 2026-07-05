// Task 4.1 整合測試：對測試 DB 驗證 Cloudflare Access 中介層。
// 以本地 RSA 金鑰簽發測試 JWT（取代真實 CF JWKS），並注入公鑰給 app。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
import type { KeyLike } from "jose";
import { createPool, getUserByEmail, preprovisionUser } from "@el/shared";
import { buildApp } from "./app";
import { resolveEffectiveRole, type AuthConfig } from "./auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

const AUD = "test-aud-tag";
let pool: ReturnType<typeof createPool>;
let privateKey: KeyLike;
let publicKey: KeyLike;

const baseConfig: AuthConfig = {
  cfAccess: { teamDomain: "team.cloudflareaccess.com", aud: AUD },
  devAuthBypass: false,
  devUserEmail: "dev@example.com",
  adminEmails: ["owner@example.com"],
};

async function signToken(claims: {
  email?: string;
  aud?: string;
}): Promise<string> {
  const builder = new SignJWT(claims.email ? { email: claims.email } : {})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(claims.aud ?? AUD);
  return builder.sign(privateKey);
}

beforeAll(async () => {
  pool = createPool(DATABASE_URL);
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
  // 觸發一次 export 確保金鑰可用（與真實 JWKS 對等的本地公鑰）。
  await exportJWK(publicKey);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

describe("Cloudflare Access 驗證中介層", () => {
  it("健康檢查為公開路徑，無 token 也回 200", async () => {
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("受保護路由無 token → 403", async () => {
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("偽造／無法驗證的 token → 403", async () => {
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "cf-access-jwt-assertion": "not-a-real-jwt" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("aud 不符的合法簽章 token → 403", async () => {
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const token = await signToken({ email: "x@example.com", aud: "wrong-aud" });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("合法 token → 通過並建立 user（預設 reader）", async () => {
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const token = await signToken({ email: "reader@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      email: "reader@example.com",
      role: "reader",
    });
    // 已寫入 DB
    expect(await getUserByEmail(pool, "reader@example.com")).not.toBeNull();
    await app.close();
  });

  it("允許清單內的 email → 授予 admin", async () => {
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const token = await signToken({ email: "owner@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.json().user.role).toBe("admin");
    await app.close();
  });

  it("DEV_AUTH_BYPASS=1 注入假身分，無 token 也可用", async () => {
    const app = buildApp({
      config: { ...baseConfig, devAuthBypass: true },
      pool,
      getKey: publicKey,
    });
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      email: "dev@example.com",
      role: "reader",
    });
    await app.close();
  });

  it("DB 為 reviewer 的使用者登入後 /me 回 reviewer，且 last_seen_at 被更新", async () => {
    await preprovisionUser(pool, "rev@example.com", "reviewer");
    const app = buildApp({ config: baseConfig, pool, getKey: publicKey });
    const token = await signToken({ email: "rev@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "cf-access-jwt-assertion": token },
    });
    expect(res.json().user.role).toBe("reviewer");
    expect(
      (await getUserByEmail(pool, "rev@example.com"))?.lastSeenAt,
    ).not.toBeNull();
    await app.close();
  });
});

describe("resolveEffectiveRole", () => {
  it("命中 ADMIN_EMAILS（不分大小寫）回 admin", () => {
    expect(
      resolveEffectiveRole("Owner@Example.com", ["owner@example.com"], "reader"),
    ).toBe("admin");
  });
  it("未命中則回 DB 角色", () => {
    expect(resolveEffectiveRole("rev@example.com", [], "reviewer")).toBe(
      "reviewer",
    );
    expect(resolveEffectiveRole("r@example.com", [], "reader")).toBe("reader");
  });
});
