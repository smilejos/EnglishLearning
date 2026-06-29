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
import { drainQueue, type WorkerDeps } from "./processor";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5432/english_learning";

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

  it("TTS 拋錯時該段 failed、job attempts 增加、文章 failed", async () => {
    const article = await createArticle(pool, { title: "Will fail" });
    const p0 = await createParagraph(pool, {
      articleId: article.id,
      idx: 0,
      text: "Boom.",
    });
    await createJob(pool, article.id, p0.id);

    const failingTts: TtsClient = {
      synthesize: vi.fn(async () => {
        throw new Error("tts down");
      }),
    };
    const processed = await drainQueue(makeDeps({ ttsClient: failingTts }));
    expect(processed).toBe(1);

    const [para] = await listParagraphsByArticle(pool, article.id);
    expect(para.status).toBe("failed");
    const job = await jobRow(article.id);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(1);
    expect((await getArticleById(pool, article.id))!.status).toBe("failed");
  });

  it("佇列為空時 drainQueue 回 0", async () => {
    expect(await drainQueue(makeDeps())).toBe(0);
  });
});
