// 段落翻譯 client（移植自 article2speech/builder/src/translate.ts）。
// 保留批次 generateTranslations，並新增單段 translateParagraph 便利函式。
import { z } from "zod";
import { stripFences } from "./json";
import { generateContent, firstText } from "./genai";
import type { Authorizer } from "./auth";

/** 低階文字完成 client，回傳原始字串（預期為 JSON 陣列）。 */
export interface TranslateClient {
  complete(prompt: string): Promise<string>;
}

const PROMPT = (paragraphs: string[]) =>
  `You are translating an English self-learning article for Traditional Chinese (zh-TW) speakers.
Translate each paragraph below into natural Traditional Chinese (zh-TW).
Return ONLY a JSON array of strings: exactly one translation per input paragraph, in the same order, with exactly ${paragraphs.length} items. Do not add notes.

Paragraphs (JSON):
${JSON.stringify(paragraphs)}`;

const TranslationList = z.array(z.string());

export interface TranslateOpts {
  retries?: number;
}

/** 批次翻譯多段，回傳與輸入同序、同長度的繁中字串陣列。 */
export async function generateTranslations(
  paragraphs: string[],
  client: TranslateClient,
  opts: TranslateOpts = {},
): Promise<string[]> {
  if (paragraphs.length === 0) return [];
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const raw = await client.complete(PROMPT(paragraphs));
    try {
      const parsed = TranslationList.parse(JSON.parse(stripFences(raw)));
      if (parsed.length !== paragraphs.length) {
        throw new Error(
          `expected ${paragraphs.length} translations, got ${parsed.length}`,
        );
      }
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Translation failed after ${retries + 1} attempts: ${String(lastErr)}`,
  );
}

/** 翻譯單一段落，回傳繁中字串（worker 逐段處理用）。 */
export async function translateParagraph(
  text: string,
  client: TranslateClient,
  opts: TranslateOpts = {},
): Promise<string> {
  const [translation] = await generateTranslations([text], client, opts);
  return translation;
}

export interface GeminiTranslateOptions {
  auth: Authorizer;
  model?: string;
}

export class GeminiTranslateClient implements TranslateClient {
  private auth: Authorizer;
  private model: string;

  constructor(opts: GeminiTranslateOptions) {
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
