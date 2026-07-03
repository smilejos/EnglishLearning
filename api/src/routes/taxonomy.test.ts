// 整合測試：分類/標籤管理路由（讀取公開、異動限 admin）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPool } from "@el/shared";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

let pool: ReturnType<typeof createPool>;

const adminConfig: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "admin@example.com",
  adminEmails: ["admin@example.com"],
};
const readerConfig: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "reader@example.com",
  adminEmails: ["admin@example.com"],
};

beforeAll(() => {
  pool = createPool(DATABASE_URL);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(
    `TRUNCATE article_tags, tags, articles, categories RESTART IDENTITY CASCADE`,
  );
});

describe("categories CRUD", () => {
  it("admin 建立母/子、改名、刪除（子 cascade）；reader 異動 403", async () => {
    const app = buildApp({ config: adminConfig, pool });

    const parent = (
      await app.inject({
        method: "POST",
        url: "/categories",
        payload: { label: "動物" },
      })
    ).json().category;
    expect(parent.id).toBeGreaterThan(0);

    await app.inject({
      method: "POST",
      url: "/categories",
      payload: { label: "貓科", parentId: parent.id },
    });

    const list = (await app.inject({ method: "GET", url: "/categories" })).json()
      .categories;
    expect(list).toHaveLength(2);

    const patched = await app.inject({
      method: "PATCH",
      url: `/categories/${parent.id}`,
      payload: { label: "動物世界" },
    });
    expect(patched.json().category.label).toBe("動物世界");

    // 刪母 → 子 cascade。
    const del = await app.inject({
      method: "DELETE",
      url: `/categories/${parent.id}`,
    });
    expect(del.statusCode).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/categories" })).json().categories,
    ).toHaveLength(0);
    await app.close();

    // reader 不可異動。
    const readerApp = buildApp({ config: readerConfig, pool });
    expect(
      (
        await readerApp.inject({
          method: "POST",
          url: "/categories",
          payload: { label: "x" },
        })
      ).statusCode,
    ).toBe(403);
    await readerApp.close();
  });
});

describe("tags CRUD", () => {
  it("admin 建立、整批改維度名、刪除", async () => {
    const app = buildApp({ config: adminConfig, pool });
    await app.inject({
      method: "POST",
      url: "/tags",
      payload: { kind: "題材", label: "動物" },
    });
    const t2 = (
      await app.inject({
        method: "POST",
        url: "/tags",
        payload: { kind: "題材", label: "植物" },
      })
    ).json().tag;

    const rename = await app.inject({
      method: "POST",
      url: "/tag-kinds/rename",
      payload: { from: "題材", to: "主題" },
    });
    expect(rename.json().updated).toBe(2);

    const tags = (await app.inject({ method: "GET", url: "/tags" })).json().tags;
    expect(tags.every((t: { kind: string }) => t.kind === "主題")).toBe(true);

    expect(
      (await app.inject({ method: "DELETE", url: `/tags/${t2.id}` })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/tags" })).json().tags,
    ).toHaveLength(1);
    await app.close();
  });
});
