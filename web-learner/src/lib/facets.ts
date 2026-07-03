/** 由文章集合萃取唯一且已排序的某欄位值。 */
export function uniqSorted<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v != null))].sort();
}
