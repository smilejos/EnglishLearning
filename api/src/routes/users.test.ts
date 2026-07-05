// 使用者管理端點整合測試（對測試庫）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPool, preprovisionUser } from "@el/shared";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

// dev 使用者 owner@example.com 命中 adminEmails → admin，可打管理端點。
const config: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "owner@example.com",
  adminEmails: ["owner@example.com"],
};

let pool: ReturnType<typeof createPool>;
beforeAll(() => {
  pool = createPool(DATABASE_URL);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

describe("使用者管理端點", () => {
  it("GET /users 列出使用者，env 管理者標記 isEnvAdmin", async () => {
    const app = buildApp({ config, pool });
    await preprovisionUser(pool, "rev@example.com", "reviewer");
    const res = await app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(200);
    const users = res.json().users as any[];
    const rev = users.find((u) => u.email === "rev@example.com");
    expect(rev.role).toBe("reviewer");
    expect(rev.isEnvAdmin).toBe(false);
    // 呼叫端 owner 登入後也會被 ensureUser 建立並標記 env admin。
    const owner = users.find((u) => u.email === "owner@example.com");
    expect(owner.isEnvAdmin).toBe(true);
    expect(owner.role).toBe("admin");
    await app.close();
  });

  it("PUT /users/:email/role 改角色", async () => {
    const app = buildApp({ config, pool });
    await preprovisionUser(pool, "u@example.com", "reader");
    const res = await app.inject({
      method: "PUT",
      url: "/users/u@example.com/role",
      payload: { role: "reviewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe("reviewer");
    await app.close();
  });

  it("PUT 改到 env 管理者 → 400", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "PUT",
      url: "/users/owner@example.com/role",
      payload: { role: "reader" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("PUT 對不存在使用者 → 404", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "PUT",
      url: "/users/ghost@example.com/role",
      payload: { role: "reviewer" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("POST /users 預先指派", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "pre@example.com", role: "reviewer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.lastSeenAt).toBeNull();
    await app.close();
  });

  it("POST email 在 adminEmails → 400", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "owner@example.com", role: "reviewer" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("非 admin 呼叫 → 403", async () => {
    const readerConfig: AuthConfig = {
      ...config,
      devUserEmail: "r@example.com",
      adminEmails: [],
    };
    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({ method: "GET", url: "/users" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
