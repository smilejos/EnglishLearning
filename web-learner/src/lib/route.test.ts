import { describe, it, expect } from "vitest";
import { articleIdFromHash, hashForArticle } from "./route";

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
});
