// clearParagraphResult 依 scope 清欄位（對測試 DB）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createPool,
  createArticle,
  createParagraph,
  updateParagraphResult,
  getParagraphById,
  clearParagraphResult,
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
  await pool.query(`TRUNCATE jobs, paragraphs, articles, users RESTART IDENTITY CASCADE`);
});

async function seedDone() {
  const article = await createArticle(pool, { title: "Clear" });
  const p = await createParagraph(pool, { articleId: article.id, idx: 0, text: "T." });
  await updateParagraphResult(pool, p.id, {
    translation: "譯",
    enAudioPath: "articles/1/p0.en.wav",
    zhAudioPath: "articles/1/p0.zh.wav",
    status: "done",
  });
  return p.id;
}

describe("clearParagraphResult scope", () => {
  it("translation：清翻譯與中文音檔，保留英文音檔，狀態 pending", async () => {
    const id = await seedDone();
    await clearParagraphResult(pool, id, "translation");
    const p = (await getParagraphById(pool, id))!;
    expect(p.translation).toBeNull();
    expect(p.zhAudioPath).toBeNull();
    expect(p.enAudioPath).toBe("articles/1/p0.en.wav");
    expect(p.status).toBe("pending");
  });

  it("audio-zh：只清中文音檔，保留翻譯與英文音檔", async () => {
    const id = await seedDone();
    await clearParagraphResult(pool, id, "audio-zh");
    const p = (await getParagraphById(pool, id))!;
    expect(p.translation).toBe("譯");
    expect(p.zhAudioPath).toBeNull();
    expect(p.enAudioPath).toBe("articles/1/p0.en.wav");
    expect(p.status).toBe("pending");
  });

  it("audio-en：只清英文音檔，保留翻譯與中文音檔", async () => {
    const id = await seedDone();
    await clearParagraphResult(pool, id, "audio-en");
    const p = (await getParagraphById(pool, id))!;
    expect(p.translation).toBe("譯");
    expect(p.enAudioPath).toBeNull();
    expect(p.zhAudioPath).toBe("articles/1/p0.zh.wav");
    expect(p.status).toBe("pending");
  });
});
