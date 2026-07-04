// 單字管理 repo 整合測試：搜尋、文章內清單、刪除（獨立測試庫）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  createArticle,
  getOrCreateWord,
  setWordEnAudioPath,
  createExplanation,
  searchWords,
  deleteWord,
  listExplanationsByArticle,
  getExplanationById,
  deleteExplanation,
} from "../index";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

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

describe("單字管理 repo", () => {
  it("searchWords：子字串比對並附解釋數", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w1 = await getOrCreateWord(pool, "habit");
    const w2 = await getOrCreateWord(pool, "habitat");
    await createExplanation(pool, {
      wordId: w1.id,
      articleId: a.id,
      zhTranslation: "習慣",
    });

    const rows = await searchWords(pool, "habit", 20);
    const byWord = Object.fromEntries(rows.map((r) => [r.normalizedWord, r]));
    expect(byWord["habit"].explanationCount).toBe(1);
    expect(byWord["habitat"].explanationCount).toBe(0);
    expect(byWord["habit"].id).toBe(w1.id);
    expect(w2.id).toBeGreaterThan(0);
  });

  it("listExplanationsByArticle：回該文章解釋（含單字）", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w = await getOrCreateWord(pool, "thick");
    await createExplanation(pool, {
      wordId: w.id,
      articleId: a.id,
      zhTranslation: "厚",
    });

    const list = await listExplanationsByArticle(pool, a.id);
    expect(list).toHaveLength(1);
    expect(list[0].word.normalizedWord).toBe("thick");
    expect(list[0].zhTranslation).toBe("厚");
  });

  it("deleteExplanation：刪單一解釋、回 word/article，不動單字", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w = await getOrCreateWord(pool, "thick");
    const e = await createExplanation(pool, { wordId: w.id, articleId: a.id });

    const got = await deleteExplanation(pool, e.id);
    expect(got).toEqual({ wordId: w.id, articleId: a.id });
    expect(await getExplanationById(pool, e.id)).toBeNull();
    expect(await searchWords(pool, "thick", 5)).toHaveLength(1); // 單字仍在
  });

  it("deleteWord：連帶 cascade 刪除其所有解釋", async () => {
    const a1 = await createArticle(pool, { title: "A1" });
    const a2 = await createArticle(pool, { title: "A2" });
    const w = await getOrCreateWord(pool, "thick");
    await setWordEnAudioPath(pool, w.id, "words/1/en.wav");
    await createExplanation(pool, { wordId: w.id, articleId: a1.id });
    await createExplanation(pool, { wordId: w.id, articleId: a2.id });

    expect(await deleteWord(pool, w.id)).toBe(w.id);
    expect(await searchWords(pool, "thick", 5)).toHaveLength(0);
    expect(await listExplanationsByArticle(pool, a1.id)).toHaveLength(0);
  });
});
