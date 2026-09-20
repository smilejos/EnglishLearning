/** 讀取 hash 中的文章 id（#/a/<id>）；非法或空值回 null。 */
export function articleIdFromHash(hash: string): number | null {
  const m = hash.match(/^#\/a\/(\d+)(?:\?[^#]*)?$/);
  const id = m ? Number(m[1]) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 文章頁對應的 hash；null 代表清單頁。 */
export function hashForArticle(id: number | null, target?: {
  paragraphId: number | null; word: string; fromReview?: boolean;
}): string {
  if (id == null) return "";
  const query = new URLSearchParams();
  if (target?.paragraphId != null) query.set("paragraph", String(target.paragraphId));
  if (target?.word) query.set("word", target.word);
  if (target?.fromReview) query.set("from", "review");
  return `#/a/${id}${query.size ? `?${query}` : ""}`;
}

export function readArticleTarget(hash: string) {
  const query = new URLSearchParams(articleIdFromHash(hash) == null ? "" : hash.split("?")[1]);
  const paragraph = Number(query.get("paragraph"));
  return {
    paragraphId: Number.isSafeInteger(paragraph) && paragraph > 0 ? paragraph : null,
    word: query.get("word") ?? "",
    fromReview: query.get("from") === "review",
  };
}
