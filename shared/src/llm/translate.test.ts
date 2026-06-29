import { describe, it, expect, vi } from "vitest";
import {
  generateTranslations,
  translateParagraph,
  type TranslateClient,
} from "./translate";

const client = (responses: string[]): TranslateClient => {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return { complete: fn };
};

describe("generateTranslations", () => {
  it("回傳解析後、與輸入同序對齊的翻譯", async () => {
    const c = client([JSON.stringify(["你好", "再見"])]);
    const out = await generateTranslations(["Hello", "Goodbye"], c);
    expect(out).toEqual(["你好", "再見"]);
  });

  it("解析前去除程式碼圍欄", async () => {
    const c = client(['```json\n["你好"]\n```']);
    const out = await generateTranslations(["Hello"], c);
    expect(out).toEqual(["你好"]);
  });

  it("長度不符時重試後成功", async () => {
    const c = client([
      JSON.stringify(["only-one"]),
      JSON.stringify(["一", "二"]),
    ]);
    const out = await generateTranslations(["A", "B"], c);
    expect(out).toEqual(["一", "二"]);
    expect(c.complete).toHaveBeenCalledTimes(2);
  });

  it("長度持續不符、用盡重試後拋錯", async () => {
    const c = client([
      JSON.stringify(["x"]),
      JSON.stringify(["x"]),
      JSON.stringify(["x"]),
    ]);
    await expect(generateTranslations(["A", "B"], c)).rejects.toThrow();
  });

  it("無段落時不呼叫 client、回空陣列", async () => {
    const c = client([]);
    const out = await generateTranslations([], c);
    expect(out).toEqual([]);
    expect(c.complete).not.toHaveBeenCalled();
  });
});

describe("translateParagraph", () => {
  it("翻譯單段並回傳繁中字串", async () => {
    const c = client([JSON.stringify(["閱讀是個好習慣。"])]);
    const out = await translateParagraph("Reading is a good habit.", c);
    expect(out).toBe("閱讀是個好習慣。");
    expect(c.complete).toHaveBeenCalledTimes(1);
  });
});
