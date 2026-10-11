import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "./scenarioStudioApi";
import { STUDIO_BLOCKS, type StudioDraft } from "./scenarioStudioTypes";
let requests: { url: string; init: RequestInit }[];
beforeEach(() => { requests = []; vi.stubGlobal("fetch", vi.fn(async (url, init) => { requests.push({ url: String(url), init }); return new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } }); })); });
afterEach(() => vi.unstubAllGlobals());
it("儲存只傳可編內容與 CAS version，不送 id/materializedRevision 或伺服器時間", async () => {
  const draft: StudioDraft = { id: "draft", version: 4, scenarioKey: "living-room", titleZh: "客廳", vocabularyFilter: { system: "list", levels: ["basic"] }, targets: [], sceneDescription: "", promptSettings: { stylePreset: "cute-3d", blocks: Object.fromEntries(STUDIO_BLOCKS.map(block => [block, ""])) as StudioDraft["promptSettings"]["blocks"], imageModelKey: "" }, story: null, selectedImageId: null, selectedAudioId: null, review: { story: false, image: false, coordinates: false, audio: false }, materializedRevision: 8, createdAt: "x", updatedAt: "y" };
  await api.saveDraft(draft); const body = JSON.parse(requests[0].init.body as string); expect(body.version).toBe(4); expect(body).not.toHaveProperty("id"); expect(body).not.toHaveProperty("materializedRevision"); expect(body).not.toHaveProperty("createdAt"); expect(requests[0].init.method).toBe("PUT");
});
it("搜尋正確編碼複合詞與精確級別，指定 token 搜尋不讀全字庫", async () => {
  await api.searchWords("coffee table", ["basic", "advance"], "n", 30); const url = new URL(requests[0].url, "http://localhost"); expect(url.pathname).toBe("/scenarios/studio/words"); expect(url.searchParams.get("q")).toBe("coffee table"); expect(url.searchParams.get("levels")).toBe("basic,advance"); expect(url.searchParams.get("offset")).toBe("30"); expect(url.searchParams.get("limit")).toBe("30");
});
it("生成傳 quoteHash 與版本，只有呼叫函式才建立工作", async () => {
  await api.startJob("draft", 2, "image", "quote"); const body = JSON.parse(requests[0].init.body as string); expect(body).toMatchObject({ version: 2, kind: "image", quoteHash: "quote" }); expect(body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/); expect(requests).toHaveLength(1);
});
it("結果不明重試帶明示承認，素材上傳只傳資料不傳本機檔案路徑", async () => {
  await api.retryJob("job", 2, true); expect(JSON.parse(requests[0].init.body as string)).toMatchObject({ version: 2, ackUncertain: true }); await api.uploadAsset("draft", { version: 3, kind: "image", dataBase64: "fake", contentType: "image/png" }); expect(JSON.parse(requests[1].init.body as string)).not.toHaveProperty("path");
});
it("新的生成工作也可明示接受已取消請求的重複費用", async () => {
  await api.startJob("draft", 3, "story", "quote", "operation-key", true); expect(JSON.parse(requests[0].init.body as string)).toMatchObject({ version: 3, kind: "story", idempotencyKey: "operation-key", ackUncertain: true });
});
it("複製新草稿與發布正式 revision 是不同的明確 mutation", async () => {
  await api.forkDraft("living-room", 1); await api.publishRevision("living-room", 2); expect(requests[0].url).toBe("/scenarios/studio/drafts/fork"); expect(JSON.parse(requests[0].init.body as string)).toEqual({ sourceKey: "living-room", sourceRevision: 1 }); expect(requests[1].url).toBe("/scenarios/living-room/revisions/2/publish");
});
