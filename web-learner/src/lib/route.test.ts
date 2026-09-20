import { describe, it, expect } from "vitest";
import { articleIdFromHash, hashForArticle, readArticleTarget } from "./route";

describe("hash 路由", () => {
  it("解析 #/a/<id>", () => {
    expect(articleIdFromHash("#/a/12")).toBe(12);
    expect(articleIdFromHash("")).toBeNull();
    expect(articleIdFromHash("#/a/abc")).toBeNull();
    expect(articleIdFromHash("#/other")).toBeNull();
  });
  it("產生 hash", () => {
    expect(hashForArticle(12)).toBe("#/a/12");
    expect(hashForArticle(null)).toBe("");
  });
  it("收藏來源深連結可還原課文、段落、單字與返回目的地", () => {
    const hash = hashForArticle(12, { paragraphId: 42, word: "look up", fromReview: true });
    expect(articleIdFromHash(hash)).toBe(12);
    expect(readArticleTarget(hash)).toEqual({ paragraphId: 42, word: "look up", fromReview: true });
    expect(readArticleTarget("#/a/12?paragraph=-1").paragraphId).toBeNull();
    expect(readArticleTarget("#/review?paragraph=42").paragraphId).toBeNull();
    expect(articleIdFromHash("#/a/0")).toBeNull();
    expect(articleIdFromHash("#/a/12/unexpected")).toBeNull();
  });
});
