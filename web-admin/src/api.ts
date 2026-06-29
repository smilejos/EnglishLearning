// api 呼叫封裝。同源部署（SPA 與 api 同網域，置於 Cloudflare Access 之後）；
// 開發時由 Vite proxy 轉發到本機 api。
import type { Article, Paragraph, CreateArticleInput } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
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

export function createArticle(
  input: CreateArticleInput,
): Promise<{ id: number }> {
  return req("/articles", { method: "POST", body: JSON.stringify(input) });
}

export function retryArticle(id: number): Promise<{ ok: boolean }> {
  return req(`/articles/${id}/retry`, { method: "POST" });
}

export function deleteArticle(id: number): Promise<{ ok: boolean }> {
  return req(`/articles/${id}`, { method: "DELETE" });
}

/** 音檔 URL（同源 /audio/ 靜態服務）。 */
export function audioUrl(relPath: string): string {
  return `${BASE}/audio/${relPath}`;
}
