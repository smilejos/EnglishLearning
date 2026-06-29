// Gemini Developer API `generateContent` REST 呼叫（移植自 article2speech/builder/src/genai.ts，內容不變）。
import type { Authorizer } from "./auth";

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// 單次 LLM 呼叫的逾時上界，避免連線卡死導致 worker tick 永不返回。
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 60000);

export interface GenPart {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
}
export interface GenCandidate {
  content?: { parts?: GenPart[] };
  finishReason?: string;
}
export interface GenResponse {
  candidates?: GenCandidate[];
}

export interface GenRequest {
  contents: { parts: { text: string }[] }[];
  generationConfig?: Record<string, unknown>;
}

/** 以指定授權對 Gemini Developer API 的 `generateContent` 發 REST 請求。 */
export async function generateContent(
  model: string,
  request: GenRequest,
  auth: Authorizer,
): Promise<GenResponse> {
  const res = await fetch(ENDPOINT(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await auth.headers()) },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `Gemini request failed (${res.status}): ${text.slice(0, 300)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as GenResponse;
}

/** 便利函式：取第一個 candidate part 的文字（供 JSON／文字完成使用）。 */
export function firstText(res: GenResponse): string {
  return res.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
