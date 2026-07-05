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

export interface UpdateArticleInput {
  title: string;
  materialType: "school" | "extracurricular";
  grade?: string | null;
  unit?: string | null;
  level?: string | null;
  categoryId?: number | null;
  tags?: string[];
}

export function updateArticle(
  id: number,
  input: UpdateArticleInput,
): Promise<{ ok: boolean }> {
  return req(`/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function retryArticle(id: number): Promise<{ ok: boolean }> {
  return req(`/articles/${id}/retry`, { method: "POST" });
}

export type RegenScope = "translation" | "audio-en" | "audio-zh";

export function regenerateParagraph(
  articleId: number,
  paragraphId: number,
  scope: RegenScope,
): Promise<{ ok: boolean }> {
  return req(`/articles/${articleId}/paragraphs/${paragraphId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ scope }),
  });
}

export function backfillAudio(): Promise<{
  fixedAudio: number;
  scannedWords: number;
  scannedExplanations: number;
}> {
  return req("/lookups/backfill-audio", { method: "POST" });
}

export function deleteArticle(id: number): Promise<{ ok: boolean }> {
  return req(`/articles/${id}`, { method: "DELETE" });
}

export interface Stats {
  articles: Record<string, number>;
  paragraphs: Record<string, number>;
  jobs: Record<string, number>;
  words: number;
  explanations: number;
  lookupsToday: { llmCalls: number; globalPerDay: number } | null;
}

export function getStats(): Promise<Stats> {
  return req("/stats");
}

export interface Category {
  id: number;
  parentId: number | null;
  label: string;
  sortOrder: number;
}
export interface Tag {
  id: number;
  kind: string;
  label: string;
}

export function listCategories(): Promise<{ categories: Category[] }> {
  return req("/categories");
}
export function createCategory(input: {
  label: string;
  parentId?: number | null;
}): Promise<{ category: Category }> {
  return req("/categories", { method: "POST", body: JSON.stringify(input) });
}
export function updateCategory(
  id: number,
  patch: { label?: string; sortOrder?: number },
): Promise<{ category: Category }> {
  return req(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
export function deleteCategory(id: number): Promise<{ ok: boolean }> {
  return req(`/categories/${id}`, { method: "DELETE" });
}

export function listTags(): Promise<{ tags: Tag[] }> {
  return req("/tags");
}
export function createTag(input: {
  kind: string;
  label: string;
}): Promise<{ tag: Tag }> {
  return req("/tags", { method: "POST", body: JSON.stringify(input) });
}
export function updateTag(
  id: number,
  patch: { kind?: string; label?: string },
): Promise<{ tag: Tag }> {
  return req(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export function deleteTag(id: number): Promise<{ ok: boolean }> {
  return req(`/tags/${id}`, { method: "DELETE" });
}
export function renameTagKind(
  from: string,
  to: string,
): Promise<{ updated: number }> {
  return req("/tag-kinds/rename", {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

/** 音檔 URL（同源 /audio/ 靜態服務）。 */
export function audioUrl(relPath: string): string {
  return `${BASE}/audio/${relPath}`;
}

export interface WordRow {
  id: number;
  normalizedWord: string;
  enAudioPath: string | null;
  explanationCount: number;
}
export interface WordInfo {
  id: number;
  normalizedWord: string;
  enAudioPath: string | null;
  createdAt: string;
}
export interface Explanation {
  id: number;
  wordId: number;
  articleId: number;
  enExplanation: string | null;
  enExample: string | null;
  zhTranslation: string | null;
  zhExplanation: string | null;
  zhExample: string | null;
  headword: string | null;
  article?: { id: number; title: string };
  word?: { id: number; normalizedWord: string };
}

export function searchWords(q: string): Promise<{ words: WordRow[] }> {
  return req(`/words?q=${encodeURIComponent(q)}`);
}
export function getWordExplanations(
  word: string,
): Promise<{ word: WordInfo | null; explanations: Explanation[] }> {
  return req(`/words/${encodeURIComponent(word)}/explanations`);
}
export function listArticleExplanations(
  articleId: number,
): Promise<{ explanations: Explanation[] }> {
  return req(`/articles/${articleId}/explanations`);
}
export function deleteExplanation(id: number): Promise<{ ok: true }> {
  return req(`/explanations/${id}`, { method: "DELETE" });
}
export function deleteWord(id: number): Promise<{ ok: true }> {
  return req(`/words/${id}`, { method: "DELETE" });
}
