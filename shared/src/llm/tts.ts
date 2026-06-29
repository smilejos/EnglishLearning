// Gemini TTS client（移植自 article2speech/builder/src/tts.ts）。
// 調整：synthesize 改以參數選 voice，使同一 client 可產生中英雙語音
// （voice 由各服務以 GEMINI_TTS_VOICE_EN / _ZH 環境變數帶入）。
import { pcmToWav, TTS_FORMAT } from "./wav";
import { generateContent } from "./genai";
import type { Authorizer } from "./auth";

export interface TtsResult {
  wav: Buffer;
  pcm: Buffer;
}

/** 為單段文字以指定 voice 產生朗讀音訊。 */
export interface TtsClient {
  synthesize(text: string, voiceName: string): Promise<TtsResult>;
}

export interface RetryOpts {
  retries: number;
  baseDelayMs: number;
}

/** 配額／速率限制錯誤在一輪內不會恢復，不浪費重試。 */
export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const s = `${e?.status ?? ""} ${e?.message ?? ""}`;
  return s.includes("429") || s.includes("RESOURCE_EXHAUSTED");
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isQuotaError(err)) throw err; // 配額錯誤快速失敗，重試無益
      if (attempt < opts.retries) {
        const delay = opts.baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export interface GeminiTtsOptions {
  auth: Authorizer;
  model?: string;
  retries?: number;
}

export class GeminiTtsClient implements TtsClient {
  private auth: Authorizer;
  private model: string;
  private retries: number;

  constructor(opts: GeminiTtsOptions) {
    this.auth = opts.auth;
    this.model = opts.model ?? "gemini-2.5-flash-preview-tts";
    this.retries = opts.retries ?? 5;
  }

  async synthesize(text: string, voiceName: string): Promise<TtsResult> {
    return withRetry(
      async () => {
        const res = await generateContent(
          this.model,
          {
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } },
              },
            },
          },
          this.auth,
        );
        const cand = res.candidates?.[0];
        const b64 = cand?.content?.parts?.[0]?.inlineData?.data;
        if (!b64) {
          throw new Error(
            `Gemini TTS returned no audio data (model: ${this.model}, finishReason: ${cand?.finishReason ?? "none"})`,
          );
        }
        const pcm = Buffer.from(b64, "base64");
        return { pcm, wav: pcmToWav(pcm, TTS_FORMAT) };
      },
      { retries: this.retries, baseDelayMs: 500 },
    );
  }
}
