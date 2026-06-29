// Task 4.3 整合測試：POST /articles（admin only）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  getArticleById,
  listParagraphsByArticle,
  createArticle,
  createParagraph,
  updateParagraphResult,
  ArticleSchema,
  ParagraphSchema,
} from "@el/shared";
import { z } from "zod";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5432/english_learning";

let pool: ReturnType<typeof createPool>;

// 以 devAuthBypass 注入身分：admin（email 在 allowlist）／reader（不在）。
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
    `TRUNCATE jobs, paragraphs, articles, users RESTART IDENTITY CASCADE`,
  );
});

async function jobCount(articleId: number): Promise<number> {
  const r = await pool.query(`SELECT count(*)::int AS n FROM jobs WHERE article_id = $1`, [
    articleId,
  ]);
  return r.rows[0].n;
}

describe("POST /articles", () => {
  it("admin 上傳 → 202 + id，article/paragraphs/jobs 列數正確且 status=pending", async () => {
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: "/articles",
      payload: {
        title: "Habits",
        materialType: "school",
        grade: "三年級",
        text: "Reading is a good habit.\n\nExercise keeps you healthy.",
      },
    });
    expect(res.statusCode).toBe(202);
    const { id } = res.json();
    expect(id).toBeGreaterThan(0);

    const article = await getArticleById(pool, id);
    expect(article).toMatchObject({ title: "Habits", status: "pending" });

    const paras = await listParagraphsByArticle(pool, id);
    expect(paras.map((p) => p.text)).toEqual([
      "Reading is a good habit.",
      "Exercise keeps you healthy.",
    ]);
    expect(paras.every((p) => p.status === "pending")).toBe(true);
    expect(await jobCount(id)).toBe(2);

    await app.close();
  });

  it("reader 角色 → 403，且未建立任何文章", async () => {
    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: "/articles",
      payload: { title: "X", text: "hello" },
    });
    expect(res.statusCode).toBe(403);
    const r = await pool.query(`SELECT count(*)::int AS n FROM articles`);
    expect(r.rows[0].n).toBe(0);
    await app.close();
  });

  it("缺欄位／空白內容 → 400", async () => {
    const app = buildApp({ config: adminConfig, pool });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/articles",
          payload: { title: "X" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/articles",
          payload: { title: "X", text: "   \n\n  " },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });
});

describe("GET /articles, GET /articles/:id", () => {
  it("清單回傳符合 ArticleSchema 的文章陣列", async () => {
    await createArticle(pool, { title: "One" });
    await createArticle(pool, { title: "Two" });
    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({ method: "GET", url: "/articles" });
    expect(res.statusCode).toBe(200);
    const articles = z.array(ArticleSchema).parse(res.json().articles);
    expect(articles).toHaveLength(2);
    await app.close();
  });

  it("詳情含逐段 status 與音檔路徑，形狀符合 shared schema", async () => {
    const article = await createArticle(pool, { title: "Detail" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Hello.",
    });
    await createParagraph(pool, {
      articleId: article.id,
      idx: 1,
      text: "World.",
    });
    await updateParagraphResult(pool, p0.id, {
      translation: "你好。",
      enAudioPath: "articles/1/p0.en.wav",
      zhAudioPath: "articles/1/p0.zh.wav",
      status: "done",
    });

    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({
      method: "GET",
      url: `/articles/${article.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    ArticleSchema.parse(body.article);
    const paras = z.array(ParagraphSchema).parse(body.paragraphs);
    expect(paras).toHaveLength(2);
    expect(paras[0]).toMatchObject({
      status: "done",
      translation: "你好。",
      enAudioPath: "articles/1/p0.en.wav",
      zhAudioPath: "articles/1/p0.zh.wav",
    });
    expect(paras[1].status).toBe("pending");
    await app.close();
  });

  it("不存在的文章 → 404；非法 id → 400", async () => {
    const app = buildApp({ config: readerConfig, pool });
    expect(
      (await app.inject({ method: "GET", url: "/articles/999999" })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/articles/abc" })).statusCode,
    ).toBe(400);
    await app.close();
  });
});
