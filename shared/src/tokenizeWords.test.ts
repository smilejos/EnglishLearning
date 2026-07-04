import { describe, it, expect } from "vitest";
import { extractVocabWords } from "./tokenizeWords";

describe("extractVocabWords", () => {
  it("去除前後標點並小寫", () => {
    expect(
      extractVocabWords("Stars were added to the blue field."),
    ).toEqual(["stars", "were", "added", "to", "the", "blue", "field"]);
  });
  it("保留撇號與連字號", () => {
    expect(extractVocabWords("It's a six-pointed star.")).toEqual([
      "it's",
      "a",
      "six-pointed",
      "star",
    ]);
  });
  it("純數字與純標點 token 略過", () => {
    expect(extractVocabWords("13 stripes, 50 stars —")).toEqual([
      "stripes",
      "stars",
    ]);
  });
  it("大小寫視為同字並去重", () => {
    expect(extractVocabWords("The the THE")).toEqual(["the"]);
  });
});
