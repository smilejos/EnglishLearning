// api 呼叫封裝。同源部署；開發時由 Vite proxy 轉發到本機 api。
import type {
  Article,
  Paragraph,
  WordExplanation,
  WordLookupResponse,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // 非 JSON 錯誤內容：保留狀態碼訊息。
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export function listArticles(): Promise<{ articles: Article[] }> {
  return req("/articles");
}

export function getArticle(
  id: number,
): Promise<{ article: Article; paragraphs: Paragraph[] }> {
  return req(`/articles/${id}`);
}

export function getExplanations(word: string): Promise<WordLookupResponse> {
  return req(`/words/${encodeURIComponent(word)}/explanations`);
}

export function reexplain(input: {
  articleId: number;
  paragraphId: number;
  word: string;
}): Promise<{ word: unknown; explanation: WordExplanation }> {
  return req("/lookups", { method: "POST", body: JSON.stringify(input) });
}

/** 音檔 URL（同源 /audio/ 靜態服務）。 */
export function audioUrl(relPath: string): string {
  return `${BASE}/audio/${relPath}`;
}
