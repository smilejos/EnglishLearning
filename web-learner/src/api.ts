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

export function getArticleLookups(id: number): Promise<{ words: string[] }> {
  return req(`/articles/${id}/lookups`);
}

export function reexplain(input: {
  articleId: number;
  paragraphId: number;
  word: string;
}): Promise<{ word: unknown; explanation: WordExplanation }> {
  return req("/lookups", { method: "POST", body: JSON.stringify(input) });
}

export interface Me {
  id: number;
  email: string;
  role: "admin" | "reviewer" | "reader";
}

/** 目前登入者身分（Cloudflare Access 之後同源）。 */
export function getMe(): Promise<{ user: Me | null }> {
  return req("/me");
}

/** 音檔 URL（同源 /audio/ 靜態服務）。 */
export function audioUrl(relPath: string): string {
  return `${BASE}/audio/${relPath}`;
}

/** 後台網址（build 期注入；未設則本機預設）。 */
export const ADMIN_URL =
  (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? "http://localhost:8081";

/** 某單字的後台管理深連結。 */
export function adminWordUrl(word: string): string {
  return `${ADMIN_URL}/#/w/${encodeURIComponent(word)}`;
}
