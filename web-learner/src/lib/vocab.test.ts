import { describe, it, expect } from "vitest";
import { popupTitle } from "./vocab";
import type { WordExplanation } from "../types";

const base: WordExplanation = {
  id: 1,
  wordId: 1,
  articleId: 10,
  paragraphId: null,
  enExplanation: null,
  enExplanationAudioPath: null,
  enExample: null,
  enExampleAudioPath: null,
  zhTranslation: null,
  zhTranslationAudioPath: null,
  zhExplanation: null,
  zhExplanationAudioPath: null,
  zhExample: null,
  zhExampleAudioPath: null,
  headword: null,
  createdAt: "2026-07-04T00:00:00Z",
  article: { id: 10, title: "A" },
};

describe("popupTitle", () => {
  it("本篇解釋帶片語 headword 時顯示片語", () => {
    const exps = [{ ...base, articleId: 10, headword: "added to" }];
    expect(popupTitle("added", exps, 10)).toBe("added to");
  });
  it("本篇解釋無 headword 時顯示被點單字", () => {
    const exps = [{ ...base, articleId: 10, headword: null }];
    expect(popupTitle("added", exps, 10)).toBe("added");
  });
  it("本篇尚無解釋時顯示被點單字（即使他篇有片語）", () => {
    const exps = [{ ...base, articleId: 99, headword: "added to" }];
    expect(popupTitle("added", exps, 10)).toBe("added");
  });
});
