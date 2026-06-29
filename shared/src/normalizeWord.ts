// 全站一致的單字正規化。
// 設計 §9.1 預設：小寫 + trim，不做 lemmatize（不還原字尾）。
// api 寫入 `words.normalized_word` 與查詢都必須透過此函式，確保快取鍵一致。

/** 將單字正規化為小寫並去除前後空白。 */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}
