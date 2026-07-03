import type { Article } from "../types";

/** learner 前台只呈現處理完成的文章（半成品不出現在清單）。 */
export function readyArticles(articles: Article[]): Article[] {
  return articles.filter((a) => a.status === "done");
}
