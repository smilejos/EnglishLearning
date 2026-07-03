// Task 5.1 整合測試：worker 段落處理（mock LLM/TTS，對測試 DB）。
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPool,
  createArticle,
  createParagraph,
  createJob,
  listParagraphsByArticle,
  getArticleById,
  type TranslateClient,
  type TtsClient,
} from "@el/shared";
import { drainQueue, processNextJob, type WorkerDeps } from "./processor";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

let pool: ReturnType<typeof createPool>;
let audioDir: string;

beforeAll(async () => {
  pool = createPool(DATABASE_URL);
  audioDir = await mkdtemp(join(tmpdir(), "el-worker-"));
});
afterAll(async () => {
  await pool.end();
  await rm(audioDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query(
    `TRUNCATE jobs, paragraphs, articles, users RESTART IDENTITY CASCADE`,
  );
});

function okTranslate(): TranslateClient {
  return { complete: vi.fn(async () => JSON.stringify(["這是翻譯。"])) };
}
function okTts(): TtsClient {
  return {
    synthesize: vi.fn(async () => ({
      wav: Buffer.from([0x52, 0x49, 0x46, 0x46]),
      pcm: Buffer.from([1, 2]),
    })),
  };
}
function makeDeps(over?: Partial<WorkerDeps>): WorkerDeps {
  return {
    pool,
    translateClient: okTranslate(),
    ttsClient: okTts(),
    voiceEn: "VoiceEn",
    voiceZh: "VoiceZh",
    audioDir,
    maxAttempts: 3,
    staleMs: 5 * 60 * 1000,
    ...over,
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

async function jobRow(
  articleId: number,
): Promise<{ status: string; attempts: number }> {
  const r = await pool.query(
    `SELECT status, attempts FROM jobs WHERE article_id = $1 LIMIT 1`,
    [articleId],
  );
  return r.rows[0];
}

describe("worker 段落處理", () => {
  it("處理一篇兩段文章：兩段各有中英音檔與翻譯，文章 done", async () => {
    const article = await createArticle(pool, { title: "Two paragraphs" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "First.",
    });
    const p1 = await createParagraph(pool, {
      articleId: article.id,
      idx: 1,
      text: "Second.",
    });
    await createJob(pool, article.id, p0.id);
    await createJob(pool, article.id, p1.id);

    const processed = await drainQueue(makeDeps());
    expect(processed).toBe(2);

    const paras = await listParagraphsByArticle(pool, article.id);
    for (const p of paras) {
      expect(p.status).toBe("done");
      expect(p.translation).toBe("這是翻譯。");
      expect(p.enAudioPath).toBe(`articles/${article.id}/p${p.idx}.en.wav`);
      expect(p.zhAudioPath).toBe(`articles/${article.id}/p${p.idx}.zh.wav`);
      expect(await fileExists(p.enAudioPath!)).toBe(true);
      expect(await fileExists(p.zhAudioPath!)).toBe(true);
    }
    expect((await getArticleById(pool, article.id))!.status).toBe("done");
  });

  const failingTts = (): TtsClient => ({
    synthesize: vi.fn(async () => {
      throw new Error("tts down");
    }),
  });

  it("達重試上限後該段 failed、attempts=上限、文章 failed", async () => {
    const article = await createArticle(pool, { title: "Will fail" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Boom.",
    });
    await createJob(pool, article.id, p0.id);

    // maxAttempts=1：一次失敗即終態。
    const processed = await drainQueue(
      makeDeps({ ttsClient: failingTts(), maxAttempts: 1 }),
    );
    expect(processed).toBe(1);

    const [para] = await listParagraphsByArticle(pool, article.id);
    expect(para.status).toBe("failed");
    const job = await jobRow(article.id);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
    expect((await getArticleById(pool, article.id))!.status).toBe("failed");
  });

  it("未達上限的失敗會自動退回 pending 重試，達上限才 failed", async () => {
    const article = await createArticle(pool, { title: "Retry" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Boom.",
    });
    await createJob(pool, article.id, p0.id);

    const deps = makeDeps({ ttsClient: failingTts(), maxAttempts: 3 });

    // 第 1 次：attempts=1 < 3 → 退回 pending、段落 pending、文章 processing。
    await processNextJob(deps);
    expect((await jobRow(article.id)).status).toBe("pending");
    expect((await jobRow(article.id)).attempts).toBe(1);
    expect((await listParagraphsByArticle(pool, article.id))[0].status).toBe(
      "pending",
    );

    // 第 2 次 pending、第 3 次達上限 → failed。
    await processNextJob(deps);
    await processNextJob(deps);
    const job = await jobRow(article.id);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(3);
    expect((await getArticleById(pool, article.id))!.status).toBe("failed");
  });

  it("先失敗後成功：重試後該段 done、文章 done", async () => {
    const article = await createArticle(pool, { title: "Flaky" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "First.",
    });
    await createJob(pool, article.id, p0.id);

    let calls = 0;
    const flakyTts: TtsClient = {
      synthesize: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient");
        return {
          wav: Buffer.from([0x52, 0x49, 0x46, 0x46]),
          pcm: Buffer.from([1, 2]),
        };
      }),
    };
    const deps = makeDeps({ ttsClient: flakyTts, maxAttempts: 3 });

    await processNextJob(deps); // 第一次失敗 → pending
    await processNextJob(deps); // 第二次成功 → done
    expect((await listParagraphsByArticle(pool, article.id))[0].status).toBe(
      "done",
    );
    expect((await getArticleById(pool, article.id))!.status).toBe("done");
  });

  it("stuck-job 回收：processing 超過 staleMs 的 job 會被重新認領", async () => {
    const article = await createArticle(pool, { title: "Stuck" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "First.",
    });
    const job = await createJob(pool, article.id, p0.id);
    // 模擬崩潰：手動把 job 設為 processing 且 updated_at 久遠。
    await pool.query(
      `UPDATE jobs SET status='processing', updated_at = now() - interval '10 minutes' WHERE id=$1`,
      [job.id],
    );

    // staleMs 設小，回收並完成。
    const did = await processNextJob(makeDeps({ staleMs: 1000 }));
    expect(did).toBe(true);
    expect((await jobRow(article.id)).status).toBe("done");
    expect((await getArticleById(pool, article.id))!.status).toBe("done");
  });

  it("某段失敗、另一段成功時，文章終態為 failed（不卡在 processing）", async () => {
    const article = await createArticle(pool, { title: "Mixed" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "First.",
    });
    const p1 = await createParagraph(pool, {
      articleId: article.id,
      idx: 1,
      text: "Boom.",
    });
    await createJob(pool, article.id, p0.id);
    await createJob(pool, article.id, p1.id);

    // 對 "Boom." 的英文 TTS 拋錯，使 p1 失敗、p0 成功。
    const selectiveTts: TtsClient = {
      synthesize: vi.fn(async (text: string) => {
        if (text === "Boom.") throw new Error("tts down");
        return {
          wav: Buffer.from([0x52, 0x49, 0x46, 0x46]),
          pcm: Buffer.from([1, 2]),
        };
      }),
    };
    // maxAttempts=1：p1 一次失敗即終態，避免重試使處理數變動。
    const processed = await drainQueue(
      makeDeps({ ttsClient: selectiveTts, maxAttempts: 1 }),
    );
    expect(processed).toBe(2);

    const paras = await listParagraphsByArticle(pool, article.id);
    expect(paras.find((p) => p.idx === 0)!.status).toBe("done");
    expect(paras.find((p) => p.idx === 1)!.status).toBe("failed");
    // 關鍵：文章終態為 failed，不會卡在 processing。
    expect((await getArticleById(pool, article.id))!.status).toBe("failed");
  });

  it("僅完成部分段落時，文章為 processing", async () => {
    const article = await createArticle(pool, { title: "Partial" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "First.",
    });
    await createParagraph(pool, {
      articleId: article.id,
      idx: 1,
      text: "Second.",
    });
    await createJob(pool, article.id, p0.id); // 僅第一段有 job

    expect(await processNextJob(makeDeps())).toBe(true);
    expect((await getArticleById(pool, article.id))!.status).toBe("processing");
  });

  it("佇列為空時 drainQueue 回 0", async () => {
    expect(await drainQueue(makeDeps())).toBe(0);
  });
});
