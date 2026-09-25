import type { ExplainClient } from "./explainWord";
import type { TranslateClient } from "./translate";
import type { TtsClient, TtsResult } from "./tts";
import { pcmToWav, TTS_FORMAT } from "./wav";

export interface OpenAIClientOptions {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  /** 翻譯回傳 JSON 陣列，不能使用只允許物件的 json_object 模式。 */
  responseFormat?: "json_object" | "text";
}

interface OpenAIResponse {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

function requestError(status: number): Error & { status: number } {
  // Do not include an upstream body: it can echo the key or article content.
  const error = new Error(`OpenAI request failed (${status})`) as Error & {
    status: number;
  };
  error.status = status;
  return error;
}

function outputText(body: OpenAIResponse): string {
  if (body.status === "incomplete")
    throw new Error(`OpenAI response incomplete (${body.incomplete_details?.reason ?? "unknown"})`);
  if (body.status && body.status !== "completed")
    throw new Error(`OpenAI response status: ${body.status}`);
  const text = body.output
    ?.filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("") ?? "";
  if (!text.trim()) throw new Error("OpenAI response contained no text");
  return text;
}

/** Responses API JSON completion shared by translation and word explanation. */
export class OpenAITextClient implements TranslateClient, ExplainClient {
  constructor(private readonly opts: OpenAIClientOptions) {}

  async complete(prompt: string): Promise<string> {
    const response = await (this.opts.fetcher ?? fetch)(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.opts.model,
          input: prompt,
          ...(this.opts.responseFormat === "text" ? {} : { text: { format: { type: "json_object" } } }),
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) throw requestError(response.status);
    return outputText((await response.json()) as OpenAIResponse);
  }
}

/** The speech API's raw PCM is 24 kHz, signed 16-bit, mono, little-endian. */
export class OpenAITtsClient implements TtsClient {
  constructor(private readonly opts: OpenAIClientOptions) {}

  async synthesize(text: string, voiceName: string): Promise<TtsResult> {
    const response = await (this.opts.fetcher ?? fetch)(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.opts.model,
          input: text,
          voice: voiceName,
          response_format: "pcm",
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) throw requestError(response.status);
    const pcm = Buffer.from(await response.arrayBuffer());
    if (!pcm.length || pcm.length % 2) throw new Error("OpenAI speech returned invalid PCM");
    return { pcm, wav: pcmToWav(pcm, TTS_FORMAT) };
  }
}
