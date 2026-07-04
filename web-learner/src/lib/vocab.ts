import type { WordExplanation } from "../types";

/**
 * 彈窗標題：若「本篇」(articleId) 已有解釋且帶片語 headword，顯示該片語；
 * 否則顯示被點的單字。
 */
export function popupTitle(
  word: string,
  explanations: WordExplanation[],
  articleId: number,
): string {
  const here = explanations.find((e) => e.articleId === articleId);
  const hw = here?.headword?.trim();
  return hw ? hw : word;
}
