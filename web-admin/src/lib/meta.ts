// 文章 metadata 編輯草稿的純邏輯（上傳表單與編輯頁共用）。
// 從 App.tsx 抽出：這些是無 UI 相依的轉換函式，抽出後可單獨測試。
import type { Article, MaterialType } from "../types";
import type { Category, Tag } from "../api";

/** 文章 metadata 的編輯草稿（上傳與編輯共用）。 */
export interface MetaDraft {
  materialType: MaterialType;
  grade: string;
  unit: string;
  level: string;
  parentCat: string;
  childCat: string;
  selTags: Set<number>;
}

export const emptyDraft = (): MetaDraft => ({
  materialType: "school",
  grade: "",
  unit: "",
  level: "",
  parentCat: "",
  childCat: "",
  selTags: new Set(),
});

/** 將標籤依 kind 分組（維度與組內標籤皆依字典序）。 */
export function groupTags(tags: Tag[]): { kind: string; items: Tag[] }[] {
  const m = new Map<string, Tag[]>();
  for (const t of tags) {
    if (!m.has(t.kind)) m.set(t.kind, []);
    m.get(t.kind)!.push(t);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, items]) => ({
      kind,
      items: [...items].sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

/**
 * 由 draft 導出送出用的 categoryId 與標籤字串。
 * 子分類優先於母分類；兩者皆空時 categoryId 為 undefined（代表不指定）。
 */
export function draftToPayload(draft: MetaDraft, tags: Tag[]) {
  const categoryId = draft.childCat
    ? Number(draft.childCat)
    : draft.parentCat
      ? Number(draft.parentCat)
      : undefined;
  const tagList = tags
    .filter((t) => draft.selTags.has(t.id))
    .map((t) => `${t.kind}:${t.label}`);
  return { categoryId, tagList };
}

/**
 * 由現有文章 meta 初始化編輯草稿：
 * 分類還原成「母/子」兩層選單的值，標籤依 (kind,label) 比對還原成 id 集合。
 * 對不上受控詞彙的項目會被略過（分類／標籤可能已被刪除或改名）。
 */
export function draftFromArticle(
  a: Article,
  categories: Category[],
  tags: Tag[],
): MetaDraft {
  let parentCat = "";
  let childCat = "";
  if (a.category) {
    const cat = categories.find((c) => c.id === a.category!.id);
    if (cat) {
      if (cat.parentId === null) parentCat = String(cat.id);
      else {
        parentCat = String(cat.parentId);
        childCat = String(cat.id);
      }
    }
  }
  const selTags = new Set<number>();
  for (const at of a.tags ?? []) {
    const t = tags.find((x) => x.kind === at.kind && x.label === at.label);
    if (t) selTags.add(t.id);
  }
  return {
    materialType: a.materialType,
    grade: a.grade ?? "",
    unit: a.unit ?? "",
    level: a.level ?? "",
    parentCat,
    childCat,
    selTags,
  };
}
