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
import { LookupLimiter } from "../rateLimit";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

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
    headword: "habit",
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
      audioFormat: "wav",
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

  it("寫入 LLM 回傳的 headword，快取命中亦回傳同 headword", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const phraseDeps = makeDeps();
    phraseDeps.explainClient.complete = vi.fn(async () =>
      JSON.stringify({ ...content, headword: "good habit" }),
    );
    const app = buildApp({ config, pool, audioDir, lookupDeps: phraseDeps });

    const res1 = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res1.statusCode).toBe(201);
    expect(res1.json().explanation.headword).toBe("good habit");

    const res2 = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res2.statusCode).toBe(200); // 快取命中
    expect(res2.json().explanation.headword).toBe("good habit");
    await app.close();
  });

  it("首呼：先回文字（音檔為 null），背景補 6 個音檔後 DB/檔案就緒", async () => {
    const { articleId, paragraphId } = await seedArticleParagraph();
    const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });

    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "Habit " },
    });
    expect(res.statusCode).toBe(201);
    const e = res.json().explanation;
    // 立即回傳：文字已在，音檔欄位與 word 發音皆為 null。
    expect(e.enExplanation).toBe("a regular practice");
    expect(e.zhExplanationAudioPath).toBeNull();
    expect(res.json().word.enAudioPath).toBeNull();

    // 背景：DB 與檔案最終就緒（含 word 英文發音）。
    const word = await findWordByNormalized(pool, "habit");
    await vi.waitFor(async () => {
      const stored = await findExplanation(pool, word!.id, articleId);
      for (const f of [
        "enExplanationAudioPath",
        "enExampleAudioPath",
        "zhTranslationAudioPath",
        "zhExplanationAudioPath",
        "zhExampleAudioPath",
      ] as const) {
        expect((stored as Record<string, unknown>)?.[f]).toBeTruthy();
        expect(await fileExists((stored as Record<string, string>)[f])).toBe(true);
      }
      const w = await findWordByNormalized(pool, "habit");
      expect(w?.enAudioPath).toBeTruthy();
      expect(await fileExists(w!.enAudioPath!)).toBe(true);
    });
    // LLM 1 次、TTS 6 次（en 發音 + 5 解釋音檔）。
    expect(explainSpy).toHaveBeenCalledTimes(1);
    expect(synthSpy).toHaveBeenCalledTimes(6);

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
    // 等首查的背景音檔補產完成，再清 spy，避免背景呼叫混入第二次斷言。
    const word = await findWordByNormalized(pool, "habit");
    await vi.waitFor(async () => {
      const stored = await findExplanation(pool, word!.id, articleId);
      expect(stored?.zhExampleAudioPath).toBeTruthy();
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

  it("單段 TTS 失敗時仍存解釋、該音檔為 null、其餘背景補齊、回 201", async () => {
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
      audioFormat: "wav",
    };
    const app = buildApp({ config, pool, audioDir, lookupDeps: deps });
    const res = await app.inject({
      method: "POST",
      url: "/lookups",
      payload: { articleId, paragraphId, word: "habit" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().explanation.zhTranslation).toBe("習慣"); // 文字仍寫入
    // DB 只一筆解釋。
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM word_explanations`,
    );
    expect(n.rows[0].n).toBe(1);

    // 背景就緒後：失敗段音檔為 null、其他段正常。
    const word = await findWordByNormalized(pool, "habit");
    await vi.waitFor(async () => {
      const stored = await findExplanation(pool, word!.id, articleId);
      expect(stored?.enExplanationAudioPath).toBeTruthy();
      expect(stored?.zhTranslationAudioPath).toBeNull();
    });
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

  describe("用量韁繩", () => {
    async function seed(): Promise<{ articleId: number; paragraphId: number }> {
      const article = await createArticle(pool, { title: "Limits" });
      const p = await createParagraph(pool, {
        articleId: article.id,
        idx: 0,
        text: "Reading is a good habit.",
      });
      return { articleId: article.id, paragraphId: p.id };
    }

    it("超過 per-user 每分鐘上限 → 429 scope=user，且不呼叫任何 LLM/TTS", async () => {
      const { articleId, paragraphId } = await seed();
      const limiter = new LookupLimiter({ userPerMin: 0, globalPerDay: 100 });
      const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps(), lookupLimiter: limiter });
      const res = await app.inject({
        method: "POST",
        url: "/lookups",
        payload: { articleId, paragraphId, word: "habit" },
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().scope).toBe("user");
      expect(explainSpy).toHaveBeenCalledTimes(0);
      expect(synthSpy).toHaveBeenCalledTimes(0);
      await app.close();
    });

    it("全站每日上限 → 429 scope=global", async () => {
      const { articleId, paragraphId } = await seed();
      const limiter = new LookupLimiter({ userPerMin: 100, globalPerDay: 0 });
      const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps(), lookupLimiter: limiter });
      const res = await app.inject({
        method: "POST",
        url: "/lookups",
        payload: { articleId, paragraphId, word: "habit" },
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().scope).toBe("global");
      await app.close();
    });

    it("快取命中不受限流影響（上限 0 仍回 200）", async () => {
      const { articleId, paragraphId } = await seed();
      const app1 = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });
      await app1.inject({
        method: "POST",
        url: "/lookups",
        payload: { articleId, paragraphId, word: "habit" },
      });
      await app1.close();

      const limiter = new LookupLimiter({ userPerMin: 0, globalPerDay: 0 });
      const app2 = buildApp({ config, pool, audioDir, lookupDeps: makeDeps(), lookupLimiter: limiter });
      const res = await app2.inject({
        method: "POST",
        url: "/lookups",
        payload: { articleId, paragraphId, word: "habit" },
      });
      expect(res.statusCode).toBe(200);
      await app2.close();
    });
  });

  describe("POST /lookups/backfill-audio", () => {
    const adminConfig: AuthConfig = {
      cfAccess: null,
      devAuthBypass: true,
      devUserEmail: "admin@example.com",
      adminEmails: ["admin@example.com"],
    };

    it("補齊缺失的 word 發音與解釋音檔", async () => {
      const article = await createArticle(pool, { title: "Backfill" });
      const w = await getOrCreateWord(pool, "habit"); // enAudioPath 為 null
      await createExplanation(pool, {
        wordId: w.id,
        articleId: article.id,
        zhTranslation: "習慣",
        enExplanation: "a regular practice",
        // 其餘文字欄位與所有音檔皆 null
      });

      const app = buildApp({
        config: adminConfig,
        pool,
        audioDir,
        lookupDeps: makeDeps(),
      });
      const res = await app.inject({ method: "POST", url: "/lookups/backfill-audio" });
      expect(res.statusCode).toBe(200);
      // word 英文發音 + zh_translation + en_explanation 共 3 個。
      expect(res.json().fixedAudio).toBe(3);

      const word = await findWordByNormalized(pool, "habit");
      expect(word!.enAudioPath).toBeTruthy();
      const exp = await findExplanation(pool, w.id, article.id);
      expect(exp!.zhTranslationAudioPath).toBeTruthy();
      expect(exp!.enExplanationAudioPath).toBeTruthy();
      expect(exp!.enExampleAudioPath).toBeNull(); // 無文字者不補
      await app.close();
    });

    it("reader 身分 → 403 且不呼叫 TTS", async () => {
      const app = buildApp({ config, pool, audioDir, lookupDeps: makeDeps() });
      const res = await app.inject({ method: "POST", url: "/lookups/backfill-audio" });
      expect(res.statusCode).toBe(403);
      expect(synthSpy).toHaveBeenCalledTimes(0);
      await app.close();
    });
  });
});

describe("GET /articles/:id/lookups（本篇出現且全站有解釋）", () => {
  it("回本篇出現且全站任一文章有解釋的單字（normalized、排序）", async () => {
    const a1 = await createArticle(pool, { title: "Current" });
    const a2 = await createArticle(pool, { title: "Other" });
    await createParagraph(pool, {
      articleId: a1.id,
      idx: 0,
      text: "A habit and an apple.",
    });
    const wHabit = await getOrCreateWord(pool, "habit");
    const wApple = await getOrCreateWord(pool, "apple");
    const wStar = await getOrCreateWord(pool, "star");
    // habit：他篇有解釋且本篇出現 → 應列入
    await createExplanation(pool, { wordId: wHabit.id, articleId: a2.id, zhTranslation: "習慣" });
    // apple：本篇有解釋且本篇出現 → 應列入
    await createExplanation(pool, { wordId: wApple.id, articleId: a1.id, zhTranslation: "蘋果" });
    // star：有解釋但本篇文字沒出現 → 不列入
    await createExplanation(pool, { wordId: wStar.id, articleId: a2.id, zhTranslation: "星" });

    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${a1.id}/lookups` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ words: ["apple", "habit"] });
    await app.close();
  });

  it("本篇出現但全站無解釋 → 不列入（回空清單）", async () => {
    const article = await createArticle(pool, { title: "Empty" });
    await createParagraph(pool, { articleId: article.id, idx: 0, text: "A habit." });
    const app = buildApp({ config, pool });
    const res = await app.inject({ method: "GET", url: `/articles/${article.id}/lookups` });
    expect(res.json()).toEqual({ words: [] });
    await app.close();
  });
});

const adminConfig: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "admin@example.com",
  adminEmails: ["admin@example.com"],
};

describe("後台單字 CRUD", () => {
  it("GET /words 搜尋、GET /articles/:id/explanations、DELETE 解釋/單字", async () => {
    const a = await createArticle(pool, { title: "Signs of Winter" });
    const w = await getOrCreateWord(pool, "thick");
    const e = await createExplanation(pool, {
      wordId: w.id,
      articleId: a.id,
      zhTranslation: "厚",
    });
    const app = buildApp({ config: adminConfig, pool });

    const search = await app.inject({ method: "GET", url: "/words?q=thi" });
    expect(search.statusCode).toBe(200);
    expect(search.json().words[0]).toMatchObject({
      normalizedWord: "thick",
      explanationCount: 1,
    });

    const byArticle = await app.inject({
      method: "GET",
      url: `/articles/${a.id}/explanations`,
    });
    expect(byArticle.json().explanations[0].word.normalizedWord).toBe("thick");

    const delExp = await app.inject({
      method: "DELETE",
      url: `/explanations/${e.id}`,
    });
    expect(delExp.statusCode).toBe(200);
    expect(await findExplanation(pool, w.id, a.id)).toBeNull();

    const delWord = await app.inject({ method: "DELETE", url: `/words/${w.id}` });
    expect(delWord.statusCode).toBe(200);
    expect(await findWordByNormalized(pool, "thick")).toBeNull();
    await app.close();
  });

  it("DELETE 不存在的解釋/單字 → 404", async () => {
    const app = buildApp({ config: adminConfig, pool });
    expect(
      (await app.inject({ method: "DELETE", url: "/explanations/999" })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: "/words/999" })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it("reader 角色刪除 → 403", async () => {
    const a = await createArticle(pool, { title: "A" });
    const w = await getOrCreateWord(pool, "thick");
    const e = await createExplanation(pool, { wordId: w.id, articleId: a.id });
    const app = buildApp({ config, pool }); // reader
    expect(
      (await app.inject({ method: "DELETE", url: `/explanations/${e.id}` })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "DELETE", url: `/words/${w.id}` })).statusCode,
    ).toBe(403);
    await app.close();
  });
});
