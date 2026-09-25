import { describe, it, expect, vi, afterEach } from "vitest";
import { generateContent, firstText } from "./genai";
import type { Authorizer } from "./auth";

const endpoint = (model: string) =>
  `https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/${model}:generateContent`;
const auth: Authorizer = {
  endpoint,
  headers: async () => ({ "x-goog-api-key": "test-key" }),
  describe: () => "test key",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateContent", () => {
  it("以正確 endpoint、授權標頭與 JSON body 發出請求並回傳解析結果", async () => {
    const responseBody = {
      candidates: [{ content: { parts: [{ text: "hello" }] } }],
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      );

    const req = { contents: [{ parts: [{ text: "hi" }] }] };
    const res = await generateContent("gemini-2.5-flash", req, auth);

    expect(res).toEqual(responseBody);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(endpoint("gemini-2.5-flash"));
    expect(String(url)).not.toContain("generativelanguage.googleapis.com");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect((init as RequestInit).body).toBe(JSON.stringify(req));
  });

  it("非 2xx 時拋出含狀態碼的錯誤", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("quota exceeded", { status: 429 }),
    );
    const req = { contents: [{ parts: [{ text: "hi" }] }] };
    await expect(
      generateContent("gemini-2.5-flash", req, auth),
    ).rejects.toThrow(/429/);
  });
});

describe("firstText", () => {
  it("取第一個 candidate part 的文字", () => {
    expect(
      firstText({ candidates: [{ content: { parts: [{ text: "abc" }] } }] }),
    ).toBe("abc");
  });

  it("無 candidate 時回空字串", () => {
    expect(firstText({})).toBe("");
    expect(firstText({ candidates: [] })).toBe("");
  });
});
