// 功能7 整合測試：GET /stats（admin only）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  createArticle,
  createParagraph,
  createJob,
  getOrCreateWord,
  createExplanation,
} from "@el/shared";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

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

let pool: ReturnType<typeof createPool>;

beforeAll(() => {
  pool = createPool(DATABASE_URL);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(
    `TRUNCATE word_explanations, words, jobs, paragraphs, articles, users RESTART IDENTITY CASCADE`,
  );
});

describe("GET /stats", () => {
  it("admin 取得各表狀態計數與總量", async () => {
    const article = await createArticle(pool, { title: "S" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "t",
    });
    await createJob(pool, article.id, p.id);
    const word = await getOrCreateWord(pool, "habit");
    await createExplanation(pool, { wordId: word.id, articleId: article.id });

    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({ method: "GET", url: "/stats" });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.articles.pending).toBe(1);
    expect(stats.paragraphs.pending).toBe(1);
    expect(stats.jobs.pending).toBe(1);
    expect(stats.words).toBe(1);
    expect(stats.explanations).toBe(1);
    await app.close();
  });

  it("reader → 403", async () => {
    const app = buildApp({ config: readerConfig, pool });
    expect(
      (await app.inject({ method: "GET", url: "/stats" })).statusCode,
    ).toBe(403);
    await app.close();
  });
});
