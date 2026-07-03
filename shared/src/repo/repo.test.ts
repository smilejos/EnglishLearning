// repo 層整合測試：對 compose 的 db 實機驗證（需先 `npm run migrate:up`）。
// 連線取自 DATABASE_URL，預設為本機 compose db。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import { createPool } from "../db";
import {
  createArticle,
  getArticleById,
  listArticles,
  setArticleStatus,
} from "./articles";
import {
  createParagraph,
  listParagraphsByArticle,
  updateParagraphResult,
} from "./paragraphs";
import {
  createJob,
  claimNextJob,
  markJobFailed,
  resetFailedJobsByArticle,
} from "./jobs";
import { getOrCreateWord, setWordEnAudioPath } from "./words";
import {
  createExplanation,
  findExplanation,
  listExplanationsByWord,
} from "./wordExplanations";
import {
  createCategory,
  getOrCreateCategoryByLabel,
  updateCategory,
  deleteCategory,
  listCategories,
} from "./categories";
import {
  getOrCreateTag,
  addTagToArticle,
  listTags,
  updateTag,
  deleteTag,
  renameTagKind,
} from "./tags";
import { listArticlesWithMeta } from "./articles";
import { upsertUser, getUserByEmail } from "./users";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

let pool: Pool;

beforeAll(() => {
  pool = createPool(DATABASE_URL);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE article_tags, tags, word_explanations, words, jobs, paragraphs, articles, categories, users RESTART IDENTITY CASCADE`,
  );
});

describe("articles + paragraphs + jobs 回讀一致", () => {
  it("插入文章、段落、job 後查詢回讀內容一致", async () => {
    const article = await createArticle(pool, {
      title: "Habits",
      materialType: "school",
      grade: "三年級",
    });
    expect(article.id).toBeGreaterThan(0);
    expect(article.status).toBe("pending");

    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Reading is a good habit.",
    });
    const p1 = await createParagraph(pool, {
      articleId: article.id,
      idx: 1,
      text: "Exercise keeps you healthy.",
    });
    await createJob(pool, article.id, p0.id);
    await createJob(pool, article.id, p1.id);

    const back = await getArticleById(pool, article.id);
    expect(back).toEqual(article);

    const paras = await listParagraphsByArticle(pool, article.id);
    expect(paras.map((p) => p.text)).toEqual([
      "Reading is a good habit.",
      "Exercise keeps you healthy.",
    ]);
    expect(paras.every((p) => p.status === "pending")).toBe(true);

    const list = await listArticles(pool);
    expect(list).toHaveLength(1);
  });

  it("更新段落結果與文章狀態後回讀正確", async () => {
    const article = await createArticle(pool, { title: "A" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Hello.",
    });
    await updateParagraphResult(pool, p.id, {
      translation: "你好。",
      enAudioPath: "articles/1/p0.en.wav",
      zhAudioPath: "articles/1/p0.zh.wav",
      status: "done",
    });
    await setArticleStatus(pool, article.id, "done");

    const [para] = await listParagraphsByArticle(pool, article.id);
    expect(para.translation).toBe("你好。");
    expect(para.enAudioPath).toBe("articles/1/p0.en.wav");
    expect(para.status).toBe("done");
    expect((await getArticleById(pool, article.id))!.status).toBe("done");
  });
});

describe("唯一鍵衝突被擋", () => {
  it("同一單字 normalized_word 只建立一筆（getOrCreateWord 冪等）", async () => {
    const w1 = await getOrCreateWord(pool, "habit");
    const w2 = await getOrCreateWord(pool, "habit");
    expect(w2.id).toBe(w1.id);
  });

  it("同 (word, article) 第二次插入解釋違反唯一鍵而拋錯", async () => {
    const article = await createArticle(pool, { title: "A" });
    const word = await getOrCreateWord(pool, "habit");
    await createExplanation(pool, {
      wordId: word.id,
      articleId: article.id,
      enExplanation: "x",
    });
    await expect(
      createExplanation(pool, {
        wordId: word.id,
        articleId: article.id,
        enExplanation: "y",
      }),
    ).rejects.toThrow();
  });

  it("categories 同一父層下同名違反唯一鍵（頂層因 NULL 父層語意可同名）", async () => {
    const top = await createCategory(pool, { label: "故事" });
    const sub = await createCategory(pool, { label: "童話", parentId: top.id });
    expect(sub.parentId).toBe(top.id);
    // 同一父層下同名被擋
    await expect(
      createCategory(pool, { label: "童話", parentId: top.id }),
    ).rejects.toThrow();
    // 頂層 parent_id 為 NULL，SQL 視 NULL 相異，故同名不違反唯一鍵（設計刻意保留彈性）
    const top2 = await createCategory(pool, { label: "故事" });
    expect(top2.id).not.toBe(top.id);
  });
});

describe("upsertUser", () => {
  it("首次建立後 email 衝突時更新而非重複，回傳最新 role", async () => {
    const u1 = await upsertUser(pool, { email: "a@example.com" });
    expect(u1.role).toBe("reader");

    const u2 = await upsertUser(pool, {
      email: "a@example.com",
      name: "Alice",
      role: "admin",
    });
    expect(u2.id).toBe(u1.id);
    expect(u2.role).toBe("admin");
    expect(u2.name).toBe("Alice");

    expect((await getUserByEmail(pool, "a@example.com"))!.id).toBe(u1.id);
  });
});

describe("claimNextJob", () => {
  it("認領 pending job 並標為 processing；無 pending 時回 null", async () => {
    const article = await createArticle(pool, { title: "A" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "t",
    });
    const job = await createJob(pool, article.id, p.id);

    const claimed = await claimNextJob(pool);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("processing");
    expect(claimed?.attempts).toBe(1); // 認領即計一次嘗試

    // 已無 pending
    expect(await claimNextJob(pool)).toBeNull();
  });

  it("markJobFailed 記錄錯誤轉 failed；resetFailedJobsByArticle 重設回 pending 並歸零 attempts", async () => {
    const article = await createArticle(pool, { title: "A" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "t",
    });
    const job = await createJob(pool, article.id, p.id);

    // 認領一次（attempts→1）後標終態失敗。
    await claimNextJob(pool);
    await markJobFailed(pool, job.id, "boom");

    const reset = await resetFailedJobsByArticle(pool, article.id);
    expect(reset).toBe(1);

    // 手動重設後 attempts 歸零；再認領 attempts→1。
    const claimed = await claimNextJob(pool);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.attempts).toBe(1);
  });

  it("回收 stuck job：processing 超過 staleMs 者重新認領，新鮮者不動", async () => {
    const article = await createArticle(pool, { title: "Stuck" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "t",
    });
    const job = await createJob(pool, article.id, p.id);
    await pool.query(
      `UPDATE jobs SET status='processing', updated_at = now() - interval '10 minutes' WHERE id=$1`,
      [job.id],
    );

    // staleMs=5 分鐘：10 分鐘前的 processing 視為崩潰，重新認領（attempts++ → 1）。
    const reclaimed = await claimNextJob(pool, 5 * 60 * 1000);
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempts).toBe(1);

    // 此時 job 剛被更新（新鮮 processing），不會再被回收。
    expect(await claimNextJob(pool, 5 * 60 * 1000)).toBeNull();
  });
});

describe("findExplanation / listExplanationsByWord", () => {
  it("同字在兩篇文章累積兩份解釋，listExplanationsByWord 依序回傳並含來源文章", async () => {
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

    // 快取鍵命中
    const found = await findExplanation(pool, word.id, a1.id);
    expect(found?.id).toBe(e1.id);
    expect(found?.zhTranslation).toBe("習慣（A1）");

    // 未建立解釋的組合回 null
    const word2 = await getOrCreateWord(pool, "other");
    expect(await findExplanation(pool, word2.id, a1.id)).toBeNull();

    const all = await listExplanationsByWord(pool, word.id);
    expect(all.map((x) => x.id)).toEqual([e1.id, e2.id]); // 依 created_at
    expect(all[0].article).toEqual({ id: a1.id, title: "Article One" });
    expect(all[1].article).toEqual({ id: a2.id, title: "Article Two" });
  });
});

describe("文章分類 meta：category 與 tags", () => {
  it("getOrCreateCategoryByLabel 同 label 回同一筆", async () => {
    const c1 = await getOrCreateCategoryByLabel(pool, "自然科學");
    const c2 = await getOrCreateCategoryByLabel(pool, "自然科學");
    expect(c2.id).toBe(c1.id);
    expect(c1.parentId).toBeNull();
  });

  it("listArticlesWithMeta 帶出分類與多維標籤", async () => {
    const cat = await getOrCreateCategoryByLabel(pool, "動物");
    const a1 = await createArticle(pool, {
      title: "Cats",
      materialType: "extracurricular",
      categoryId: cat.id,
      level: "A1",
    });
    await createArticle(pool, { title: "Plain", materialType: "school" });

    const t1 = await getOrCreateTag(pool, "題材", "動物");
    const t2 = await getOrCreateTag(pool, "文體", "故事");
    await addTagToArticle(pool, a1.id, t1.id);
    await addTagToArticle(pool, a1.id, t2.id);

    const list = await listArticlesWithMeta(pool);
    expect(list).toHaveLength(2);
    const cats = list.find((a) => a.id === a1.id)!;
    const plain = list.find((a) => a.title === "Plain")!;

    expect(cats.category).toEqual({ id: cat.id, label: "動物" });
    expect(cats.level).toBe("A1");
    expect(cats.tags).toEqual([
      { kind: "文體", label: "故事" },
      { kind: "題材", label: "動物" },
    ]);
    expect(plain.category).toBeNull();
    expect(plain.tags).toEqual([]);

    // listTags 列出全部標籤
    const all = await listTags(pool);
    expect(all.map((t) => `${t.kind}:${t.label}`)).toEqual([
      "文體:故事",
      "題材:動物",
    ]);
  });
});

describe("分類與標籤管理：CRUD", () => {
  it("分類：母/子建立、改名、刪除（子 cascade）", async () => {
    const parent = await createCategory(pool, { label: "動物" });
    const child = await createCategory(pool, {
      label: "貓科",
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);

    const renamed = await updateCategory(pool, child.id, { label: "貓科動物" });
    expect(renamed?.label).toBe("貓科動物");

    // 刪母 → 子一併消失（ON DELETE CASCADE）。
    expect(await deleteCategory(pool, parent.id)).toBe(true);
    expect(await listCategories(pool)).toHaveLength(0);
  });

  it("標籤：改 value、刪除、整批改維度名", async () => {
    const t1 = await getOrCreateTag(pool, "題材", "動物");
    await getOrCreateTag(pool, "題材", "植物");

    const renamed = await updateTag(pool, t1.id, { label: "貓" });
    expect(renamed?.label).toBe("貓");

    // 整批把維度 題材 → 主題分類
    const n = await renameTagKind(pool, "題材", "主題分類");
    expect(n).toBe(2);
    expect((await listTags(pool)).every((t) => t.kind === "主題分類")).toBe(true);

    expect(await deleteTag(pool, t1.id)).toBe(true);
    expect(await listTags(pool)).toHaveLength(1);
  });
});
