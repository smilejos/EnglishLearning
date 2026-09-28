// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AudioBackfillPanel } from "./AudioBackfillPanel";
import * as api from "./api";

vi.mock("./api", () => ({ listMissingAudio: vi.fn(), backfillAudioTarget: vi.fn() }));

const items: api.MissingAudioTarget[] = [
  { kind: "word", id: 1, wordId: 1, articleId: null, word: "habit", articleTitle: null, text: "habit" },
  { kind: "enExplanation", id: 9, wordId: 1, articleId: 3, word: "habit", articleTitle: "Lesson A", text: "a regular practice" },
  { kind: "enExample", id: 9, wordId: 1, articleId: 3, word: "habit", articleTitle: "Lesson A", text: "A good habit helps." },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => false));
  vi.mocked(api.listMissingAudio).mockResolvedValue({ items });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("顯示逐檔清單並只補所選音檔", async () => {
  vi.mocked(api.backfillAudioTarget).mockResolvedValue({ fixedAudio: 1, alreadyComplete: false });
  vi.mocked(api.listMissingAudio).mockResolvedValueOnce({ items })
    .mockResolvedValueOnce({ items: items.slice(1) });
  render(<AudioBackfillPanel onBack={vi.fn()} />);
  await screen.findByText("待補 3 個音檔");
  expect(screen.getAllByRole("button", { name: /補齊 habit 的/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "補齊 habit 的單字發音" }));
  await waitFor(() => expect(api.backfillAudioTarget).toHaveBeenCalledWith(items[0]));
  expect(window.confirm).not.toHaveBeenCalled();
  await screen.findByText("待補 2 個音檔");
});

it("全部補檔逐檔執行，失敗後仍繼續並顯示結果", async () => {
  vi.mocked(api.backfillAudioTarget)
    .mockResolvedValueOnce({ fixedAudio: 1, alreadyComplete: false })
    .mockResolvedValueOnce({ fixedAudio: 0, alreadyComplete: false })
    .mockResolvedValueOnce({ fixedAudio: 1, alreadyComplete: false });
  vi.mocked(api.listMissingAudio).mockResolvedValueOnce({ items })
    .mockResolvedValueOnce({ items: [items[1]] });
  render(<AudioBackfillPanel onBack={vi.fn()} />);
  await screen.findByText("待補 3 個音檔");
  fireEvent.click(screen.getByRole("button", { name: "全部補檔" }));
  await screen.findByText("補檔完成。成功 2、已補齊 0、失敗 1。");
  expect(vi.mocked(api.backfillAudioTarget).mock.calls.map(([item]) => item.kind))
    .toEqual(["word", "enExplanation", "enExample"]);
  expect(window.confirm).not.toHaveBeenCalled();
  await screen.findByText("待補 1 個音檔");
});

it("全部補檔遇配額限制時等待後重試同一筆", async () => {
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, delay, ...args) =>
    realSetTimeout(handler, delay === 60_000 ? 0 : delay, ...args));
  vi.mocked(api.backfillAudioTarget)
    .mockRejectedValueOnce(Object.assign(new Error("Too Many Requests"), { status: 429 }))
    .mockResolvedValue({ fixedAudio: 1, alreadyComplete: false });
  render(<AudioBackfillPanel onBack={vi.fn()} />);
  await screen.findByText("待補 3 個音檔");
  fireEvent.click(screen.getByRole("button", { name: "全部補檔" }));
  await screen.findByText("補檔完成。成功 3、已補齊 0、失敗 0。");
  expect(vi.mocked(api.backfillAudioTarget).mock.calls.map(([item]) => item.kind))
    .toEqual(["word", "word", "enExplanation", "enExample"]);
});

it("配額等待後仍受限便停止，保留剩餘項目", async () => {
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, delay, ...args) =>
    realSetTimeout(handler, delay === 60_000 ? 0 : delay, ...args));
  vi.mocked(api.backfillAudioTarget).mockRejectedValue(Object.assign(new Error("Too Many Requests"), { status: 429 }));
  render(<AudioBackfillPanel onBack={vi.fn()} />);
  await screen.findByText("待補 3 個音檔");
  fireEvent.click(screen.getByRole("button", { name: "全部補檔" }));
  await screen.findByText("配額仍不足，已停止；稍後可再補剩餘音檔。成功 0、已補齊 0、失敗 1。");
  expect(api.backfillAudioTarget).toHaveBeenCalledTimes(2);
});

it("配額等待期間可停止，不再送出重試", async () => {
  vi.mocked(api.backfillAudioTarget).mockRejectedValueOnce(Object.assign(new Error("Too Many Requests"), { status: 429 }));
  render(<AudioBackfillPanel onBack={vi.fn()} />);
  await screen.findByText("待補 3 個音檔");
  fireEvent.click(screen.getByRole("button", { name: "全部補檔" }));
  await screen.findByText("處理進度：0 / 3；配額已滿，60 秒後重試");
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  await screen.findByText("已停止。成功 0、已補齊 0、失敗 0。");
  expect(api.backfillAudioTarget).toHaveBeenCalledTimes(1);
});

it("停止全部補檔後不再送出下一筆", async () => {
  let finishFirst!: (result: { fixedAudio: number; alreadyComplete: boolean }) => void;
  vi.mocked(api.backfillAudioTarget).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
  render(<AudioBackfillPanel onBack={vi.fn()} />);
  await screen.findByText("待補 3 個音檔");
  fireEvent.click(screen.getByRole("button", { name: "全部補檔" }));
  await waitFor(() => expect(api.backfillAudioTarget).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  finishFirst({ fixedAudio: 1, alreadyComplete: false });
  await screen.findByText("已停止。成功 1、已補齊 0、失敗 0。");
  expect(api.backfillAudioTarget).toHaveBeenCalledTimes(1);
});
