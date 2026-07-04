// 從文字抽出可點單字（normalized）。斷詞規則須與 web-learner 的 ClickableText
// 一致：以空白切分、去除前後非 [A-Za-z'-] 的字元、轉小寫。前端已與 @el/shared
// 解耦故各持一份；任一方調整時務必同步（見 web-learner/src/App.tsx ClickableText）。
const EDGE = /^[^A-Za-z'-]+|[^A-Za-z'-]+$/g;

/** 回傳文字中出現的 normalized 單字（去重、略過空字）。 */
export function extractVocabWords(text: string): string[] {
  const out = new Set<string>();
  for (const tok of text.split(/\s+/)) {
    const clean = tok.replace(EDGE, "");
    if (clean) out.add(clean.toLowerCase());
  }
  return [...out];
}
