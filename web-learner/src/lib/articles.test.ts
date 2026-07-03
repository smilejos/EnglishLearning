import { describe, it, expect } from "vitest";
import type { Article } from "../types";
import { readyArticles } from "./articles";

function art(id: number, status: Article["status"]): Article {
  return {
    id,
    title: `t${id}`,
    materialType: "school",
    grade: null,
    unit: null,
    week: null,
    level: null,
    category: null,
    tags: [],
    status,
    createdAt: "",
  };
}

describe("readyArticles", () => {
  it("只留 done，順序不變", () => {
    const input = [art(1, "done"), art(2, "pending"), art(3, "failed"), art(4, "done")];
    expect(readyArticles(input).map((a) => a.id)).toEqual([1, 4]);
  });
});
