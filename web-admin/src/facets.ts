/** 由文章集合萃取唯一且已排序的某欄位值（與前台 lib/facets.ts 同邏輯）。 */
export function uniqSorted<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v != null))].sort();
}
