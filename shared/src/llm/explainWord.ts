// 單字解釋產生器（新增）。帶入點擊段落脈絡，產生中英解釋與例句。
// 輸出為 Zod 驗證的 5 欄 JSON，缺欄位／格式錯誤時重試，用盡則拋錯。
import { z } from "zod";
import { stripFences } from "./json";
import { generateContent, firstText } from "./genai";
import type { Authorizer } from "./auth";
import { withRetry } from "./retry";

/** explainWord 的輸出契約（欄位名與設計 §4 word_explanations 文字欄位對應）。 */
export const WordExplanationContentSchema = z.object({
  en_explanation: z.string().min(1),
  zh_translation: z.string().min(1),
  zh_explanation: z.string().min(1),
  en_example: z.string().min(1),
  zh_example: z.string().min(1),
  headword: z.string().min(1),
});
export type WordExplanationContent = z.infer<typeof WordExplanationContentSchema>;

/** 低階文字完成 client，回傳原始字串（預期為 JSON 物件）。 */
export interface ExplainClient {
  complete(prompt: string): Promise<string>;
}

const PROMPT = (word: string, context: string) =>
  `You are helping a Traditional Chinese (zh-TW) speaker learn English vocabulary in context.
The reader clicked the word "${word}" while reading this paragraph:
"""
${context}
"""

First decide whether the clicked word is part of a larger meaningful unit in THIS context — a phrasal verb, idiom, or compound (e.g. "added to", "six-pointed"). If so, explain the whole phrase; otherwise explain just the clicked word. Return ONLY a JSON object with exactly these string fields:
- "headword": the exact word or phrase (as it appears in the paragraph) that you are explaining. Use the full phrase when the clicked word is part of one; otherwise use the clicked word.
- "en_explanation": a concise English explanation of the headword's meaning in this context.
- "zh_translation": the Traditional Chinese (zh-TW) translation of the headword in this context.
- "zh_explanation": a concise Traditional Chinese (zh-TW) explanation of the headword's meaning.
- "en_example": one natural English example sentence using the headword.
- "zh_example": the Traditional Chinese (zh-TW) translation of that example sentence.

Do not add notes or any text outside the JSON object.`;

export interface ExplainOpts {
  retries?: number;
  /** 重試間隔基數（測試可設 0）；實際等待為 base × 2^attempt。 */
  baseDelayMs?: number;
}

/**
 * 為單字（帶段落脈絡）產生中英解釋與例句。
 * 呼叫與解析都在重試範圍內（同 generateTranslations：先前 complete() 在 try
 * 之外，網路錯誤不會重試）。配額錯誤由 withRetry 快速失敗。
 * @returns 通過 schema 的 5 欄內容；多次嘗試後仍失敗則拋錯。
 */
export async function explainWord(
  word: string,
  contextParagraph: string,
  client: ExplainClient,
  opts: ExplainOpts = {},
): Promise<WordExplanationContent> {
  const retries = opts.retries ?? 2;
  try {
    return await withRetry(
      async () => {
        const raw = await client.complete(PROMPT(word, contextParagraph));
        return WordExplanationContentSchema.parse(JSON.parse(stripFences(raw)));
      },
      { retries, baseDelayMs: opts.baseDelayMs ?? 500 },
    );
  } catch (err) {
    throw new Error(
      `Word explanation failed after ${retries + 1} attempts: ${String(err)}`,
    );
  }
}

export interface GeminiExplainOptions {
  auth: Authorizer;
  model?: string;
}

export class GeminiExplainClient implements ExplainClient {
  private auth: Authorizer;
  private model: string;

  constructor(opts: GeminiExplainOptions) {
    this.auth = opts.auth;
    this.model = opts.model ?? "gemini-2.5-flash";
  }

  async complete(prompt: string): Promise<string> {
    const res = await generateContent(
      this.model,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      },
      this.auth,
    );
    return firstText(res);
  }
}
