// 文章段落切分（沿用參考 article2speech/builder/src/markdown.ts 的規則）：
// 以空白行分段、各段 trim、濾除空段。
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
