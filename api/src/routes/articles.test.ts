// Task 4.3 整合測試：POST /articles（admin only）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  getArticleById,
  listParagraphsByArticle,
  createArticle,
  createParagraph,
  updateParagraphResult,
  setParagraphStatus,
  setArticleStatus,
  createJob,
  markJobFailed,
  getOrCreateWord,
  createExplanation,
  ArticleSchema,
  ParagraphSchema,
} from "@el/shared";
import { z } from "zod";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("POST /articles/:id/retry", () => {
  async function seedFailed(): Promise<number> {
    const article = await createArticle(pool, { title: "Retry me" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "t",
    });
    const job = await createJob(pool, article.id, p.id);
    await setParagraphStatus(pool, p.id, "failed");
    await markJobFailed(pool, job.id, "boom");
    await setArticleStatus(pool, article.id, "failed");
    return article.id;
  }

  async function jobStatus(articleId: number): Promise<string> {
    const r = await pool.query(
      `SELECT status FROM jobs WHERE article_id = $1 LIMIT 1`,
      [articleId],
    );
    return r.rows[0].status;
  }

  it("admin 重試 → failed 段落與 job 轉 pending、文章轉 processing", async () => {
    const id = await seedFailed();
    const app = buildApp({ config: adminConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${id}/retry`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reset).toEqual({ paragraphs: 1, jobs: 1 });

    const paras = await listParagraphsByArticle(pool, id);
    expect(paras[0].status).toBe("pending");
    expect(await jobStatus(id)).toBe("pending");
    expect((await getArticleById(pool, id))!.status).toBe("processing");
    await app.close();
  });

  it("reader → 403", async () => {
    const id = await seedFailed();
    const app = buildApp({ config: readerConfig, pool });
    const res = await app.inject({
      method: "POST",
      url: `/articles/${id}/retry`,
    });
    expect(res.statusCode).toBe(403);
    // 未變更
    expect((await getArticleById(pool, id))!.status).toBe("failed");
    await app.close();
  });

  it("不存在的文章 → 404", async () => {
    const app = buildApp({ config: adminConfig, pool });
    expect(
      (
        await app.inject({ method: "POST", url: "/articles/999999/retry" })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });
});

describe("DELETE /articles/:id", () => {
  let audioDir: string;
  beforeAll(async () => {
    audioDir = await mkdtemp(join(tmpdir(), "el-del-"));
  });
  afterAll(async () => {
    await rm(audioDir, { recursive: true, force: true });
  });

  async function exists(rel: string): Promise<boolean> {
    try {
      await stat(join(audioDir, rel));
      return true;
    } catch {
      return false;
    }
  }

  it("admin 刪除 → DB cascade 清除、段落音檔與解釋音檔移除、單字共用發音保留", async () => {
    const article = await createArticle(pool, { title: "Del" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "t",
    });
    await createJob(pool, article.id, p0.id);
    const word = await getOrCreateWord(pool, "habit");
    await createExplanation(pool, { wordId: word.id, articleId: article.id });

    // 佈置音檔：段落、單字本文章解釋、單字共用發音。
    await mkdir(join(audioDir, `articles/${article.id}`), { recursive: true });
    await writeFile(join(audioDir, `articles/${article.id}/p0.en.wav`), "x");
    await mkdir(join(audioDir, `words/${word.id}/a${article.id}`), {
      recursive: true,
    });
    await writeFile(
      join(audioDir, `words/${word.id}/a${article.id}/zh_translation.wav`),
      "x",
    );
    await writeFile(join(audioDir, `words/${word.id}/en.wav`), "shared");

    const app = buildApp({ config: adminConfig, pool, audioDir });
    const res = await app.inject({
      method: "DELETE",
      url: `/articles/${article.id}`,
    });
    expect(res.statusCode).toBe(200);

    // DB：文章與 cascade 子表清空。
    expect(await getArticleById(pool, article.id)).toBeNull();
    expect(
      (await pool.query(`SELECT count(*)::int n FROM paragraphs`)).rows[0].n,
    ).toBe(0);
    expect(
      (await pool.query(`SELECT count(*)::int n FROM word_explanations`)).rows[0]
        .n,
    ).toBe(0);

    // 音檔：段落目錄與本文章解釋目錄移除，單字共用發音保留。
    expect(await exists(`articles/${article.id}`)).toBe(false);
    expect(await exists(`words/${word.id}/a${article.id}`)).toBe(false);
    expect(await exists(`words/${word.id}/en.wav`)).toBe(true);
    await app.close();
  });

  it("reader → 403、不存在 → 404", async () => {
    const article = await createArticle(pool, { title: "Keep" });
    const readerApp = buildApp({ config: readerConfig, pool, audioDir });
    expect(
      (
        await readerApp.inject({
          method: "DELETE",
          url: `/articles/${article.id}`,
        })
      ).statusCode,
    ).toBe(403);
    expect(await getArticleById(pool, article.id)).not.toBeNull();
    await readerApp.close();

    const adminApp = buildApp({ config: adminConfig, pool, audioDir });
    expect(
      (await adminApp.inject({ method: "DELETE", url: "/articles/999999" }))
        .statusCode,
    ).toBe(404);
    await adminApp.close();
  });
});
