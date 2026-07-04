// 單字查詢路由。GET 既有解釋清單；POST 重新解釋（即時、互動式）；POST 補缺音檔（admin）。
import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import {
  normalizeWord,
  findWordByNormalized,
  listExplanationsByWord,
  listGloballyExplainedWordsInArticle,
  getOrCreateWord,
  setWordEnAudioPath,
  findExplanation,
  createExplanation,
  getParagraphById,
  getArticleById,
  withTransaction,
  explainWord,
  WordLookupRequestSchema,
  writeAudioEncoded,
  listWordsMissingEnAudio,
  listExplanationsMissingAudio,
  updateExplanationAudioPaths,
  searchWords,
  deleteWord,
  listExplanationsByArticle,
  deleteExplanation,
  removeAudioDir,
  type DbPool,
  type ExplainClient,
  type TtsClient,
  type AudioFormat,
  type ExplanationAudioPaths,
} from "@el/shared";
import { requireAdmin } from "../auth";
import type { LookupLimiter } from "../rateLimit";

/** 重新解釋所需的 LLM／TTS 依賴與音檔設定（注入以利測試 mock）。 */
export interface LookupDeps {
  explainClient: ExplainClient;
  ttsClient: TtsClient;
  voiceEn: string;
  voiceZh: string;
  audioDir: string;
  audioFormat: AudioFormat;
}

export function registerLookupRoutes(
  app: FastifyInstance,
  pool: DbPool,
  audioDir?: string,
  deps?: LookupDeps,
  limiter?: LookupLimiter,
): void {
  // 某單字的所有既有解釋（含各自來源文章，依 created_at 排序）。
  app.get("/words/:word/explanations", async (request) => {
    const normalized = normalizeWord((request.params as { word: string }).word);
    const word = await findWordByNormalized(pool, normalized);
    if (!word) return { word: null, explanations: [] };
    const explanations = await listExplanationsByWord(pool, word.id);
    return { word, explanations };
  });

  // 某文章已解釋過的單字清單（前台標示已查單字用）。
  app.get("/articles/:id/lookups", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "invalid article id" });
    }
    return { words: await listGloballyExplainedWordsInArticle(pool, id) };
  });

  // 後台：單字搜尋（含各字解釋數）。
  app.get("/words", { preHandler: requireAdmin }, async (request) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return { words: await searchWords(pool, q ?? "", n) };
  });

  // 後台：某文章產生過的解釋（含單字），文章內清單用。
  app.get(
    "/articles/:id/explanations",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: "invalid article id" });
      }
      return { explanations: await listExplanationsByArticle(pool, id) };
    },
  );

  // 後台：刪除單一解釋（並盡力清該解釋音檔目錄）。
  app.delete(
    "/explanations/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const removed = await deleteExplanation(pool, id);
      if (!removed) return reply.code(404).send({ error: "explanation not found" });
      if (audioDir) {
        await removeAudioDir(
          audioDir,
          `words/${removed.wordId}/a${removed.articleId}`,
        );
      }
      return { ok: true };
    },
  );

  // 後台：刪除整個單字（cascade 解釋；並盡力清該單字整包音檔）。
  app.delete(
    "/words/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const removed = await deleteWord(pool, id);
      if (removed === null) return reply.code(404).send({ error: "word not found" });
      if (audioDir) await removeAudioDir(audioDir, `words/${id}`);
      return { ok: true };
    },
  );

  // 重新解釋：{ articleId, paragraphId, word } → 快取命中即回；未命中則
  // 呼叫 LLM 產生解釋與例句、各項 TTS（含 word 英文發音若缺），寫入後回傳。
  if (!deps) return;

  // TTS 盡力而為：單項失敗記 log 回 null（文字照存，之後可用 backfill 補齊）。
  const trySynth = async (
    log: FastifyBaseLogger,
    text: string,
    voice: string,
    relBase: string,
  ): Promise<string | null> => {
    try {
      const { wav } = await deps.ttsClient.synthesize(text, voice);
      return await writeAudioEncoded(deps.audioDir, relBase, wav, {
        format: deps.audioFormat,
      });
    } catch (err) {
      log.warn({ evt: "tts_failed", rel: relBase, err: (err as Error).message });
      return null;
    }
  };

  app.post("/lookups", async (request, reply) => {
    const parsed = WordLookupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const { articleId, paragraphId, word: rawWord } = parsed.data;

    const article = await getArticleById(pool, articleId);
    if (!article) return reply.code(404).send({ error: "article not found" });
    const paragraph = await getParagraphById(pool, paragraphId);
    if (!paragraph) {
      return reply.code(404).send({ error: "paragraph not found" });
    }

    const startedAt = Date.now();
    const normalized = normalizeWord(rawWord);
    const word = await getOrCreateWord(pool, normalized);

    // 快取命中：直接回該文章既有解釋（不呼叫任何 LLM）。
    const cached = await findExplanation(pool, word.id, articleId);
    if (cached) {
      request.log.info({
        evt: "lookup",
        word: normalized,
        articleId,
        cache: true,
        ms: Date.now() - startedAt,
      });
      return {
        word,
        explanation: { ...cached, article: { id: article.id, title: article.title } },
      };
    }

    // 快取未命中將呼叫 LLM/TTS：先過用量韁繩（per-user／全站每日）。
    if (limiter) {
      const scope = limiter.tryAcquire(request.user!.id);
      if (scope !== null) {
        request.log.warn({ evt: "lookup_limited", scope, word: normalized, articleId });
        return reply.code(429).send({
          error:
            scope === "user"
              ? "查詢太頻繁了，休息一下再試。"
              : "今日全站查詢額度已用完，明天再來吧。",
          scope,
        });
      }
    }

    // 未命中：產生解釋文字。
    const content = await explainWord(
      normalized,
      paragraph.text,
      deps.explainClient,
    );

    // word 英文發音（跨解釋共用，缺則補；失敗則維持 null）。
    let enAudioPath = word.enAudioPath;
    if (!enAudioPath) {
      enAudioPath = await trySynth(
        request.log,
        normalized,
        deps.voiceEn,
        `words/${word.id}/en`,
      );
    }

    // 解釋／例句各項 TTS（英文用 voiceEn、中文用 voiceZh）。
    const base = `words/${word.id}/a${articleId}`;
    const [
      enExplanationAudioPath,
      enExampleAudioPath,
      zhTranslationAudioPath,
      zhExplanationAudioPath,
      zhExampleAudioPath,
    ] = await Promise.all([
      trySynth(request.log, content.en_explanation, deps.voiceEn, `${base}/en_explanation`),
      trySynth(request.log, content.en_example, deps.voiceEn, `${base}/en_example`),
      trySynth(request.log, content.zh_translation, deps.voiceZh, `${base}/zh_translation`),
      trySynth(request.log, content.zh_explanation, deps.voiceZh, `${base}/zh_explanation`),
      trySynth(request.log, content.zh_example, deps.voiceZh, `${base}/zh_example`),
    ]);

    let explanation;
    try {
      explanation = await withTransaction(pool, async (tx) => {
        if (!word.enAudioPath && enAudioPath) {
          await setWordEnAudioPath(tx, word.id, enAudioPath);
        }
        return createExplanation(tx, {
          wordId: word.id,
          articleId,
          paragraphId,
          enExplanation: content.en_explanation,
          enExplanationAudioPath,
          enExample: content.en_example,
          enExampleAudioPath,
          zhTranslation: content.zh_translation,
          zhTranslationAudioPath,
          zhExplanation: content.zh_explanation,
          zhExplanationAudioPath,
          zhExample: content.zh_example,
          zhExampleAudioPath,
          headword: content.headword,
        });
      });
    } catch (err) {
      // 併發首查同 (word, article)：另一請求已先寫入（唯一鍵 23505）。
      // 視為快取命中，回既有解釋而非 500。
      if ((err as { code?: string }).code === "23505") {
        const existing = await findExplanation(pool, word.id, articleId);
        if (existing) {
          return {
            word: { ...word, enAudioPath },
            explanation: {
              ...existing,
              article: { id: article.id, title: article.title },
            },
          };
        }
      }
      throw err;
    }

    request.log.info({
      evt: "lookup",
      word: normalized,
      articleId,
      cache: false,
      ms: Date.now() - startedAt,
    });
    return reply.code(201).send({
      word: { ...word, enAudioPath },
      explanation: { ...explanation, article: { id: article.id, title: article.title } },
    });
  });

  // 補齊缺失音檔（admin）：掃描缺英文發音的單字與缺音的解釋，逐項補產。
  app.post(
    "/lookups/backfill-audio",
    { preHandler: requireAdmin },
    async (request) => {
      const words = await listWordsMissingEnAudio(pool, 10);
      const explanations = await listExplanationsMissingAudio(pool, 10);
      let fixed = 0;

      for (const w of words) {
        const p = await trySynth(request.log, w.normalizedWord, deps.voiceEn, `words/${w.id}/en`);
        if (p) {
          await setWordEnAudioPath(pool, w.id, p);
          fixed += 1;
        }
      }

      for (const e of explanations) {
        const base = `words/${e.wordId}/a${e.articleId}`;
        const patch: ExplanationAudioPaths = {};
        if (e.enExplanation && !e.enExplanationAudioPath)
          patch.enExplanationAudioPath = await trySynth(request.log, e.enExplanation, deps.voiceEn, `${base}/en_explanation`);
        if (e.enExample && !e.enExampleAudioPath)
          patch.enExampleAudioPath = await trySynth(request.log, e.enExample, deps.voiceEn, `${base}/en_example`);
        if (e.zhTranslation && !e.zhTranslationAudioPath)
          patch.zhTranslationAudioPath = await trySynth(request.log, e.zhTranslation, deps.voiceZh, `${base}/zh_translation`);
        if (e.zhExplanation && !e.zhExplanationAudioPath)
          patch.zhExplanationAudioPath = await trySynth(request.log, e.zhExplanation, deps.voiceZh, `${base}/zh_explanation`);
        if (e.zhExample && !e.zhExampleAudioPath)
          patch.zhExampleAudioPath = await trySynth(request.log, e.zhExample, deps.voiceZh, `${base}/zh_example`);
        const got = Object.values(patch).filter(Boolean).length;
        if (got > 0) await updateExplanationAudioPaths(pool, e.id, patch);
        fixed += got;
      }

      return {
        fixedAudio: fixed,
        scannedWords: words.length,
        scannedExplanations: explanations.length,
      };
    },
  );
}
