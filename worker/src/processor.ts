// 段落處理：認領 job → 翻譯 → 中英 TTS → 寫兩個 wav → 段落 done；
// 全段完成則文章 done；任一步失敗則段落／文章 failed、job attempts++ 並記 error。
import {
  claimNextJob,
  getParagraphById,
  updateParagraphResult,
  setParagraphStatus,
  setArticleStatus,
  markArticleProcessingIfPending,
  markJobDone,
  markJobFailed,
  countParagraphsByStatus,
  withTransaction,
  translateParagraph,
  type Queryable,
  type DbPool,
  type TranslateClient,
  type TtsClient,
} from "@el/shared";
import { writeAudio } from "./audio";

/**
 * 依段落狀態重算並寫入文章終態（冪等，併發安全）：
 * 尚有 pending/processing → processing；否則有 failed → failed；全 done → done。
 */
async function recomputeArticleStatus(
  db: Queryable,
  articleId: number,
): Promise<void> {
  const c = await countParagraphsByStatus(db, articleId);
  const status =
    c.pending + c.processing > 0
      ? "processing"
      : c.failed > 0
        ? "failed"
        : "done";
  await setArticleStatus(db, articleId, status);
}

export interface WorkerDeps {
  pool: DbPool;
  translateClient: TranslateClient;
  ttsClient: TtsClient;
  voiceEn: string;
  voiceZh: string;
  audioDir: string;
}

/**
 * 認領並處理下一個 pending job。
 * @returns 有處理（成功或失敗）回 true；佇列為空回 false。
 */
export async function processNextJob(deps: WorkerDeps): Promise<boolean> {
  const job = await claimNextJob(deps.pool);
  if (!job) return false;

  try {
    const paragraph = await getParagraphById(deps.pool, job.paragraphId);
    if (!paragraph) throw new Error(`paragraph ${job.paragraphId} not found`);

    // 認領後文章進入 processing（僅當仍為 pending，不覆寫 sibling 造成的終態）。
    await markArticleProcessingIfPending(deps.pool, job.articleId);

    const translation = await translateParagraph(
      paragraph.text,
      deps.translateClient,
    );

    // 英文語音念原文、中文語音念翻譯。音檔寫盤在交易外（與 lookups 一致）。
    const en = await deps.ttsClient.synthesize(paragraph.text, deps.voiceEn);
    const zh = await deps.ttsClient.synthesize(translation, deps.voiceZh);
    const enAudioPath = await writeAudio(
      deps.audioDir,
      `articles/${job.articleId}/p${paragraph.idx}.en.wav`,
      en.wav,
    );
    const zhAudioPath = await writeAudio(
      deps.audioDir,
      `articles/${job.articleId}/p${paragraph.idx}.zh.wav`,
      zh.wav,
    );

    // DB 寫入於單一交易內：段落 done + job done + 重算文章狀態。
    await withTransaction(deps.pool, async (tx) => {
      await updateParagraphResult(tx, paragraph.id, {
        translation,
        enAudioPath,
        zhAudioPath,
        status: "done",
      });
      await markJobDone(tx, job.id);
      await recomputeArticleStatus(tx, job.articleId);
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 失敗路徑同樣交易化：job failed + 段落 failed + 重算文章狀態。
    await withTransaction(deps.pool, async (tx) => {
      await markJobFailed(tx, job.id, message);
      await setParagraphStatus(tx, job.paragraphId, "failed");
      await recomputeArticleStatus(tx, job.articleId);
    });
    return true;
  }
}

/** 持續處理直到佇列清空（每輪迴圈呼叫一次）。回傳本輪處理的 job 數。 */
export async function drainQueue(deps: WorkerDeps): Promise<number> {
  let count = 0;
  while (await processNextJob(deps)) count++;
  return count;
}
