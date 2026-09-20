import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, createArticle, createParagraph, createCategory, getOrCreateWord, createExplanation, type VocabularyItem } from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const config: AuthConfig = { cfAccess: null, devAuthBypass: true, devUserEmail: "reader@example.com", adminEmails: [] };
let pool: ReturnType<typeof createPool>;
let app: ReturnType<typeof buildApp>;
beforeAll(() => { pool = createPool(resolveTestDatabaseUrl()); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => {
  await pool.query(`TRUNCATE users, articles, categories, words RESTART IDENTITY CASCADE`);
  app = buildApp({ pool, config });
});
afterEach(async () => { await app.close(); });

async function source(title = "動物課文") {
  const category = await createCategory(pool, { label: "動物" });
  const article = await createArticle(pool, { title, materialType: "school", grade: "三年級", unit: "1", categoryId: category.id });
  const paragraph = await createParagraph(pool, { articleId: article.id, idx: 0, text: "Cats are cute." });
  return { articleId: article.id, paragraphId: paragraph.id };
}
async function save(input: { articleId: number; paragraphId: number }, word = " Cat "): Promise<VocabularyItem> {
  const res = await app.inject({ method: "POST", url: "/vocabulary", payload: { ...input, word } });
  expect(res.statusCode).toBe(200);
  return res.json();
}
async function status(id: number, value: "active" | "mastered") {
  const res = await app.inject({ method: "PATCH", url: `/vocabulary/${id}`, payload: { status: value } });
  expect(res.statusCode).toBe(200);
  return res.json<VocabularyItem>();
}
async function age(id: number) {
  await pool.query(`UPDATE vocabulary_items SET saved_at = '2000-01-01' WHERE id = $1`, [id]);
  await pool.query(`UPDATE vocabulary_sources SET saved_at = '2000-01-01' WHERE item_id = $1`, [id]);
}

describe("主動收藏與複習 API", () => {
  it("reader 無解釋也能收藏；讀取單字不收藏且不產生 job／共用單字", async () => {
    const input = await source();
    await app.inject({ method: "GET", url: "/words/cat/explanations" });
    expect((await app.inject("/vocabulary")).json()).toEqual([]);
    const item = await save(input);
    expect(item).toMatchObject({ word: "cat", status: "active", sources: [{ ...input, title: "動物課文", text: "Cats are cute.", materialType: "school", grade: "三年級", unit: "1", category: "動物" }] });
    expect((await pool.query(`SELECT count(*)::int n FROM words`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int n FROM jobs`)).rows[0].n).toBe(0);
  });

  it("併發與重複收藏去重，同字多來源合併，既有日期不漂移", async () => {
    const first = await source();
    const second = await source("另一篇");
    const initial = await Promise.all(Array.from({ length: 4 }, () => save(first)));
    const item = initial[0];
    expect(initial.every((r) => r.id === item.id && r.sources.length === 1)).toBe(true);
    await age(item.id);
    const repeats = await Promise.all(Array.from({ length: 6 }, () => save(first, "CAT")));
    expect(repeats.every((r) => r.id === item.id && r.sources.length === 1 && r.savedAt.startsWith("2000-01-01") && r.sources[0].savedAt.startsWith("2000-01-01"))).toBe(true);
    const added = await save(second);
    expect(added.id).toBe(item.id);
    expect(added.sources).toHaveLength(2);
    expect(added.savedAt.startsWith("2000-01-01")).toBe(true);
    expect(added.sources.find((s) => s.articleId === second.articleId)!.savedAt.startsWith("2000")).toBe(false);
    expect((await app.inject("/vocabulary")).json()).toHaveLength(1);
  });

  it("熟悉狀態保留；重新收藏重設單字與選定來源日期，PATCH 恢復只重設單字日期", async () => {
    const first = await source();
    const second = await source("第二篇");
    const item = await save(first);
    await save(second);
    await age(item.id);
    expect((await status(item.id, "mastered")).status).toBe("mastered");
    expect((await app.inject("/vocabulary")).json()[0].status).toBe("mastered");
    const reactivated = await save(first);
    expect(reactivated.status).toBe("active");
    expect(reactivated.savedAt.startsWith("2000")).toBe(false);
    expect(reactivated.sources.find((s) => s.articleId === first.articleId)!.savedAt.startsWith("2000")).toBe(false);
    expect(reactivated.sources.find((s) => s.articleId === second.articleId)!.savedAt.startsWith("2000")).toBe(true);
    await age(item.id);
    await status(item.id, "mastered");
    const restored = await status(item.id, "active");
    expect(restored.savedAt.startsWith("2000")).toBe(false);
    expect(restored.sources.every((s) => s.savedAt.startsWith("2000"))).toBe(true);
  });

  it("metadata 快照與來源刪除後內容保留，失效連結為 null", async () => {
    const input = await source();
    await save(input);
    await pool.query(`UPDATE articles SET title = '新版', grade = '四年級' WHERE id = $1`, [input.articleId]);
    await pool.query(`DELETE FROM articles WHERE id = $1`, [input.articleId]);
    const [item] = (await app.inject("/vocabulary")).json<VocabularyItem[]>();
    expect(item.sources[0]).toMatchObject({ articleId: null, paragraphId: null, title: "動物課文", grade: "三年級", text: "Cats are cute." });
  });

  it("取消收藏只刪收藏與來源，不刪共用解釋", async () => {
    const input = await source();
    const word = await getOrCreateWord(pool, "cat");
    await createExplanation(pool, { wordId: word.id, ...input });
    const item = await save(input);
    expect((await app.inject({ method: "DELETE", url: `/vocabulary/${item.id}` })).statusCode).toBe(204);
    expect((await app.inject("/vocabulary")).json()).toEqual([]);
    expect((await pool.query(`SELECT count(*)::int n FROM vocabulary_sources`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int n FROM word_explanations`)).rows[0].n).toBe(1);
  });

  it("驗證來源歸屬、空白單字與非法狀態，不留下半筆收藏", async () => {
    const first = await source();
    const second = await source("別篇");
    for (const payload of [{ ...first, word: " " }, { ...first, word: "cat", paragraphId: -1 }]) {
      expect((await app.inject({ method: "POST", url: "/vocabulary", payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/vocabulary", payload: { word: "cat", articleId: first.articleId, paragraphId: second.paragraphId } })).statusCode).toBe(404);
    expect((await app.inject("/vocabulary")).json()).toEqual([]);
    expect((await app.inject({ method: "PATCH", url: "/vocabulary/1", payload: { status: "forgotten" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: "/vocabulary/abc" })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/vocabulary/999", payload: { status: "active" } })).statusCode).toBe(404);
  });

  it("沿用驗證與資料擁有者，不能查詢或異動其他身分收藏", async () => {
    const item = await save(await source());
    const other = buildApp({ pool, config: { ...config, devUserEmail: "other@example.com" } });
    const unauthenticated = buildApp({ pool, config: { ...config, devAuthBypass: false } });
    try {
      expect((await other.inject("/vocabulary")).json()).toEqual([]);
      expect((await other.inject({ method: "PATCH", url: `/vocabulary/${item.id}`, payload: { status: "mastered" } })).statusCode).toBe(404);
      expect((await other.inject({ method: "DELETE", url: `/vocabulary/${item.id}` })).statusCode).toBe(404);
      expect((await unauthenticated.inject("/vocabulary")).statusCode).toBe(403);
      expect((await app.inject("/vocabulary")).json()[0].status).toBe("active");
    } finally { await other.close(); await unauthenticated.close(); }
  });
});
