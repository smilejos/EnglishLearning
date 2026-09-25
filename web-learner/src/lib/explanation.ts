import type { WordExplanation } from "../types";

/** 一則解釋的兩個英文音檔是否都就緒（輪詢停止條件）。 */
export function explanationAudioReady(exp: WordExplanation): boolean {
  return Boolean(
    exp.enExplanationAudioPath &&
      exp.enExampleAudioPath,
  );
}
