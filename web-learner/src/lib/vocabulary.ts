import type { VocabularyItem, VocabularySource } from "../vocabularyTypes";

export interface VocabularyFilters {
  status: "active" | "mastered";
  materialType: string;
  unit: string;
  article: string;
  grade: string;
  category: string;
  from: string;
  to: string;
}
export const emptyVocabularyFilters: VocabularyFilters = {
  status: "active", materialType: "", unit: "", article: "", grade: "",
  category: "", from: "", to: "",
};

export function taipeiDay(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)?.value).join("-");
}

export function matchesVocabularySource(s: VocabularySource, f: VocabularyFilters): boolean {
  return (!f.materialType || s.materialType === f.materialType)
    && (!f.unit || s.unit === f.unit)
    && (!f.article || String(s.articleId ?? `deleted-${s.id}`) === f.article)
    && (!f.grade || s.grade === f.grade)
    && (!f.category || s.category === f.category);
}

export function filterVocabulary(items: VocabularyItem[], f: VocabularyFilters): VocabularyItem[] {
  return items.filter(item => {
    const day = taipeiDay(item.savedAt);
    const sourceFilter = f.materialType || f.unit || f.article || f.grade || f.category;
    return item.status === f.status && (!f.from || day >= f.from) && (!f.to || day <= f.to)
      && (!sourceFilter || item.sources.some(s => matchesVocabularySource(s, f)));
  });
}

const storageKey = "vocabulary-review-filters";
export function readVocabularyFilters(): VocabularyFilters {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
    const next = { ...emptyVocabularyFilters };
    if (raw && typeof raw === "object") {
      for (const key of Object.keys(next) as (keyof VocabularyFilters)[]) {
        const value = (raw as Record<string, unknown>)[key];
        if (typeof value === "string" && key !== "status") next[key] = value;
      }
      if ((raw as Record<string, unknown>).status === "mastered") next.status = "mastered";
    }
    return next;
  } catch { return { ...emptyVocabularyFilters }; }
}
export function saveVocabularyFilters(filters: VocabularyFilters): void {
  try { sessionStorage.setItem(storageKey, JSON.stringify(filters)); } catch { /* 儲存空間不可用時仍可複習。 */ }
}
