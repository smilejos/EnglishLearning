import { describe, it, expect, vi } from "vitest";
import { explainWord, type ExplainClient } from "./explainWord";

const client = (responses: string[]): ExplainClient => {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return { complete: fn };
};

const valid = {
  en_explanation: "a regular practice that is hard to give up",
  zh_translation: "習慣",
  zh_explanation: "經常重複、難以改變的行為",
  en_example: "Reading every night is a good habit.",
  zh_example: "每晚閱讀是個好習慣。",
  headword: "habit",
};

describe("explainWord", () => {
  it("回傳通過 schema 的 5 欄內容", async () => {
    const c = client([JSON.stringify(valid)]);
    const out = await explainWord("habit", "Reading is a good habit.", c);
    expect(out).toEqual(valid);
    expect(c.complete).toHaveBeenCalledTimes(1);
  });

  it("回傳片語 headword", async () => {
    const phrase = { ...valid, headword: "added to" };
    const c = client([JSON.stringify(phrase)]);
    const out = await explainWord("added", "Stars were added to the field.", c);
    expect(out.headword).toBe("added to");
  });

  it("解析前去除程式碼圍欄", async () => {
    const c = client(["```json\n" + JSON.stringify(valid) + "\n```"]);
    const out = await explainWord("habit", "ctx", c);
    expect(out.zh_translation).toBe("習慣");
  });

  it("缺欄位時重試，之後成功", async () => {
    const missing = { ...valid } as Partial<typeof valid>;
    delete missing.en_example;
    const c = client([JSON.stringify(missing), JSON.stringify(valid)]);
    const out = await explainWord("habit", "ctx", c);
    expect(out).toEqual(valid);
    expect(c.complete).toHaveBeenCalledTimes(2);
  });

  it("持續缺欄位、用盡重試後拋錯", async () => {
    const missing = { ...valid } as Partial<typeof valid>;
    delete missing.zh_explanation;
    const c = client([
      JSON.stringify(missing),
      JSON.stringify(missing),
      JSON.stringify(missing),
    ]);
    await expect(explainWord("habit", "ctx", c)).rejects.toThrow(
      /failed after 3 attempts/,
    );
  });

  it("空字串欄位視為不合法而重試／報錯", async () => {
    const empty = { ...valid, en_explanation: "" };
    const c = client([JSON.stringify(empty)]);
    await expect(
      explainWord("habit", "ctx", c, { retries: 0 }),
    ).rejects.toThrow();
  });
});
