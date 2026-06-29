// Task 4.6 整合測試：GET /words/:word/explanations。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  createArticle,
  getOrCreateWord,
  setWordEnAudioPath,
  createExplanation,
  WordLookupResponseSchema,
} from "@el/shared";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5432/english_learning";

const config: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "reader@example.com",
  adminEmails: [],
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
    `TRUNCATE word_explanations, words, articles, users RESTART IDENTITY CASCADE`,
  );
});

describe("GET /words/:word/explanations", () => {
  it("回該單字的所有解釋，含各自來源文章，依 created_at 排序", async () => {
    const a1 = await createArticle(pool, { title: "Article One" });
    const a2 = await createArticle(pool, { title: "Article Two" });
    const word = await getOrCreateWord(pool, "habit");
    await setWordEnAudioPath(pool, word.id, "words/1/en.wav");
    const e1 = await createExplanation(pool, {
      wordId: word.id,
      articleId: a1.id,
      zhTranslation: "習慣（A1）",
    });
    const e2 = await createExplanation(pool, {
      wordId: word.id,
      articleId: a2.id,
      zhTranslation: "習慣（A2）",
    });

    const app = buildApp({ config, pool });
    // 大小寫／空白會被 normalizeWord 正規化。
    const res = await app.inject({
      method: "GET",
      url: "/words/%20Habit%20/explanations",
    });
    expect(res.statusCode).toBe(200);
    const body = WordLookupResponseSchema.parse(res.json());
    expect(body.word?.normalizedWord).toBe("habit");
    expect(body.explanations.map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(body.explanations[0].article).toEqual({
      id: a1.id,
      title: "Article One",
    });
    expect(body.explanations[1].article).toEqual({
      id: a2.id,
      title: "Article Two",
    });
    await app.close();
  });

  it("未知單字回空清單（word 為 null）", async () => {
    const app = buildApp({ config, pool });
    const res = await app.inject({
      method: "GET",
      url: "/words/unknown/explanations",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ word: null, explanations: [] });
    await app.close();
  });
});
