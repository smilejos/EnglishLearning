import { describe, it, expect } from "vitest";
import { splitParagraphs } from "./articleText";

describe("splitParagraphs", () => {
  it("以空白行分段並去除前後空白", () => {
    expect(splitParagraphs("First para.\n\nSecond para.\n")).toEqual([
      "First para.",
      "Second para.",
    ]);
  });

  it("濾除多重空白行造成的空段", () => {
    expect(splitParagraphs("A.\n\n\n\nB.")).toEqual(["A.", "B."]);
  });

  it("單段文字回單一元素", () => {
    expect(splitParagraphs("Only one paragraph here.")).toEqual([
      "Only one paragraph here.",
    ]);
  });

  it("全空白回空陣列", () => {
    expect(splitParagraphs("   \n\n  ")).toEqual([]);
  });
});
