import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry, isQuotaError, GeminiTtsClient } from "./tts";
import { apiKeyAuthorizer } from "./auth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withRetry", () => {
  it("失敗一次後重試並成功", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { retries: 2, baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("用盡重試後拋錯", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      withRetry(fn, { retries: 2, baseDelayMs: 0 }),
    ).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(3); // 初次 + 2 retries
  });

  it("遇配額錯誤不重試、立即失敗", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("got status: 429 RESOURCE_EXHAUSTED"));
    await expect(
      withRetry(fn, { retries: 5, baseDelayMs: 0 }),
    ).rejects.toThrow(/429/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isQuotaError", () => {
  it("辨識 429 / RESOURCE_EXHAUSTED，忽略其他", () => {
    expect(isQuotaError({ status: 429, message: "Too Many Requests" })).toBe(
      true,
    );
    expect(isQuotaError(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isQuotaError(new Error("no audio data"))).toBe(false);
  });
});

describe("GeminiTtsClient.synthesize", () => {
  const auth = apiKeyAuthorizer("test-key");
  // 以一段 PCM bytes 的 base64 模擬 Gemini 回傳的音訊。
  const audioResponse = () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16",
                    data: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString(
                      "base64",
                    ),
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );

  it("以傳入的 voice 組出 request 的 voiceName，回傳可解析為 wav", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(audioResponse());
    const client = new GeminiTtsClient({ auth });

    const result = await client.synthesize("Hello", "Puck");

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(
      body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName,
    ).toBe("Puck");
    // 回傳 wav 帶正確 RIFF/WAVE 標頭
    expect(result.wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(result.wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(result.wav.length).toBe(44 + 8);
  });

  it("不同 voice 反映在 request（中英各自 voice）", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(audioResponse());
    const client = new GeminiTtsClient({ auth });

    await client.synthesize("你好", "Kore");
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(
      body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName,
    ).toBe("Kore");
  });

  it("回傳無音訊資料時拋錯", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }),
        { status: 200 },
      ),
    );
    const client = new GeminiTtsClient({ auth, retries: 0 });
    await expect(client.synthesize("x", "Kore")).rejects.toThrow(
      /no audio data/,
    );
  });
});
