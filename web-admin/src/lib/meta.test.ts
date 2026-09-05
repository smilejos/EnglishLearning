import { describe, it, expect } from "vitest";
import {
  emptyDraft,
  groupTags,
  draftToPayload,
  draftFromArticle,
  type MetaDraft,
} from "./meta";
import type { Article } from "../types";
import type { Category, Tag } from "../api";

const tags: Tag[] = [
  { id: 1, kind: "主題", label: "動物" },
  { id: 2, kind: "主題", label: "food" },
  { id: 3, kind: "情境", label: "旅遊" },
];

const categories: Category[] = [
  { id: 10, parentId: null, label: "科普", sortOrder: 0 },
  { id: 11, parentId: 10, label: "天文", sortOrder: 0 },
  { id: 20, parentId: null, label: "故事", sortOrder: 1 },
];

function article(over: Partial<Article> = {}): Article {
  return {
    id: 1,
    title: "T",
    materialType: "school",
    grade: null,
    unit: null,
    week: null,
    page: null,
    categoryId: null,
    level: null,
    status: "done",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as Article;
}

describe("groupTags", () => {
  it("依 kind 分組，維度與組內標籤皆排序", () => {
    expect(groupTags(tags)).toEqual([
      {
        kind: "主題",
        items: [
          { id: 1, kind: "主題", label: "動物" },
          { id: 2, kind: "主題", label: "food" },
        ],
      },
      { kind: "情境", items: [{ id: 3, kind: "情境", label: "旅遊" }] },
    ]);
  });

  it("空清單回空陣列", () => {
    expect(groupTags([])).toEqual([]);
  });

  it("不就地改動傳入的陣列", () => {
    const input: Tag[] = [
      { id: 2, kind: "k", label: "b" },
      { id: 1, kind: "k", label: "a" },
    ];
    const snapshot = [...input];
    groupTags(input);
    expect(input).toEqual(snapshot);
  });
});

describe("draftToPayload", () => {
  const base = (over: Partial<MetaDraft> = {}): MetaDraft => ({
    ...emptyDraft(),
    ...over,
  });

  it("有子分類時以子分類為準", () => {
    expect(
      draftToPayload(base({ parentCat: "10", childCat: "11" }), tags).categoryId,
    ).toBe(11);
  });

  it("只有母分類時用母分類", () => {
    expect(draftToPayload(base({ parentCat: "10" }), tags).categoryId).toBe(10);
  });

  it("都沒選時 categoryId 為 undefined（代表不指定）", () => {
    expect(draftToPayload(base(), tags).categoryId).toBeUndefined();
  });

  it("選取的標籤輸出成 kind:label 字串", () => {
    expect(draftToPayload(base({ selTags: new Set([1, 3]) }), tags).tagList).toEqual([
      "主題:動物",
      "情境:旅遊",
    ]);
  });

  it("未選標籤時輸出空陣列", () => {
    expect(draftToPayload(base(), tags).tagList).toEqual([]);
  });
});

describe("draftFromArticle", () => {
  it("母分類還原到 parentCat、childCat 留空", () => {
    const d = draftFromArticle(
      article({ category: { id: 10, label: "科普" } } as Partial<Article>),
      categories,
      tags,
    );
    expect(d.parentCat).toBe("10");
    expect(d.childCat).toBe("");
  });

  it("子分類同時還原 parentCat 與 childCat", () => {
    const d = draftFromArticle(
      article({ category: { id: 11, label: "天文" } } as Partial<Article>),
      categories,
      tags,
    );
    expect(d.parentCat).toBe("10");
    expect(d.childCat).toBe("11");
  });

  it("標籤依 (kind,label) 還原成 id 集合", () => {
    const d = draftFromArticle(
      article({
        tags: [
          { kind: "主題", label: "動物" },
          { kind: "情境", label: "旅遊" },
        ],
      } as Partial<Article>),
      categories,
      tags,
    );
    expect([...d.selTags].sort()).toEqual([1, 3]);
  });

  it("分類已從受控詞彙刪除時安全略過，不會產生無效選項", () => {
    const d = draftFromArticle(
      article({ category: { id: 999, label: "不存在" } } as Partial<Article>),
      categories,
      tags,
    );
    expect(d.parentCat).toBe("");
    expect(d.childCat).toBe("");
  });

  it("標籤已改名／刪除時只略過對不上的，其餘照常還原", () => {
    const d = draftFromArticle(
      article({
        tags: [
          { kind: "主題", label: "動物" },
          { kind: "主題", label: "已刪除的" },
        ],
      } as Partial<Article>),
      categories,
      tags,
    );
    expect([...d.selTags]).toEqual([1]);
  });

  it("null 的 grade/unit/level 還原成空字串（供受控輸入框使用）", () => {
    const d = draftFromArticle(article(), categories, tags);
    expect({ grade: d.grade, unit: d.unit, level: d.level }).toEqual({
      grade: "",
      unit: "",
      level: "",
    });
  });

  it("往返一致：draftFromArticle → draftToPayload 還原出原本的分類與標籤", () => {
    const a = article({
      category: { id: 11, label: "天文" },
      tags: [{ kind: "情境", label: "旅遊" }],
    } as Partial<Article>);
    const { categoryId, tagList } = draftToPayload(
      draftFromArticle(a, categories, tags),
      tags,
    );
    expect(categoryId).toBe(11);
    expect(tagList).toEqual(["情境:旅遊"]);
  });
});
