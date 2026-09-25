import { afterEach, expect, it, vi } from "vitest";
import { req } from "./api";

afterEach(() => vi.restoreAllMocks());

it("HTTP 錯誤保留狀態碼供補檔配額處理", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "quota" }), { status: 429, statusText: "Too Many Requests" }),
  );
  await expect(req("/lookups/backfill-audio", { method: "POST" }))
    .rejects.toMatchObject({ status: 429, message: expect.stringContaining("quota") });
});
