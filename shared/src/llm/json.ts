// LLM JSON 回應的小工具（stripFences 移植自 article2speech/builder/src/vocab.ts）。

// Gemini 偶爾即使被要求仍以 ```json 圍欄包住 JSON，解析前先去除。
export function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
