import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
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
    if (path === "/generation-settings")
      return { settings: { image: { provider: "google", model: "test-model" } } } as never;
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
  await screen.findByText("Mock Model");
  fireEvent.click(screen.getByRole("button", { name: "估算完整文章費用" }));
  await screen.findByRole("button", { name: "確認費用並建立新版本" });
  const estimate = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/illustration-estimates"));
  expect(JSON.parse(String(estimate?.[1]?.body)).modelId).toBe("test-model");
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
it("blocks estimation when the globally configured image model is unavailable", async () => {
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path === "/generation-settings")
      return { settings: { image: { provider: "openai", model: "unavailable-model" } } } as never;
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  await screen.findByText("unavailable-model");
  expect(screen.getByRole("button", { name: "估算完整文章費用" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("無法使用");
});
it("rechecks the global image model before estimating", async () => {
  const original = vi.mocked(req).getMockImplementation()!;
  let reads = 0;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path === "/generation-settings") {
      reads += 1;
      return { settings: { image: { provider: "google", model: reads === 1 ? "test-model" : "new-model" } } } as never;
    }
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  await screen.findByText("Mock Model");
  fireEvent.click(screen.getByRole("button", { name: "估算完整文章費用" }));
  await screen.findByText("全站圖片模型已更新，請確認後重新估價。");
  expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/illustration-estimates"))).toBe(false);
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
it("shows skipped teaching words as adjustments while image generation continues", async () => {
  const warning = '段落 66：已略過教學單字第 3 項 "window box"，不是原文完整單字（僅接受單一單字，大小寫與單複數須一致）';
  const run = { id: "3", revision: 1, status: "generating", model_id: "test-model",
    actual_cost_usd_micros: "100", reserved_cost_usd_micros: "0", max_cost_usd_micros: "1000",
    plan_json: { validationWarnings: [warning] } };
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, options) => {
    if (path.endsWith("/illustration-runs")) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/3")) return { run, slots: [], attempts: [
      { id: "1", state: "succeeded", operation_kind: "plan", error: null },
    ] } as never;
    return original(path, options);
  });
  render(<Illustrations articleId={1} />);
  expect(await screen.findByText("教學單字調整")).toBeTruthy();
  expect(screen.getByText(warning)).toBeTruthy();
  expect(screen.getByText(/其餘單字與圖片規劃仍會繼續處理/)).toBeTruthy();
  expect(screen.queryByText("工作失敗紀錄")).toBeNull();
  expect(vi.mocked(req).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});

const target = (word: string) => ({
  word, normalizedWord: word.toLowerCase(), visualObject: word,
  reason: `辨認 ${word}`, anchor: { x: 0.2, y: 0.3 }, confidence: 1,
  placementSource: "manual",
});

function mockReview(options: {
  status?: string;
  kind?: string;
  targets?: ReturnType<typeof target>[];
  source?: string | null;
  candidateStatus?: string;
} = {}) {
  const source = options.source === undefined ? "Cats sit by a window-box. Cats watch birds." : options.source;
  const run = {
    id: "3", revision: 1, status: options.status ?? "review", model_id: "test-model",
    actual_cost_usd_micros: "100", reserved_cost_usd_micros: "0", max_cost_usd_micros: "1000",
    ...(source === null ? {} : { source_json: { paragraphs: [
      { id: 66, text: source }, { id: 67, text: "Wrong paragraph." },
    ] } }),
  };
  const candidate = {
    id: "9", status: options.candidateStatus ?? "ready", alt_text: "花園裡的貓",
    teaching_targets: options.targets ?? [], url: "/images/test.webp",
    latest_error: null, prompt_json: { prompt: "A garden." },
  };
  const detail = { run, slots: [{
    id: "4", kind: options.kind ?? "paragraph", paragraph_id: "66", idx: 0,
    text: "Changed current paragraph.", required: true, skip_reason: null,
    candidates: [candidate],
  }], attempts: [] };
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/illustration-runs")) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/3")) return detail as never;
    if (path.endsWith("/candidates/9/review")) return {} as never;
    return original(path, init);
  });
  return detail;
}

async function chooseWord(word: string) {
  const select = await screen.findByRole("combobox", { name: "原文單字" });
  fireEvent.change(select, { target: { value: word } });
  fireEvent.click(screen.getByRole("button", { name: "新增單字" }));
}

it("adds an exact source word, requires placement, and saves it with existing targets without generating images", async () => {
  mockReview({ targets: [target("birds")] });
  render(<Illustrations articleId={1} />);
  const select = await screen.findByRole("combobox", { name: "原文單字" });
  expect(screen.queryByRole("option", { name: "Changed" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Wrong" })).toBeNull();
  expect(screen.getAllByRole("option", { name: "Cats" })).toHaveLength(1);
  fireEvent.change(select, { target: { value: "Cats" } });
  fireEvent.change(screen.getByRole("textbox", { name: "圖中物件" }), { target: { value: "窗邊的貓咪" } });
  fireEvent.change(screen.getByRole("textbox", { name: "學習說明" }), { target: { value: "從圖片認識複數的貓" } });
  fireEvent.click(screen.getByRole("button", { name: "新增單字" }));
  expect((screen.getByRole("radio", { name: /Cats → 窗邊的貓咪/ }) as HTMLInputElement).checked).toBe(true);
  const confirm = screen.getByRole("checkbox");
  fireEvent.click(confirm);
  const approve = screen.getByRole("button", { name: "核准並選用" }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  const imageArea = screen.getByRole("img", { name: "花園裡的貓" }).parentElement!;
  vi.spyOn(imageArea, "getBoundingClientRect").mockReturnValue({
    left: 10, top: 20, width: 400, height: 200,
  } as DOMRect);
  fireEvent.click(imageArea, { clientX: 310, clientY: 70 });
  expect((confirm as HTMLInputElement).checked).toBe(false);
  fireEvent.click(confirm);
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/candidates/9/review") && init?.method === "POST")).toBe(true));
  const posts = vi.mocked(req).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1]!.body as string)).toEqual({
    decision: "approved", altText: "花園裡的貓", confirmed: true, reason: "",
    teachingTargets: [target("birds"), {
      word: "Cats", normalizedWord: "cats", visualObject: "窗邊的貓咪",
      reason: "從圖片認識複數的貓", anchor: { x: 0.75, y: 0.25 },
      confidence: 1, placementSource: "manual",
    }],
  });
});

it("prevents duplicates and a fourth target, and lets a removed word be added again", async () => {
  mockReview({ targets: [target("Cats"), target("birds")] });
  render(<Illustrations articleId={1} />);
  await screen.findByRole("combobox", { name: "原文單字" });
  expect((screen.getByRole("option", { name: "Cats（已加入）" }) as HTMLOptionElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "原文單字" }), { target: { value: "Cats" } });
  expect((screen.getByRole("button", { name: "新增單字" }) as HTMLButtonElement).disabled).toBe(true);
  await chooseWord("window-box");
  expect(screen.getByText(/每張圖片最多 3 個單字/)).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "原文單字" }) as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getAllByRole("button", { name: "移除此標示" })[0]);
  expect((screen.getByRole("combobox", { name: "原文單字" }) as HTMLSelectElement).disabled).toBe(false);
  await chooseWord("Cats");
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect((screen.getByRole("radio", { name: /Cats → Cats/ }) as HTMLInputElement).checked).toBe(true);
});

it.each(["cover", "reference"])("does not offer source words for %s images", async (kind) => {
  mockReview({ kind });
  render(<Illustrations articleId={1} />);
  await screen.findByRole("img", { name: "花園裡的貓" });
  expect(screen.queryByRole("button", { name: "新增單字" })).toBeNull();
});

it.each(["published", "superseded", "cancelled"])("does not allow adding words to a %s run", async (status) => {
  mockReview({ status });
  render(<Illustrations articleId={1} />);
  await screen.findByRole("img", { name: "花園裡的貓" });
  expect(screen.queryByRole("button", { name: "新增單字" })).toBeNull();
});

it("does not use current paragraph text when the version source is unavailable", async () => {
  mockReview({ source: null });
  render(<Illustrations articleId={1} />);
  await screen.findByRole("img", { name: "花園裡的貓" });
  expect(screen.queryByRole("button", { name: "新增單字" })).toBeNull();
});

it("does not allow adding words while the candidate is processing", async () => {
  mockReview({ candidateStatus: "processing" });
  render(<Illustrations articleId={1} />);
  await screen.findByRole("img", { name: "花園裡的貓" });
  expect(screen.queryByRole("button", { name: "新增單字" })).toBeNull();
});

it("keeps unsaved words during polling and resets them for a different candidate", async () => {
  const detail = mockReview();
  let poll: () => void = () => {};
  const originalInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, milliseconds: number) => {
    if (milliseconds === 3000) poll = callback;
    return originalInterval(callback, milliseconds);
  }) as typeof setInterval);
  render(<Illustrations articleId={1} />);
  await chooseWord("Cats");
  await act(async () => { poll(); });
  expect(screen.getByRole("radio", { name: /Cats → Cats/ })).toBeTruthy();
  detail.slots[0].candidates[0] = {
    ...detail.slots[0].candidates[0], id: "10", teaching_targets: [target("birds")],
  };
  await act(async () => { poll(); });
  expect(screen.queryByRole("radio", { name: /Cats → Cats/ })).toBeNull();
  expect(screen.getByRole("radio", { name: /birds → birds/ })).toBeTruthy();
});

it("prevents addition until the object and learning explanation are filled", async () => {
  mockReview();
  render(<Illustrations articleId={1} />);
  const select = await screen.findByRole("combobox", { name: "原文單字" });
  fireEvent.change(select, { target: { value: "Cats" } });
  const object = screen.getByRole("textbox", { name: "圖中物件" });
  const explanation = screen.getByRole("textbox", { name: "學習說明" });
  fireEvent.change(object, { target: { value: " " } });
  expect((screen.getByRole("button", { name: "新增單字" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(object, { target: { value: "貓" } });
  fireEvent.change(explanation, { target: { value: " " } });
  expect((screen.getByRole("button", { name: "新增單字" }) as HTMLButtonElement).disabled).toBe(true);
});
