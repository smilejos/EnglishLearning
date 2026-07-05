import { describe, expect, it } from "vitest";
import { coverFor } from "./cover";

describe("coverFor", () => {
  it("同一篇文章永遠得到相同封面", () => {
    const a = { id: 7, category: { label: "自然" } };
    expect(coverFor(a)).toEqual(coverFor({ ...a }));
  });

  it("同分類的文章使用相同 emoji", () => {
    const c = { label: "旅遊" };
    expect(coverFor({ id: 1, category: c }).emoji).toBe(
      coverFor({ id: 99, category: c }).emoji,
    );
  });

  it("無分類時以文章 id 決定 emoji，仍為固定值", () => {
    expect(coverFor({ id: 3 }).emoji).toBe(coverFor({ id: 3, category: null }).emoji);
  });

  it("回傳合法的 emoji 與 CSS 漸層", () => {
    const { emoji, gradient } = coverFor({ id: 42 });
    expect(emoji.length).toBeGreaterThan(0);
    expect(gradient).toMatch(/^linear-gradient\(/);
  });
});
