import { afterEach, describe, expect, it, vi } from "vitest";
import { getAudioAssets } from "./audioAssets";

const valid = { url: "/audio/wordbank/09eeb3d17582e855/00000000-0000-4000-8000-000000000001.mp3", text: "cat", assetGuid: "00000000-0000-4000-8000-000000000001" };
afterEach(() => vi.unstubAllGlobals());

describe("共用音訊 client", () => {
  it("只向音訊清單 API 取得 URL，scope及課程名稱安全編碼", async () => {
    const signal = new AbortController().signal;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets: { cat: valid } }) })));
    expect((await getAudioAssets("phonics", "short-a", signal)).cat).toEqual(valid);
    expect(fetch).toHaveBeenCalledWith("/audio-assets/phonics/short-a", { signal });
  });

  it.each(["/phonics/short-a/cat.mp3", "https://example.com/audio.mp3", "/audio/scenarios/private.mp3", "/audio/assets/../cat.mp3"])("拒絕共用音訊規則以外的位置 %s", async (url) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets: { cat: { ...valid, url } } }) })));
    await expect(getAudioAssets("phonics", "short-a")).rejects.toThrow("無效的共用音檔位置");
  });

  it("接受既有字庫生成設定名稱，保留字庫錄音更新後的播放相容性", async () => {
    const updated = { ...valid, url: valid.url.replace("09eeb3d17582e855", "updated") };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets: { cat: updated } }) })));
    expect((await getAudioAssets("phonics", "short-a")).cat).toEqual(updated);
  });

  it("HTTP失敗與錯誤格式不轉成靜態音訊位置", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(getAudioAssets("phonics", "short-a")).rejects.toThrow("503");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ assets: [] }) } as Response);
    await expect(getAudioAssets("phonics", "short-a")).rejects.toThrow("格式錯誤");
  });
});
