import type { PracticeMode, WordbankSystem } from "../wordbankTypes";

export const SYSTEM_LABELS: Record<WordbankSystem, string> = {
  list: "字庫分級", cefr: "CEFR", tw_7000: "臺灣 7000 單字",
};

export function levelLabel(system: WordbankSystem, value: string): string {
  if (value === "all") return "全部";
  if (value === "unclassified") return "未分類";
  if (system === "list") return ({ basic: "基礎 basic", advance: "進階 advance", expert: "精熟 expert" } as Record<string, string>)[value] ?? value;
  return system === "tw_7000" ? `第 ${value} 級` : value;
}

/** 聽力只露字首；挑戰滿四個英文字母才露字尾。 */
export function maskWord(word: string, mode: PracticeMode): string {
  const chars = Array.from(word);
  if (mode === "practice") return word;
  if (chars.length <= 1) return chars[0] ?? "";
  const showLast = mode === "challenge" && (word.match(/[a-z]/gi)?.length ?? 0) >= 4;
  return chars[0] + "•".repeat(chars.length - (showLast ? 2 : 1)) + (showLast ? chars.at(-1) : "");
}
