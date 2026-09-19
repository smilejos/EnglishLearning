import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Illustrations } from "./Illustrations";
import { req } from "./api";
vi.mock("./api", () => ({ req: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.mocked(req).mockReset();
  vi.mocked(req).mockImplementation(async (path) => {
    if (path === "/image-models")
      return {
        defaultModelId: "test-model",
        models: [
          {
            id: "test-model",
            label: "Mock Model",
            lastVerifiedAt: "2026-09-06T00:00:00Z",
          },
        ],
      } as never;
    if (path.endsWith("/illustration-runs")) return { runs: [] } as never;
    if (path.endsWith("/illustration-estimates"))
      return {
        estimateId: "quote",
        expiresAt: "2026-09-06T12:00:00Z",
        counts: { cover: 1, paragraphs: 2, reference: 1, planner: 1 },
        breakdown: {
          planner: 1000,
          cover: 1000,
          paragraphs: 2000,
          reference: 1000,
        },
        baseCostUsdMicros: 5000,
        reservedRetryCostUsdMicros: 5000,
        maxCostUsdMicros: 10000,
      } as never;
    throw new Error("unexpected request");
  });
});
it("loads server models and requires explicit cost confirmation before creating work", async () => {
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  await screen.findByRole("option", { name: "Mock Model" });
  fireEvent.click(screen.getByRole("button", { name: "估算完整文章費用" }));
  await screen.findByRole("button", { name: "確認費用並建立新版本" });
  fireEvent.click(screen.getByRole("button", { name: "確認費用並建立新版本" }));
  expect(confirmation).toHaveBeenCalled();
  expect(
    vi
      .mocked(req)
      .mock.calls.filter(
        ([p, opts]) =>
          p.endsWith("/illustration-runs") && opts?.method === "POST",
      ),
  ).toHaveLength(0);
});
it("shows failures instead of silently swallowing them", async () => {
  vi.mocked(req).mockRejectedValue(new Error("圖片服務暫時無法使用"));
  render(<Illustrations articleId={1} />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "圖片服務暫時無法使用",
    ),
  );
});
it("shows failed planning attempts, including legacy errors, without submitting work", async () => {
  const run = { id: "3", revision: 1, status: "failed", model_id: "test-model",
    actual_cost_usd_micros: "100", reserved_cost_usd_micros: "0", max_cost_usd_micros: "1000" };
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, options) => {
    if (path.endsWith("/illustration-runs")) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/3")) return { run, slots: [], attempts: [
      { id: "1", state: "failed", error: "規劃格式不符：coverBrief (invalid_type)" },
      { id: "2", state: "failed", error: "Invalid visual plan or image; review and retry" },
      { id: "24", state: "failed", operation_kind: "plan", api_model: "gemini-2.5-flash",
        error: "Image provider rejected request (400)：INVALID_ARGUMENT generationConfig.responseJsonSchema" },
    ] } as never;
    return original(path, options);
  });
  render(<Illustrations articleId={1} />);
  expect(await screen.findByText(/規劃格式不符：coverBrief/)).toBeTruthy();
  expect(screen.getByText(/舊版僅保留通用錯誤/)).toBeTruthy();
  expect(screen.getByText(/全文規劃.*gemini-2.5-flash/)).toBeTruthy();
  expect(screen.getByText(/INVALID_ARGUMENT generationConfig.responseJsonSchema/)).toBeTruthy();
  expect(screen.getByText(/請求參數被供應商拒絕/)).toBeTruthy();
  expect(vi.mocked(req).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});
