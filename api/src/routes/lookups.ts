// 單字查詢路由。GET 既有解釋清單；POST 重新解釋（即時、互動式）。
import type { FastifyInstance } from "fastify";
import {
  normalizeWord,
  findWordByNormalized,
  listExplanationsByWord,
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
  type DbPool,
  type ExplainClient,
  type TtsClient,
  type AudioFormat,
} from "@el/shared";
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

  // 重新解釋：{ articleId, paragraphId, word } → 快取命中即回；未命中則
  // 呼叫 LLM 產生解釋與例句、各項 TTS（含 word 英文發音若缺），寫入後回傳。
  if (!deps) return;

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

    // 各段 TTS 盡力而為：單段失敗（例如 Gemini 對極短文字回 finishReason OTHER）
    // 不應使整個查詢失敗——記錄並以 null 帶過，解釋文字照存、之後可補。
    const trySynth = async (
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
        request.log.warn({
          evt: "tts_failed",
          rel: relBase,
          err: (err as Error).message,
        });
        return null;
      }
    };

    // word 英文發音（跨解釋共用，缺則補；失敗則維持 null）。
    let enAudioPath = word.enAudioPath;
    if (!enAudioPath) {
      enAudioPath = await trySynth(
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
      trySynth(content.en_explanation, deps.voiceEn, `${base}/en_explanation`),
      trySynth(content.en_example, deps.voiceEn, `${base}/en_example`),
      trySynth(content.zh_translation, deps.voiceZh, `${base}/zh_translation`),
      trySynth(content.zh_explanation, deps.voiceZh, `${base}/zh_explanation`),
      trySynth(content.zh_example, deps.voiceZh, `${base}/zh_example`),
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
}
