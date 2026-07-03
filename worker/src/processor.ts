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
  requeueJob,
  countParagraphsByStatus,
  withTransaction,
  translateParagraph,
  listParagraphsByArticle,
  generateTranslations,
  writeAudioEncoded,
  type Queryable,
  type DbPool,
  type TranslateClient,
  type TtsClient,
  type AudioFormat,
} from "@el/shared";

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
  audioFormat: AudioFormat;
  /** 達此嘗試次數仍失敗才標 failed；未達則自動退回 pending 重試。 */
  maxAttempts: number;
  /** processing 超過此毫秒數視為崩潰並回收（visibility timeout）。 */
  staleMs: number;
}

/**
 * 認領並處理下一個 pending job。
 * @returns 有處理（成功或失敗）回 true；佇列為空回 false。
 */
/** 結構化計時日誌（單行 JSON，便於聚合）。 */
function logJob(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ evt: "job", ...fields }));
}

/**
 * 確保整篇文章的段落翻譯就緒（文章級批次）：
 * 跨段脈絡一致、LLM 呼叫由 N 次降為 1 次。
 * 批次失敗時靜默返回，由呼叫端逐段翻譯自行重試（粒度退回單段）。
 */
export async function ensureArticleTranslations(
  db: Queryable,
  translateClient: TranslateClient,
  articleId: number,
): Promise<void> {
  const paragraphs = await listParagraphsByArticle(db, articleId);
  const missing = paragraphs.filter((p) => p.translation == null);
  if (missing.length <= 1) return; // 單段直接走逐段路徑，不多花一次批次呼叫
  try {
    const translations = await generateTranslations(
      missing.map((p) => p.text),
      translateClient,
    );
    for (let i = 0; i < missing.length; i++) {
      await updateParagraphResult(db, missing[i].id, {
        translation: translations[i],
      });
    }
  } catch {
    // 批次失敗（格式錯誤／額度等）：不拋錯，讓各 job 的單段翻譯自行重試。
  }
}

export async function processNextJob(deps: WorkerDeps): Promise<boolean> {
  const job = await claimNextJob(deps.pool, deps.staleMs);
  if (!job) return false;
  const startedAt = Date.now();

  try {
    const paragraph = await getParagraphById(deps.pool, job.paragraphId);
    if (!paragraph) throw new Error(`paragraph ${job.paragraphId} not found`);

    // 認領後文章進入 processing（僅當仍為 pending，不覆寫 sibling 造成的終態）。
    await markArticleProcessingIfPending(deps.pool, job.articleId);

    // 翻譯三段式：已有翻譯直接用（單段重做除外，見 clearParagraphResult）；
    // 缺翻譯先嘗試文章級批次；批次未涵蓋（單段文章／批次失敗）退回單段。
    let translation = paragraph.translation;
    if (translation == null) {
      await ensureArticleTranslations(deps.pool, deps.translateClient, job.articleId);
      translation =
        (await getParagraphById(deps.pool, job.paragraphId))?.translation ?? null;
    }
    if (translation == null) {
      translation = await translateParagraph(paragraph.text, deps.translateClient);
    }

    // 英文語音念原文、中文語音念翻譯；兩者互不依賴，並行以縮短單段處理時間。
    // 音檔寫盤在交易外（與 lookups 一致）。
    const [en, zh] = await Promise.all([
      deps.ttsClient.synthesize(paragraph.text, deps.voiceEn),
      deps.ttsClient.synthesize(translation, deps.voiceZh),
    ]);
    const enAudioPath = await writeAudioEncoded(
      deps.audioDir,
      `articles/${job.articleId}/p${paragraph.idx}.en`,
      en.wav,
      { format: deps.audioFormat },
    );
    const zhAudioPath = await writeAudioEncoded(
      deps.audioDir,
      `articles/${job.articleId}/p${paragraph.idx}.zh`,
      zh.wav,
      { format: deps.audioFormat },
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
    logJob({
      jobId: job.id,
      articleId: job.articleId,
      paragraphId: job.paragraphId,
      attempt: job.attempts,
      outcome: "done",
      ms: Date.now() - startedAt,
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const terminal = job.attempts >= deps.maxAttempts;
    // 失敗路徑交易化。未達上限 → 退回 pending 自動重試；達上限 → 終態 failed。
    await withTransaction(deps.pool, async (tx) => {
      if (terminal) {
        await markJobFailed(tx, job.id, message);
        await setParagraphStatus(tx, job.paragraphId, "failed");
      } else {
        await requeueJob(tx, job.id, message);
        await setParagraphStatus(tx, job.paragraphId, "pending");
      }
      await recomputeArticleStatus(tx, job.articleId);
    });
    logJob({
      jobId: job.id,
      articleId: job.articleId,
      paragraphId: job.paragraphId,
      attempt: job.attempts,
      outcome: terminal ? "failed" : "retry",
      ms: Date.now() - startedAt,
      error: message,
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
