import { describe, it, expect } from "vitest";
import { explanationAudioReady } from "./explanation";
import type { WordExplanation } from "../types";

const base: WordExplanation = {
  id: 1,
  wordId: 1,
  articleId: 1,
  paragraphId: 1,
  enExplanation: "x",
  enExplanationAudioPath: null,
  enExample: "x",
  enExampleAudioPath: null,
  zhTranslation: "x",
  zhTranslationAudioPath: null,
  zhExplanation: "x",
  zhExplanationAudioPath: null,
  zhExample: "x",
  zhExampleAudioPath: null,
  headword: null,
  createdAt: "",
  article: { id: 1, title: "A" },
};

describe("explanationAudioReady", () => {
  it("音檔皆缺 → false", () => {
    expect(explanationAudioReady(base)).toBe(false);
  });
  it("兩個英文音檔皆備即可停止輪詢", () => {
    expect(
      explanationAudioReady({
        ...base,
        enExplanationAudioPath: "a",
        enExampleAudioPath: "b",
      }),
    ).toBe(true);
  });
});
