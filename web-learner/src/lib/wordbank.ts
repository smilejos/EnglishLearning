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
  const letters = chars.flatMap((char, index) => /\p{L}/u.test(char) ? [index] : []);
  const first = letters[0];
  const last = mode === "challenge" && letters.length >= 4 ? letters.at(-1) : undefined;
  return chars.map((char, index) => index === first || index === last ? char : "•").join("");
}
