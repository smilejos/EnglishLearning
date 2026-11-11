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
it("建立圖片版本時先估價，再直接送出建立請求", async () => {
  const original = vi.mocked(req).getMockImplementation()!;
  const run = { id: "new", revision: 1, status: "pending", model_id: "test-model",
    actual_cost_usd_micros: "0", reserved_cost_usd_micros: "0", max_cost_usd_micros: "10000" };
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/illustration-runs") && init?.method === "POST") return { run } as never;
    if (path.endsWith("/illustration-runs") && !init?.method) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/new")) return { run, slots: [], attempts: [] } as never;
    return original(path, init);
  });
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "建立圖片版本" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "建立圖片版本" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) => path.endsWith("/illustration-runs") && init?.method === "POST")).toBe(true));
  const estimate = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/illustration-estimates"));
  const created = vi.mocked(req).mock.calls.find(([path, init]) => path.endsWith("/illustration-runs") && init?.method === "POST");
  expect(JSON.parse(String(estimate?.[1]?.body)).modelId).toBe("test-model");
  expect(JSON.parse(String(created?.[1]?.body)).estimateId).toBe("quote");
  expect(confirmation).not.toHaveBeenCalled();
});
it("blocks estimation when the globally configured image model is unavailable", async () => {
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path === "/generation-settings")
      return { settings: { image: { provider: "openai", model: "unavailable-model" } } } as never;
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  await screen.findByText("AI 配圖目前無法使用，仍可自行上傳圖片。");
  expect(screen.getByRole("button", { name: "建立圖片版本" }).hasAttribute("disabled")).toBe(true);
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
  await waitFor(() => expect(screen.getByRole("button", { name: "建立圖片版本" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "建立圖片版本" }));
  await screen.findByText("全站圖片模型已更新，請確認後再建立版本。");
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
it("reports skipped teaching words to the article word tab", async () => {
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
  const onValidationWarningsChange = vi.fn();
  render(<Illustrations articleId={1} onValidationWarningsChange={onValidationWarningsChange} />);
  await waitFor(() => expect(onValidationWarningsChange).toHaveBeenCalledWith([warning]));
  expect(screen.queryByText("教學單字調整")).toBeNull();
  expect(screen.queryByText(/過往請求有.*失敗紀錄/)).toBeNull();
  expect(vi.mocked(req).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});

it("keeps failed requests collapsed and hides acknowledged messages until a new failure", async () => {
  const run = { id: "3", revision: 1, status: "partial_failed", model_id: "test-model",
    actual_cost_usd_micros: "100", reserved_cost_usd_micros: "0", max_cost_usd_micros: "1000" };
  const detail = { run, slots: [], dismissedFailedAttemptId: "0", attempts: [
    { id: "152", state: "failed", operation_kind: "generate", api_model: "image-model",
      error: "Image provider rejected request (429)：RESOURCE_EXHAUSTED" },
  ] };
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, options) => {
    if (path.endsWith("/illustration-runs") && !options?.method) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/3")) return detail as never;
    if (path.endsWith("/illustration-runs/3/dismiss-failures")) {
      detail.dismissedFailedAttemptId = "152";
      return { dismissedFailedAttemptId: "152" } as never;
    }
    return original(path, options);
  });
  let poll: () => void = () => {};
  const originalInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, milliseconds: number) => {
    if (milliseconds === 3000) poll = callback;
    return originalInterval(callback, milliseconds);
  }) as typeof setInterval);
  render(<Illustrations articleId={1} />);
  expect(await screen.findByText("過往請求有 1 筆失敗紀錄")).toBeTruthy();
  expect((screen.getByText("查看詳細紀錄").closest("details") as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "清除錯誤訊息" }));
  await waitFor(() => expect(screen.queryByText("過往請求有 1 筆失敗紀錄")).toBeNull());
  detail.attempts.push({ id: "159", state: "failed", operation_kind: "generate", api_model: "image-model",
    error: "Image provider rejected request (429)：RESOURCE_EXHAUSTED" });
  await act(async () => { poll(); });
  expect(screen.getByText("過往請求有 1 筆失敗紀錄")).toBeTruthy();
});

it("shows the actual prompt kept with each generated candidate", async () => {
  mockReview();
  render(<Illustrations articleId={1} />);
  const summary = await screen.findByText("生成提示詞");
  fireEvent.click(summary);
  expect(summary.parentElement?.querySelector("pre")?.textContent).toBe("A garden.");
});

it("uses the shared workflow layout for legacy slots while keeping legacy actions", async () => {
  const detail = mockReview();
  detail.slots.push({
    id: "5", kind: "paragraph", paragraph_id: "67", idx: 1,
    text: "Wrong paragraph.", required: true, skip_reason: null, candidates: [],
  });
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  const nav = await screen.findByRole("navigation", { name: "圖片製作進度" });
  expect(nav.querySelectorAll("button")).toHaveLength(2);
  expect(screen.getByRole("textbox", { name: "圖片提示詞" }).getAttribute("readonly")).not.toBeNull();
  expect((screen.getByRole("textbox", { name: "圖片提示詞" }) as HTMLTextAreaElement).value).toBe("A garden.");
  expect(screen.queryByRole("button", { name: "產生建議提示詞" })).toBeNull();
  fireEvent.click(nav.querySelectorAll("button")[1]);
  expect(screen.getByText("Wrong paragraph.")).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "圖片提示詞" }) as HTMLTextAreaElement).value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "重新生成／恢復此段" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/slots/5/regenerate") && init?.method === "POST"
  )).toBe(true));
  expect(confirmation).not.toHaveBeenCalled();
  expect(vi.mocked(req).mock.calls.some(([path]) => /\/slots\/5\/(quote|plan|prompt|generate)$/.test(path))).toBe(false);
});

it("shows the selected legacy candidate instead of an older approved candidate", async () => {
  const detail = mockReview({ candidateStatus: "rejected" });
  const slot = detail.slots[0];
  Object.assign(slot, { selected_candidate_id: "9" });
  slot.candidates.unshift({ ...slot.candidates[0], id: "10", status: "approved",
    prompt_json: { prompt: "Another picture." } });
  render(<Illustrations articleId={1} />);
  const field = await screen.findByRole("textbox", { name: "圖片提示詞" }) as HTMLTextAreaElement;
  expect(field.value).toBe("A garden.");
  expect(screen.getByRole("navigation", { name: "圖片製作進度" }).textContent).toContain("已拒絕");
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
  altText?: string;
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
    id: "9", status: options.candidateStatus ?? "ready", alt_text: options.altText ?? "花園裡的貓",
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

it.each([
  ["取消工作", "/illustration-runs/3/cancel", "POST"],
  ["發布整套圖片", "/illustration-runs/3/publish", "POST"],
  ["刪除此版本", "/illustration-runs/3", "DELETE"],
])("%s 直接執行，不跳確認視窗", async (label, suffix, method) => {
  mockReview();
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith(suffix) && init?.method === method) return {} as never;
    return original(path, init);
  });
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  fireEvent.click(await screen.findByRole("button", { name: label }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith(suffix) && init?.method === method
  )).toBe(true));
  expect(confirmation).not.toHaveBeenCalled();
});

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
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "審核原因" })).toBeNull();
  const approve = screen.getByRole("button", { name: "核准並選用" }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  const imageArea = screen.getByRole("img", { name: "花園裡的貓" }).parentElement!;
  vi.spyOn(imageArea, "getBoundingClientRect").mockReturnValue({
    left: 10, top: 20, width: 400, height: 200,
  } as DOMRect);
  fireEvent.click(imageArea, { clientX: 310, clientY: 70 });
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/candidates/9/review") && init?.method === "POST")).toBe(true));
  const posts = vi.mocked(req).mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1]!.body as string)).toEqual({
    decision: "approved", altText: "花園裡的貓", confirmed: true,
    teachingTargets: [target("birds"), {
      word: "Cats", normalizedWord: "cats", visualObject: "窗邊的貓咪",
      reason: "從圖片認識複數的貓", anchor: { x: 0.75, y: 0.25 },
      confidence: 1, placementSource: "manual",
    }],
  });
});

it("asks for a reason only when rejecting a candidate", async () => {
  mockReview({ altText: "" });
  const rejectionReason = vi.spyOn(window, "prompt").mockReturnValue("  主體與故事不符  ");
  render(<Illustrations articleId={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "拒絕" }));
  expect(rejectionReason).toHaveBeenCalledWith("拒絕這張圖片的原因");
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/candidates/9/review") && init?.method === "POST")).toBe(true));
  const post = vi.mocked(req).mock.calls.find(([path, init]) =>
    path.endsWith("/candidates/9/review") && init?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({
    decision: "rejected", altText: "", teachingTargets: [],
    reason: "主體與故事不符", confirmed: true,
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

it("creates a fill-in version from a published edition without a confirmation dialog", async () => {
  const run = { id: "40", revision: 1, status: "published", model_id: "test-model",
    actual_cost_usd_micros: "100", reserved_cost_usd_micros: "0", max_cost_usd_micros: "1000" };
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/illustration-runs") && !init?.method) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/40")) return { run, slots: [{ id: "skip", kind: "paragraph",
      paragraph_id: "66", idx: 0, text: "A flag.", required: false, skip_reason: "", candidates: [] }], attempts: [] } as never;
    if (path.endsWith("/illustration-runs/manual")) return { run: { ...run, id: "new", revision: 2, workflow_version: 2 } } as never;
    if (path.endsWith("/illustration-runs/new")) return { run: { ...run, id: "new", revision: 2, workflow_version: 2 }, slots: [], attempts: [] } as never;
    return original(path, init);
  });
  const confirmation = vi.spyOn(window, "confirm");
  render(<Illustrations articleId={1} />);
  expect(await screen.findByRole("button", { name: "修改圖片" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "修改圖片" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/illustration-runs/manual"))).toBe(true));
  const creation = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/illustration-runs/manual"));
  expect(JSON.parse(String(creation?.[1]?.body)).sourceRunId).toBe(40);
  expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/illustration-estimates"))).toBe(false);
  expect(confirmation).not.toHaveBeenCalled();
});

it("offers modification for a fully illustrated published run and unlocks its inherited cover", async () => {
  const oldRun = { id: "40", revision: 1, workflow_version: 2, status: "published", model_id: "test-model",
    actual_cost_usd_micros: "100", reserved_cost_usd_micros: "0", max_cost_usd_micros: "10000" };
  const newRun = { ...oldRun, id: "new", revision: 2, status: "review", source_mode: "manual" };
  const oldSlot = { id: "old-cover", kind: "cover", paragraph_id: null, idx: null, text: null,
    required: true, skip_reason: null, selected_candidate_id: "original", prompt_draft: "Original cover",
    prompt_revision: 1, prompt_status: "ready", candidates: [{ id: "original", status: "approved",
      alt_text: "Cover", teaching_targets: [], url: null, latest_error: null, prompt_json: { prompt: "Original cover" } }] };
  const inheritedSlot = { ...oldSlot, id: "new-cover", selected_candidate_id: "copy",
    candidates: [{ ...oldSlot.candidates[0], id: "copy", derived_from_candidate_id: "original" }] };
  const original = vi.mocked(req).getMockImplementation()!;
  let forked = false;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/illustration-runs") && !init?.method) return { runs: forked ? [newRun, oldRun] : [oldRun] } as never;
    if (path.endsWith("/illustration-runs/40") && !init?.method) return { run: oldRun, slots: [oldSlot], attempts: [
      { id: "116", slot_id: "old-cover", operation_kind: "plan", state: "uncertain" },
    ] } as never;
    if (path.endsWith("/illustration-runs/manual")) { forked = true; return { run: newRun } as never; }
    if (path.endsWith("/illustration-runs/new") && !init?.method) return { run: newRun, slots: [inheritedSlot], attempts: [] } as never;
    if (path.endsWith("/slots/new-cover/quote")) return { planCostUsdMicros: 100, generateCostUsdMicros: 200,
      remainingCostUsdMicros: 10000, actualCostUsdMicros: 0, reservedCostUsdMicros: 0 } as never;
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "修改圖片" }));
  fireEvent.click(await screen.findByText("使用 AI 配圖"));
  await waitFor(() => expect((screen.getByRole("textbox", { name: "圖片提示詞" }) as HTMLTextAreaElement).disabled).toBe(false));
  const editor = screen.getByRole("textbox", { name: "圖片提示詞" });
  expect((editor as HTMLTextAreaElement).value).toBe("Original cover");
  await waitFor(() => expect(screen.getByRole("button", { name: "再生成一張" }).hasAttribute("disabled")).toBe(false));
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

function mockWorkflow() {
  const run = {
    id: "workflow", revision: 2, workflow_version: 2, status: "planning", model_id: "test-model",
    visual_bible: "Blue uniforms and a riverside school",
    actual_cost_usd_micros: "0", reserved_cost_usd_micros: "0", max_cost_usd_micros: "10000",
  };
  const slots = [
    { id: "reference", kind: "reference", paragraph_id: null, idx: null, text: null, required: true,
      skip_reason: null, prompt_draft: "First reference", prompt_revision: 1, prompt_status: "ready", candidates: [] },
    { id: "cover", kind: "cover", paragraph_id: null, idx: null, text: null, required: true,
      skip_reason: null, prompt_draft: null, prompt_revision: 0, prompt_status: "empty", candidates: [] },
    { id: "paragraph", kind: "paragraph", paragraph_id: 66, idx: 0, text: "The flag flies.", required: true,
      skip_reason: null, prompt_draft: null, prompt_revision: 0, prompt_status: "empty", candidates: [] },
  ];
  const attempts: Array<{ id: string; slot_id: string; operation_kind: string; state: string; error?: string;
    api_model?: string; started_at?: string; finished_at?: string }> = [];
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/illustration-runs") && !init?.method) return { runs: [run] } as never;
    if (path.endsWith("/illustration-runs/workflow")) return { run, slots, attempts } as never;
    if (path.endsWith("/slots/reference/quote") || path.endsWith("/slots/paragraph/quote"))
      return { planCostUsdMicros: 100, generateCostUsdMicros: 200, remainingCostUsdMicros: 10000,
        actualCostUsdMicros: 0, reservedCostUsdMicros: 0 } as never;
    if (path.endsWith("/illustration-runs/workflow/visual-bible") && init?.method === "PUT") {
      run.visual_bible = JSON.parse(String(init.body)).visualBible;
      return { ok: true } as never;
    }
    if (path.endsWith("/slots/reference/prompt") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      slots[0].prompt_draft = body.prompt;
      slots[0].prompt_revision += 1;
      return { revision: slots[0].prompt_revision } as never;
    }
    if (path.endsWith("/slots/reference/generate")) return { ok: true } as never;
    if (path.endsWith("/slots/reference/plan")) return { ok: true } as never;
    if (path.endsWith("/slots/paragraph/skip")) return { ok: true } as never;
    return original(path, init);
  });
  return { run, slots, attempts };
}

it("shows automatic image retry progress until the same candidate is ready", async () => {
  const { slots } = mockWorkflow();
  const candidate = { id: "112", status: "pending", alt_text: "秋天遷徙",
    teaching_targets: [], url: null as string | null,
    latest_error: "Image provider rejected request (429)：RESOURCE_EXHAUSTED" as string | null,
    prompt_json: { prompt: "Autumn migration" } };
  slots[0].candidates.push(candidate as never);
  let poll: () => void = () => {};
  const originalInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, milliseconds: number) => {
    if (milliseconds === 3000) poll = callback;
    return originalInterval(callback, milliseconds);
  }) as typeof setInterval);
  render(<Illustrations articleId={1} />);
  expect(await screen.findByText("系統已排定自動重試")).toBeTruthy();
  expect(screen.getByText(/供應商回覆配額或速率限制/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "等待圖片生成" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("navigation", { name: "圖片製作進度" }).textContent).toContain("等待自動重試");

  candidate.status = "processing";
  await act(async () => { poll(); });
  expect(screen.getByText("正在生成圖片")).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "圖片製作進度" }).textContent).toContain("生成中");

  candidate.status = "ready";
  candidate.url = "/images/candidate-112.webp";
  candidate.latest_error = null;
  await act(async () => { poll(); });
  expect(screen.queryByText("正在生成圖片")).toBeNull();
  expect(screen.getByRole("img", { name: "秋天遷徙" }).getAttribute("src")).toBe(candidate.url);
  expect(screen.getByRole("navigation", { name: "圖片製作進度" }).textContent).toContain("待審核");
  await waitFor(() => expect(screen.getByRole("button", { name: "再生成一張" }).hasAttribute("disabled")).toBe(false));
});

it.each([null, "Historical reference prompt"])("shows an imported optional reference without creating work (%s)", async (prompt) => {
  const { run, slots } = mockWorkflow();
  Object.assign(run, { legacy_imported: true });
  Object.assign(slots[0], { required: false, skip_reason: "舊版未建立參考圖", prompt_draft: prompt,
    candidates: prompt ? [{ id: "old", status: "rejected", alt_text: "歷史參考圖", teaching_targets: [],
      url: null, latest_error: null, prompt_json: { prompt } }] : [] });
  render(<Illustrations articleId={1} />);
  const nav = await screen.findByRole("navigation", { name: "圖片製作進度" });
  expect((nav.querySelectorAll("button")[1] as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(nav.querySelectorAll("button")[0]);
  expect((screen.getByRole("textbox", { name: "圖片提示詞" }) as HTMLTextAreaElement).value).toBe(prompt ?? "");
  expect(screen.queryByRole("button", { name: "產生建議提示詞" })).toBeNull();
});

it("keeps later staged steps locked when the selected candidate was rejected", async () => {
  const { slots } = mockWorkflow();
  Object.assign(slots[0], { selected_candidate_id: "rejected", candidates: [
    { id: "rejected", status: "rejected", alt_text: "參考圖", teaching_targets: [],
      url: null, latest_error: null, prompt_json: { prompt: "Rejected reference" } },
    { id: "older", status: "approved", alt_text: "先前參考圖", teaching_targets: [],
      url: null, latest_error: null, prompt_json: { prompt: "Older reference" } },
  ] });
  render(<Illustrations articleId={1} />);
  const nav = await screen.findByRole("navigation", { name: "圖片製作進度" });
  expect((nav.querySelectorAll("button")[1] as HTMLButtonElement).disabled).toBe(true);
  expect(nav.querySelectorAll("button")[0].textContent).not.toContain("已核准");
});

it("labels staged planning failures without changing legacy history labels", async () => {
  const { attempts } = mockWorkflow();
  attempts.push({ id: "118", slot_id: "reference", operation_kind: "plan", state: "failed", error: "規劃失敗" });
  render(<Illustrations articleId={1} />);
  expect(await screen.findByText(/請求 118 · 分階段提示詞規劃/)).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "視覺版本" }) as HTMLSelectElement).selectedOptions[0].textContent).toContain("版本 2 · 提示詞規劃中");
});

it("starts a suggested prompt plan without a second confirmation", async () => {
  const { slots } = mockWorkflow();
  slots[0].prompt_draft = null;
  slots[0].prompt_status = "empty";
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  await screen.findByText("$0.0001");
  fireEvent.click(screen.getByRole("button", { name: "產生建議提示詞" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/slots/reference/plan"))).toBe(true));
  expect(confirmation).not.toHaveBeenCalled();
});

it("accepts an uncertain prompt plan charge without a second confirmation", async () => {
  const { attempts } = mockWorkflow();
  attempts.push({ id: "uncertain-plan", slot_id: "reference", operation_kind: "plan", state: "uncertain" });
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  await screen.findByText("$0.0001");
  fireEvent.click(screen.getByRole("button", { name: "重新建議提示詞" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/slots/reference/plan") && JSON.parse(String(init?.body)).acceptUnknownCharge === true
  )).toBe(true));
  const plan = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/slots/reference/plan"));
  expect(JSON.parse(String(plan?.[1]?.body)).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(confirmation).not.toHaveBeenCalled();
});

it("acknowledges an older uncertain Prompt request even after a newer plan succeeds", async () => {
  const { run, attempts } = mockWorkflow();
  run.status = "pending";
  attempts.push({ id: "115", slot_id: "reference", operation_kind: "plan", state: "uncertain" });
  attempts.push({ id: "117", slot_id: "reference", operation_kind: "plan", state: "succeeded" });
  render(<Illustrations articleId={1} />);
  expect(await screen.findByRole("option", { name: /等待下一步/ })).toBeTruthy();
  await screen.findByText("$0.0001");
  fireEvent.click(screen.getByRole("button", { name: "重新建議提示詞" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/slots/reference/plan") && JSON.parse(String(init?.body)).acceptUnknownCharge === true
  )).toBe(true));
});

it("acknowledges an uncertain Prompt request when generating from a saved Prompt", async () => {
  const { attempts } = mockWorkflow();
  attempts.push({ id: "116", slot_id: "reference", operation_kind: "plan", state: "uncertain" });
  render(<Illustrations articleId={1} />);
  await screen.findByText("$0.0002");
  fireEvent.click(screen.getByRole("button", { name: "生成圖片" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/slots/reference/generate") && JSON.parse(String(init?.body)).acceptUnknownCharge === true
  )).toBe(true));
  expect(screen.getByRole("alert").textContent).toContain("目前這個步驟已有提示詞");
});

it("explains which Prompt request has no result and what is still unknown", async () => {
  const { attempts } = mockWorkflow();
  attempts.push({ id: "116", slot_id: "cover", operation_kind: "plan", state: "uncertain",
    api_model: "gemini-3.8-flash", started_at: "2026-09-28T02:56:07Z", finished_at: "2026-09-28T02:59:07Z" });
  render(<Illustrations articleId={1} />);
  const notice = await screen.findByRole("alert");
  expect(notice.textContent).toContain("請求 116：封面提示詞規劃結果不明");
  expect(notice.textContent).toContain("等待約 3 分鐘");
  expect(notice.textContent).toContain("規劃結果未套用");
  expect(notice.textContent).toContain("供應商是否完成處理或計費，目前無法從系統確認");
  expect(notice.textContent).toContain("可手動填寫");
  expect(notice.textContent).not.toContain("重試該圖片");
});

it("shows and saves the story's editable visual setting before reference approval", async () => {
  mockWorkflow();
  render(<Illustrations articleId={1} />);
  const field = await screen.findByRole("textbox", { name: "故事主體與畫風設定" });
  expect((field as HTMLTextAreaElement).value).toContain("riverside school");
  fireEvent.change(field, { target: { value: "Blue uniforms, riverside school, watercolor" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存視覺設定" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/workflow/visual-bible") && init?.method === "PUT" &&
    JSON.parse(String(init.body)).visualBible === "Blue uniforms, riverside school, watercolor"
  )).toBe(true));
});

it("locks visual-setting edits while the reference prompt is being planned", async () => {
  const { slots } = mockWorkflow();
  slots[0].prompt_status = "planning";
  render(<Illustrations articleId={1} />);
  const field = await screen.findByRole("textbox", { name: "故事主體與畫風設定" });
  expect(field.hasAttribute("disabled")).toBe(true);
  expect(screen.getByPlaceholderText("正在整理視覺設定…")).toBeTruthy();
});

it("keeps newer visual-setting edits when an older save finishes during polling", async () => {
  const { run } = mockWorkflow();
  const original = vi.mocked(req).getMockImplementation()!;
  let finishFirst: (() => void) | undefined;
  let writes = 0;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/workflow/visual-bible") && init?.method === "PUT") {
      writes += 1;
      const value = JSON.parse(String(init.body)).visualBible;
      if (writes === 1) await new Promise<void>((resolve) => { finishFirst = resolve; });
      run.visual_bible = value;
      return { ok: true } as never;
    }
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  const field = await screen.findByRole("textbox", { name: "故事主體與畫風設定" }) as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: "Older visual setting" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存視覺設定" }));
  await waitFor(() => expect(finishFirst).toBeTypeOf("function"));
  fireEvent.change(field, { target: { value: "Newer visual setting" } });
  await act(async () => { finishFirst!(); });
  expect(field.value).toBe("Newer visual setting");
  expect(screen.getByRole("button", { name: "儲存視覺設定" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "儲存視覺設定" }));
  await waitFor(() => expect(run.visual_bible).toBe("Newer visual setting"));
});

it("keeps a workflow prompt during polling and sends its exact edited text to generation", async () => {
  const { slots } = mockWorkflow();
  let poll: () => void = () => {};
  const originalInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, milliseconds: number) => {
    if (milliseconds === 3000) poll = callback;
    return originalInterval(callback, milliseconds);
  }) as typeof setInterval);
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  const editor = await screen.findByRole("textbox", { name: "圖片提示詞" });
  fireEvent.change(editor, { target: { value: "An exact edited reference" } });
  await act(async () => { poll(); });
  expect((editor as HTMLTextAreaElement).value).toBe("An exact edited reference");
  await screen.findByText("$0.0002");
  fireEvent.click(screen.getByRole("button", { name: "生成圖片" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/slots/reference/generate"))).toBe(true));
  const saved = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/slots/reference/prompt"));
  const generated = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/slots/reference/generate"));
  expect(JSON.parse(String(saved?.[1]?.body))).toEqual({ prompt: "An exact edited reference", revision: 1 });
  expect(JSON.parse(String(generated?.[1]?.body))).toMatchObject({ prompt: "An exact edited reference", revision: 2, acceptUnknownCharge: false });
  expect(JSON.parse(String(generated?.[1]?.body)).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(slots[0].prompt_draft).toBe("An exact edited reference");
  expect(confirmation).not.toHaveBeenCalled();
});

it("regenerates an image after an uncertain result without a second confirmation", async () => {
  const { slots } = mockWorkflow();
  slots[0].candidates.push({ id: "previous-image", status: "ready", alt_text: "參考圖",
    teaching_targets: [], url: null, latest_error: null, prompt_json: { prompt: "First reference" } } as never);
  slots[0].candidates.push({ id: "uncertain-image", status: "uncertain", alt_text: null,
    teaching_targets: [], url: null, latest_error: null, prompt_json: { prompt: "First reference" } } as never);
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  await screen.findByText("$0.0002");
  fireEvent.click(screen.getByRole("button", { name: "再生成一張" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path, init]) =>
    path.endsWith("/slots/reference/generate") && JSON.parse(String(init?.body)).acceptUnknownCharge === true
  )).toBe(true));
  expect(confirmation).not.toHaveBeenCalled();
});

it("reuses the same image idempotency key after a network failure", async () => {
  mockWorkflow();
  const original = vi.mocked(req).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/slots/reference/generate")) {
      attempts += 1;
      if (attempts === 1) throw new Error("連線中斷");
      return { ok: true } as never;
    }
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  await screen.findByText("$0.0002");
  fireEvent.click(screen.getByRole("button", { name: "生成圖片" }));
  await screen.findByText("連線中斷");
  fireEvent.click(screen.getByRole("button", { name: "生成圖片" }));
  await waitFor(() => expect(attempts).toBe(2));
  const sent = vi.mocked(req).mock.calls.filter(([path]) => path.endsWith("/slots/reference/generate"))
    .map(([, init]) => JSON.parse(String(init?.body)).idempotencyKey);
  expect(sent[0]).toBe(sent[1]);
});

it("offers later paragraph work after approval and skips without asking for a reason", async () => {
  const { slots } = mockWorkflow();
  const approved = { id: "chosen", status: "approved", alt_text: "Approved", teaching_targets: [],
    url: "/images/chosen.webp", latest_error: null, prompt_json: { prompt: "Actual prompt" } };
  slots[0].candidates.push(approved as never);
  slots[1].candidates.push(approved as never);
  Object.assign(slots[0], { selected_candidate_id: "chosen" });
  Object.assign(slots[1], { selected_candidate_id: "chosen" });
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Illustrations articleId={1} />);
  await screen.findByRole("button", { name: "略過此段" });
  expect(screen.getByText("The flag flies.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "略過此段" }));
  await waitFor(() => {
    expect(vi.mocked(req).mock.calls.some(([path, init]) =>
      path.endsWith("/slots/paragraph/skip") && init?.method === "POST" && init.body === "{}"
    )).toBe(true);
  });
  expect(confirmation).not.toHaveBeenCalled();
});

function mockManualImages(options: { empty?: boolean; unavailable?: boolean; uploadError?: boolean } = {}) {
  const run = { id: "90", revision: 1, status: "pending", workflow_version: 2, source_mode: "manual",
    model_id: "test-model", actual_cost_usd_micros: "0", reserved_cost_usd_micros: "0", max_cost_usd_micros: "10000" };
  type Uploaded = { id: string; status: string; source: string; alt_text: string; teaching_targets: never[];
    url: string; latest_error: null; prompt_json: { prompt: string } };
  const slots = [
    { id: "91", kind: "cover", paragraph_id: null as number | null, idx: null as number | null, text: null as string | null,
      required: false, selected_candidate_id: null as string | null, skip_reason: "不放封面", prompt_status: "empty",
      prompt_draft: null as string | null, candidates: [] as Uploaded[] },
    { id: "92", kind: "paragraph", paragraph_id: 66, idx: 0, text: "A cat in a garden.", required: true,
      selected_candidate_id: null as string | null, skip_reason: null as string | null, prompt_status: "empty",
      prompt_draft: null as string | null, candidates: [] as Uploaded[] },
    { id: "93", kind: "paragraph", paragraph_id: 67, idx: 1, text: "A flag flies.", required: true,
      selected_candidate_id: null as string | null, skip_reason: null as string | null, prompt_status: "empty",
      prompt_draft: null as string | null, candidates: [] as Uploaded[] },
  ];
  const original = vi.mocked(req).getMockImplementation()!;
  let exists = !options.empty;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (options.unavailable && path === "/image-models") return { models: [] } as never;
    if (path.endsWith("/illustration-runs") && !init?.method) return { runs: exists ? [run] : [] } as never;
    if (path.endsWith("/illustration-runs/90")) return { run, slots, attempts: [], source_json: {} } as never;
    if (path.endsWith("/illustration-runs/manual")) { exists = true; return { run } as never; }
    const slot = slots.find((item) => path.includes(`/slots/${item.id}/`));
    if (slot && path.endsWith("/upload")) {
      if (options.uploadError) throw new Error("上傳失敗，請重試");
      const body = JSON.parse(String(init?.body));
      const candidate = { id: String(100 + slot.candidates.length), status: "approved", source: "upload",
        alt_text: body.altText || "使用者圖片", teaching_targets: [] as never[], url: "/images/upload.webp",
        latest_error: null, prompt_json: { prompt: "" } };
      slot.candidates.push(candidate);
      slot.selected_candidate_id = candidate.id;
      slot.required = true;
      return { ok: true, candidateId: candidate.id } as never;
    }
    if (slot && path.endsWith("/skip")) {
      slot.required = false; slot.selected_candidate_id = null;
      run.status = slots.every((item) => !item.required || item.selected_candidate_id != null) ? "review" : "pending";
      return { ok: true } as never;
    }
    if (slot && path.endsWith("/quote")) return { planCostUsdMicros: 100, generateCostUsdMicros: 200,
      remainingCostUsdMicros: 10000, actualCostUsdMicros: 0, reservedCostUsdMicros: 0 } as never;
    if (path.endsWith("/publish")) { run.status = "published"; return { ok: true } as never; }
    return original(path, init);
  });
  return { run, slots };
}

async function selectUpload(file = new File(["test-image"], "garden.png", { type: "image/png" })) {
  fireEvent.change(await screen.findByLabelText("上傳圖片"), { target: { files: [file] } });
  return screen.findByRole("button", { name: "上傳並選用" });
}

it("creates a manual edition even with no available image model and never estimates or plans", async () => {
  mockManualImages({ empty: true, unavailable: true });
  render(<Illustrations articleId={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "自行配圖" }));
  await screen.findByLabelText("上傳圖片");
  const creation = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/illustration-runs/manual"));
  expect(JSON.parse(String(creation?.[1]?.body)).idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(vi.mocked(req).mock.calls.some(([path]) => /estimates|\/quote$|\/plan$|\/generate$/.test(path))).toBe(false);
  expect(screen.queryByRole("textbox", { name: "圖片提示詞" })).toBeNull();
});

it("lets manual editions visit any paragraph or optional cover without completing previous steps", async () => {
  mockManualImages();
  render(<Illustrations articleId={1} />);
  const second = (await screen.findAllByRole("button", { name: /第 2 段/ }))[0];
  expect((second as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(second);
  expect(await screen.findByText("A flag flies.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /封面/ }));
  expect(await screen.findByText(/目前不放封面，/)).toBeTruthy();
  expect(screen.getByLabelText("上傳圖片")).toBeTruthy();
  expect(screen.queryByText("故事主體與畫風設定")).toBeNull();
});

it("previews a selected file and uploads it as the chosen image without another approval", async () => {
  const { slots } = mockManualImages();
  render(<Illustrations articleId={1} />);
  const upload = await selectUpload();
  expect(screen.getByRole("img", { name: "待上傳圖片預覽" }).getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  fireEvent.change(screen.getByLabelText("圖片說明（選填）"), { target: { value: "花園中的貓" } });
  fireEvent.click(upload);
  await screen.findByRole("img", { name: "花園中的貓" });
  expect(slots[1].selected_candidate_id).toBe("100");
  const call = vi.mocked(req).mock.calls.find(([path]) => path.endsWith("/slots/92/upload"));
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ altText: "花園中的貓", dataBase64: "dGVzdC1pbWFnZQ==" });
  expect(screen.getByText(/目前選用 100 · 自行上傳/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "核准並選用" })).toBeNull();
  expect(screen.getByLabelText("替換圖片")).toBeTruthy();
  expect(vi.mocked(req).mock.calls.some(([path]) => /\/review$|\/plan$|\/generate$|\/quote$/.test(path))).toBe(false);
});

it("rejects unsupported and oversized uploads before reading or making an upload request", async () => {
  mockManualImages();
  render(<Illustrations articleId={1} />);
  const field = await screen.findByLabelText("上傳圖片");
  fireEvent.change(field, { target: { files: [new File(["gif"], "animated.gif", { type: "image/gif" })] } });
  expect(await screen.findByText("請選擇 JPG、PNG 或 WebP 圖片。")).toBeTruthy();
  const large = new File(["image"], "big.jpg", { type: "image/jpeg" });
  Object.defineProperty(large, "size", { value: 10 * 1024 * 1024 + 1 });
  fireEvent.change(field, { target: { files: [large] } });
  expect(await screen.findByText(/圖片需大於 0 且不超過 10 MB/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "上傳並選用" })).toBeNull();
  expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/upload"))).toBe(false);
});

it("retains the preview after an upload failure and reuses the same request key on retry", async () => {
  mockManualImages({ uploadError: true });
  render(<Illustrations articleId={1} />);
  fireEvent.click(await selectUpload());
  await screen.findByText("上傳失敗，請重試");
  expect(screen.getByRole("img", { name: "待上傳圖片預覽" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "上傳並選用" }));
  await waitFor(() => expect(vi.mocked(req).mock.calls.filter(([path]) => path.endsWith("/upload"))).toHaveLength(2));
  const uploads = vi.mocked(req).mock.calls.filter(([path]) => path.endsWith("/upload"));
  expect(JSON.parse(String(uploads[0][1]?.body)).idempotencyKey).toBe(JSON.parse(String(uploads[1][1]?.body)).idempotencyKey);
});

it("blocks uploads and removals while the slot has active image work", async () => {
  const { slots } = mockManualImages();
  slots[1].prompt_status = "planning";
  render(<Illustrations articleId={1} />);
  expect((await screen.findByLabelText("上傳圖片") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "不放圖片" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("完成後即可上傳或移除");
});

it("removes selected uploaded images, preserves the candidates, and publishes without a cover", async () => {
  const { slots } = mockManualImages();
  render(<Illustrations articleId={1} />);
  fireEvent.click(await selectUpload());
  fireEvent.click(await screen.findByRole("button", { name: "移除圖片" }));
  await waitFor(() => expect(slots[1].selected_candidate_id).toBeNull());
  expect(slots[1].candidates).toHaveLength(1);
  fireEvent.click(screen.getAllByRole("button", { name: /第 2 段/ })[0]);
  fireEvent.click(await screen.findByRole("button", { name: "不放圖片" }));
  await waitFor(() => expect(slots[2].required).toBe(false));
  fireEvent.click(await screen.findByRole("button", { name: "發布整套圖片" }));
  await waitFor(() => expect(screen.queryByLabelText("上傳圖片")).toBeNull());
  expect(slots[0].required).toBe(false);
  expect(screen.getByRole("combobox", { name: "視覺版本" }).textContent).toContain("已發布");
});

it("opens AI controls only when requested in a manual edition", async () => {
  mockManualImages();
  render(<Illustrations articleId={1} />);
  await screen.findByLabelText("上傳圖片");
  expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/quote"))).toBe(false);
  fireEvent.click(screen.getByText("使用 AI 配圖"));
  expect(await screen.findByRole("textbox", { name: "圖片提示詞" })).toBeTruthy();
  await waitFor(() => expect(vi.mocked(req).mock.calls.some(([path]) => path.endsWith("/slots/92/quote"))).toBe(true));
});

it("keeps manual creation available when image settings cannot be loaded", async () => {
  mockManualImages({ empty: true });
  const original = vi.mocked(req).getMockImplementation()!;
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path === "/image-models" || path === "/generation-settings") throw new Error("AI settings unavailable");
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  await screen.findByText("AI 配圖目前無法使用，仍可自行上傳圖片。");
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "自行配圖" }));
  await screen.findByLabelText("上傳圖片");
});

it("shows FileReader errors and permits choosing another image", async () => {
  mockManualImages();
  const originalRead = FileReader.prototype.readAsDataURL;
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementationOnce(function (this: FileReader) {
    this.dispatchEvent(new ProgressEvent("error"));
  });
  render(<Illustrations articleId={1} />);
  fireEvent.change(await screen.findByLabelText("上傳圖片"), { target: { files: [new File(["broken"], "first.png", { type: "image/png" })] } });
  expect(await screen.findByText("無法讀取圖片，請重新選擇。")).toBeTruthy();
  vi.mocked(FileReader.prototype.readAsDataURL).mockImplementation(originalRead);
  expect(await selectUpload()).toBeTruthy();
  expect(screen.queryByText("無法讀取圖片，請重新選擇。")).toBeNull();
});

it("disables the file picker and submit button until an upload finishes", async () => {
  mockManualImages();
  const original = vi.mocked(req).getMockImplementation()!;
  let finish: () => void = () => {};
  vi.mocked(req).mockImplementation(async (path, init) => {
    if (path.endsWith("/upload")) {
      await new Promise<void>((resolve) => { finish = resolve; });
      return original(path, init);
    }
    return original(path, init);
  });
  render(<Illustrations articleId={1} />);
  fireEvent.click(await selectUpload());
  expect((screen.getByRole("button", { name: "正在上傳…" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("上傳圖片") as HTMLInputElement).disabled).toBe(true);
  await act(async () => finish());
  await screen.findByLabelText("替換圖片");
});

it("keeps reference approval separate from uploading cover and paragraph pictures", async () => {
  mockWorkflow();
  render(<Illustrations articleId={1} />);
  await screen.findByRole("region", { name: "視覺設定與參考圖" });
  expect(screen.queryByLabelText("上傳圖片")).toBeNull();
});
