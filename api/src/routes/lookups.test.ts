// Task 4.6 整合測試：GET /words/:word/explanations。
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPool,
  createArticle,
  createParagraph,
  getOrCreateWord,
  setWordEnAudioPath,
  createExplanation,
  findExplanation,
  findWordByNormalized,
  WordLookupResponseSchema,
  type ExplainClient,
  type TtsClient,
} from "@el/shared";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";
import type { LookupDeps } from "./lookups";

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

describe("POST /lookups（重新解釋）", () => {
  let audioDir: string;
  const content = {
    en_explanation: "a regular practice",
    zh_translation: "習慣",
    zh_explanation: "經常重複的行為",
    en_example: "Reading is a good habit.",
    zh_example: "閱讀是個好習慣。",
  };

  // mock LLM／TTS，計數呼叫次數。
  let explainSpy: ReturnType<typeof vi.fn>;
  let synthSpy: ReturnType<typeof vi.fn>;
  function makeDeps(): LookupDeps {
    explainSpy = vi.fn(async () => JSON.stringify(content));
    synthSpy = vi.fn(async () => ({
      wav: Buffer.from([0x52, 0x49, 0x46, 0x46]),
      pcm: Buffer.from([1, 2]),
    }));
    const explainClient: ExplainClient = { complete: explainSpy };
    const ttsClient: TtsClient = {
      synthesize: synthSpy as unknown as TtsClient["synthesize"],
    };
    return {
      explainClient,
      ttsClient,
      voiceEn: "VoiceEn",
      voiceZh: "VoiceZh",
      audioDir,
    };
  }

  async function fileExists(rel: string): Promise<boolean> {
    try {
      await stat(join(audioDir, rel));
      return true;
    } catch {
      return false;
    }
  }

  beforeAll(async () => {
    audioDir = await mkdtemp(join(tmpdir(), "el-lookup-"));
  });
  afterAll(async () => {
    await rm(audioDir, { recursive: true, force: true });
  });

  async function seedArticleParagraph(): Promise<{
    articleId: number;
    paragraphId: number;
  }> {
    const article = await createArticle(pool, { title: "Habits" });
    const p = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Reading is a good habit.",
    });
    return { articleId: article.id, paragraphId: p.id };
  }

  it("首呼產生 6 個音檔（5 解釋 + word 英文發音）並寫入解釋", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });

    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "Habit " },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();

    // LLM：解釋 1 次、TTS 6 次（en 發音 + 5 解釋音檔）。
    expect(explainSpy).toHaveBeenCalledTimes(1);
    expect(synthSpy).toHaveBeenCalledTimes(6);

    // 回傳解釋含 5 個音檔欄位 + 文字。
    const e = body.explanation;
    expect(e.enExplanation).toBe("a regular practice");
    for (const f of [
      "enExplanationAudioPath",
      "enExampleAudioPath",
      "zhTranslationAudioPath",
      "zhExplanationAudioPath",
      "zhExampleAudioPath",
    ]) {
      expect(e[f]).toBeTruthy();
      expect(await fileExists(e[f])).toBe(true);
    }
    // word 英文發音
    expect(body.word.enAudioPath).toBeTruthy();
    expect(await fileExists(body.word.enAudioPath)).toBe(true);

    // DB 已寫入
    const word = await findWordByNormalized(pool, "habit");
    expect(word?.enAudioPath).toBe(body.word.enAudioPath);
    expect(await findExplanation(pool, word!.id, articleId)).not.toBeNull();

    await app.close();
  });

  it("二次同 (word, article) 命中快取，LLM/TTS 呼叫次數為 0", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });

    await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    explainSpy.mockClear();
    synthSpy.mockClear();

    const res2 = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res2.statusCode).toBe(200);
    expect(explainSpy).toHaveBeenCalledTimes(0);
    expect(synthSpy).toHaveBeenCalledTimes(0);
    expect(res2.json().explanation.zhTranslation).toBe("習慣");
    await app.close();
  });

  it("併發首查同 (word, article)：皆非 500、DB 只留一筆解釋", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });

    const payload = { articleId, paragraphId, word: "habit" };
    const [r1, r2] = await Promise.all([
      app.inject({ method: "POST", url: "/lookups", payload }),
      app.inject({ method: "POST", url: "/lookups", payload }),
    ]);

    // 不得有 500（唯一鍵衝突須被視為快取命中處理）。
    expect([200, 201]).toContain(r1.statusCode);
    expect([200, 201]).toContain(r2.statusCode);
    expect(r1.json().explanation.zhTranslation).toBe("習慣");
    expect(r2.json().explanation.zhTranslation).toBe("習慣");

    // DB 只應有一筆解釋。
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM word_explanations`,
    );
    expect(n.rows[0].n).toBe(1);
    await app.close();
  });

  it("單段 TTS 失敗時仍存解釋、該音檔為 null、回 201", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    // 對中文翻譯 "習慣" 的 TTS 拋錯（模擬 Gemini finishReason OTHER）。
    const failingSynth = vi.fn(async (text: string) => {
      if (text === "習慣") throw new Error("no audio data");
      return {
        wav: Buffer.from([0x52, 0x49, 0x46, 0x46]),
        pcm: Buffer.from([1, 2]),
      };
    });
    const deps: LookupDeps = {
      explainClient: { complete: vi.fn(async () => JSON.stringify(content)) },
      ttsClient: {
        synthesize: failingSynth as unknown as TtsClient["synthesize"],
      },
      voiceEn: "VoiceEn",
      voiceZh: "VoiceZh",
      audioDir,
    };
    const app = buildApp({ config, pool, audioDir, lookupDeps: deps });
    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res.statusCode).toBe(201);
    const e = res.json().explanation;
    expect(e.zhTranslation).toBe("習慣"); // 文字仍寫入
    expect(e.zhTranslationAudioPath).toBeNull(); // 失敗段音檔為 null
    expect(e.enExplanationAudioPath).toBeTruthy(); // 其他段音檔正常
    // DB 確有一筆解釋
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM word_explanations`,
    );
    expect(n.rows[0].n).toBe(1);
    await app.close();
  });

  it("文章或段落不存在 → 404；body 非法 → 400", async () => {
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/lookups",
          payload: { articleId: 999, paragraphId: 999, word: "x" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/lookups",
          payload: { articleId: 1, word: "" },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });
});
