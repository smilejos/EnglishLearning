// 段落處理：認領 job → 翻譯 → 中英 TTS → 寫兩個 wav → 段落 done；
// 全段完成則文章 done；任一步失敗則段落／文章 failed、job attempts++ 並記 error。
import {
  claimNextJob,
  getParagraphById,
  updateParagraphResult,
  setParagraphStatus,
  setArticleStatus,
  markJobDone,
  markJobFailed,
  countUnfinishedParagraphs,
  translateParagraph,
  type DbPool,
  type TranslateClient,
  type TtsClient,
} from "@el/shared";
import { writeAudio } from "./audio";

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

    // 認領後文章進入 processing。
    await setArticleStatus(deps.pool, job.articleId, "processing");

    const translation = await translateParagraph(
      paragraph.text,
      deps.translateClient,
    );

    // 英文語音念原文、中文語音念翻譯。
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

    await updateParagraphResult(deps.pool, paragraph.id, {
      translation,
      enAudioPath,
      zhAudioPath,
      status: "done",
    });
    await markJobDone(deps.pool, job.id);

    // 全段完成 → 文章 done。
    if ((await countUnfinishedParagraphs(deps.pool, job.articleId)) === 0) {
      await setArticleStatus(deps.pool, job.articleId, "done");
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobFailed(deps.pool, job.id, message);
    await setParagraphStatus(deps.pool, job.paragraphId, "failed");
    await setArticleStatus(deps.pool, job.articleId, "failed");
    return true;
  }
}

/** 持續處理直到佇列清空（每輪迴圈呼叫一次）。回傳本輪處理的 job 數。 */
export async function drainQueue(deps: WorkerDeps): Promise<number> {
  let count = 0;
  while (await processNextJob(deps)) count++;
  return count;
}
