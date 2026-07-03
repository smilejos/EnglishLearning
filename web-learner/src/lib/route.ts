/** 讀取 hash 中的文章 id（#/a/<id>）；非法或空值回 null。 */
export function articleIdFromHash(hash: string): number | null {
  const m = hash.match(/^#\/a\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** 文章頁對應的 hash；null 代表清單頁。 */
export function hashForArticle(id: number | null): string {
  return id == null ? "" : `#/a/${id}`;
}
