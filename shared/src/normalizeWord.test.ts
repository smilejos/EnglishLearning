import { describe, it, expect } from "vitest";
import { normalizeWord } from "./normalizeWord";

describe("normalizeWord", () => {
  it("將大小寫與前後空白正規化為相同結果", () => {
    expect(normalizeWord("Habit ")).toBe("habit");
    expect(normalizeWord("habit")).toBe("habit");
    expect(normalizeWord("HABIT")).toBe("habit");
    expect(normalizeWord("  habit  ")).toBe("habit");
  });

  it("不做 lemmatize（保留字尾，僅小寫 + trim）", () => {
    expect(normalizeWord("Running")).toBe("running");
    expect(normalizeWord("habits")).toBe("habits");
  });

  it("保留字中的標點與連字號", () => {
    expect(normalizeWord("Well-Known")).toBe("well-known");
    expect(normalizeWord("don't")).toBe("don't");
  });

  it("處理全空白或空字串為空字串", () => {
    expect(normalizeWord("   ")).toBe("");
    expect(normalizeWord("")).toBe("");
  });
});
