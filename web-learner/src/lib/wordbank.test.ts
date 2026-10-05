import { describe, expect, it } from "vitest";
import { maskWord } from "./wordbank";

describe("揭曉前遮字", () => {
  it("聽力所有長度只露首字，挑戰依四字母界線", () => {
    expect(maskWord("apple", "listening")).toBe("a••••");
    expect(maskWord("cat", "listening")).toBe("c••");
    expect(maskWord("apple", "challenge")).toBe("a•••e");
    expect(maskWord("book", "challenge")).toBe("b••k");
    expect(maskWord("cat", "challenge")).toBe("c••");
    expect(maskWord("a", "challenge")).toBe("a");
    expect(maskWord("apple", "practice")).toBe("apple");
  });
});
