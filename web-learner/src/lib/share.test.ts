import { describe, expect, it, vi } from "vitest";
import { shareLink } from "./share";

const URL_ = "https://example.com/#/a/7";

describe("shareLink", () => {
  it("優先使用系統分享面板，成功回 shared", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const out = await shareLink("標題", URL_, { share, clipboard: { writeText } });
    expect(out).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "標題", url: URL_ });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("使用者取消分享面板（AbortError）回 cancelled，不退回複製", async () => {
    const err = new DOMException("cancelled", "AbortError");
    const share = vi.fn().mockRejectedValue(err);
    const writeText = vi.fn();
    const out = await shareLink("標題", URL_, { share, clipboard: { writeText } });
    expect(out).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("分享面板失敗（非取消）時退回複製連結", async () => {
    const share = vi.fn().mockRejectedValue(new Error("boom"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const out = await shareLink("標題", URL_, { share, clipboard: { writeText } });
    expect(out).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("環境不支援分享面板時直接複製連結", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const out = await shareLink("標題", URL_, { clipboard: { writeText } });
    expect(out).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("複製也失敗時回 failed", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const out = await shareLink("標題", URL_, { clipboard: { writeText } });
    expect(out).toBe("failed");
  });

  it("兩者皆不可用時回 failed", async () => {
    const out = await shareLink("標題", URL_, {});
    expect(out).toBe("failed");
  });
});
