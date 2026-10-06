import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WordbankPractice } from "./WordbankPractice";
import * as api from "./api";
import { _resetAudioBus } from "./lib/audioBus";
import type { WordbankEntry, WordbankOptions, WordbankQuestion } from "./wordbankTypes";

vi.mock("./api", () => ({ getWordbankOptions: vi.fn(), getWordbankQuestion: vi.fn(), wordbankAudioUrl: (url: string) => url }));
const options: WordbankOptions = { total: 9166, systems: {
  list: [{ value: "all", count: 9166 }, { value: "basic", count: 1193 }, { value: "advance", count: 3000 }, { value: "unclassified", count: 10 }],
  cefr: [{ value: "all", count: 9166 }, { value: "A1", count: 500 }, { value: "A2", count: 600 }, { value: "unclassified", count: 100 }],
  tw_7000: [{ value: "all", count: 9166 }, { value: "1", count: 500 }],
} };
const entry: WordbankEntry = {
  guid: "apple-guid", word: "apple", partsOfSpeech: ["noun"], definition: "蘋果", explains: [{ guid: "exp1", en: "A round fruit.", audioUrl: "/audio/exp1.mp3" }, { guid: "exp2", en: "A fruit growing on trees.", audioUrl: null }],
  level: { list: "basic", cefr: "A1", tw_7000: 1 }, wordAudioUrl: "/audio/apple.mp3",
  examples: [1, 2, 3].map((n) => ({ guid: `ex${n}`, en: `I eat an apple ${n}.`, zh: `我吃蘋果 ${n}。`, audioUrl: n === 3 ? null : `/audio/ex${n}.mp3` })),
};
let audios: { url: string; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; onended: null | (() => void); onerror: null | (() => void) }[];
beforeEach(() => {
  vi.resetAllMocks(); _resetAudioBus(); audios = [];
  vi.mocked(api.getWordbankOptions).mockResolvedValue(options);
  vi.mocked(api.getWordbankQuestion).mockResolvedValue({ poolSize: 1193, entry });
  vi.stubGlobal("Audio", vi.fn((url: string) => {
    const audio = { url, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), onended: null, onerror: null };
    audios.push(audio); return audio;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("字庫練習", () => {
  it("單純練習直接呈現完整字義及三中英例句，無音檔明確停用", async () => {
    render(<WordbankPractice />);
    await screen.findByRole("heading", { name: "apple" });
    expect(screen.getByText("蘋果")).toBeTruthy();
    expect(screen.getByText("A fruit growing on trees.")).toBeTruthy();
    expect(screen.getByText("我吃蘋果 3。")).toBeTruthy();
    const missing = screen.getByRole("button", { name: "朗讀例句 3（音檔待準備）" }) as HTMLButtonElement;
    expect(missing.disabled).toBe(true);
    fireEvent.click(missing);
    expect(audios).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "揭曉答案" })).toBeNull();
    expect(screen.queryByRole("button", { name: /收藏/ })).toBeNull();
  });

  it("聽力只露字首，揭曉前DOM及播放標籤不含答案與例句", async () => {
    const { container } = render(<WordbankPractice />);
    await screen.findByRole("heading", { name: "apple" });
    fireEvent.click(screen.getByRole("button", { name: "聽力練習" }));
    const hint = await screen.findByRole("heading", { name: "單字提示" });
    expect(hint.textContent).toBe("a••••");
    expect(container.innerHTML).not.toContain("apple");
    expect(container.textContent).not.toContain("蘋果");
    expect(container.textContent).not.toContain("A round fruit.");
    expect(screen.queryByRole("button", { name: /朗讀英文解釋/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "揭曉答案" }));
    expect(screen.getByRole("heading", { name: "apple" })).toBeTruthy();
    expect(screen.getByText("I eat an apple 1.")).toBeTruthy();
    expect(screen.getByText("我吃蘋果 1。")).toBeTruthy();
  });

  it("英文解釋可朗讀並與其他音源互斥，挑戰可聽提示，聽力揭曉才開放", async () => {
    render(<WordbankPractice />);
    await screen.findByRole("heading", { name: "apple" });
    expect((screen.getByRole("button", { name: "朗讀英文解釋 2（音檔待準備）" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "朗讀單字" }));
    fireEvent.click(screen.getByRole("button", { name: "朗讀英文解釋 1" }));
    expect(audios[0].pause).toHaveBeenCalled();
    expect(audios[1].url).toBe("/audio/exp1.mp3");
    fireEvent.click(screen.getByRole("button", { name: "單字挑戰" }));
    expect(audios[1].pause).toHaveBeenCalled();
    await screen.findByRole("heading", { name: "單字提示" });
    fireEvent.click(screen.getByRole("button", { name: "朗讀英文解釋 1" }));
    expect(audios[2].url).toBe("/audio/exp1.mp3");
    fireEvent.click(screen.getByRole("button", { name: "聽力練習" }));
    expect(audios[2].pause).toHaveBeenCalled();
    await screen.findByRole("heading", { name: "單字提示" });
    expect(screen.queryByRole("button", { name: /朗讀英文解釋/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "揭曉答案" }));
    fireEvent.click(screen.getByRole("button", { name: "朗讀英文解釋 1" }));
    expect(audios[3].url).toBe("/audio/exp1.mp3");
    fireEvent.click(screen.getByRole("button", { name: /下一個單字/ }));
    expect(audios[3].pause).toHaveBeenCalled();
  });

  it("挑戰顯示全部英文解釋，短字只露首字，切換模式重設揭曉", async () => {
    vi.mocked(api.getWordbankQuestion).mockResolvedValue({ poolSize: 1, entry: { ...entry, word: "cat", definition: "貓" } });
    render(<WordbankPractice />);
    await screen.findByRole("heading", { name: "cat" });
    fireEvent.click(screen.getByRole("button", { name: "單字挑戰" }));
    expect((await screen.findByRole("heading", { name: "單字提示" })).textContent).toBe("c••");
    expect(screen.getByText("A round fruit.")).toBeTruthy();
    expect(screen.getByText("A fruit growing on trees.")).toBeTruthy();
    expect(screen.queryByText("貓")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "揭曉答案" }));
    fireEvent.click(screen.getByRole("button", { name: "聽力練習" }));
    await screen.findByRole("heading", { name: "單字提示" });
    expect(screen.queryByText("貓")).toBeNull();
    expect(screen.queryByText("A round fruit.")).toBeNull();
  });

  it("CEFR精確級別，不累計其他程度，換制度不攜帶舊級別", async () => {
    render(<WordbankPractice />);
    await screen.findByLabelText(/^基礎 basic/);
    fireEvent.click(screen.getByLabelText(/^基礎 basic/));
    await waitFor(() => expect(api.getWordbankQuestion).toHaveBeenLastCalledWith("list", ["basic"], expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("分級制度"), { target: { value: "cefr" } });
    await waitFor(() => expect(api.getWordbankQuestion).toHaveBeenLastCalledWith("cefr", ["all"], expect.any(AbortSignal)));
    fireEvent.click(screen.getByLabelText(/^A2/));
    await waitFor(() => expect(api.getWordbankQuestion).toHaveBeenLastCalledWith("cefr", ["A2"], expect.any(AbortSignal)));
    expect((screen.getByLabelText(/^A1/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(/^A1/));
    await waitFor(() => expect(api.getWordbankQuestion).toHaveBeenLastCalledWith("cefr", ["A2", "A1"], expect.any(AbortSignal)));
  });

  it("較晚返回的舊抽題結果不覆蓋最新程度", async () => {
    let staleResolve!: (value: WordbankQuestion) => void;
    vi.mocked(api.getWordbankQuestion).mockImplementationOnce(() => new Promise((resolve) => { staleResolve = resolve; }));
    render(<WordbankPractice />);
    fireEvent.click(await screen.findByLabelText(/^基礎 basic/));
    await screen.findByRole("heading", { name: "apple" });
    await act(async () => staleResolve({ poolSize: 1, entry: { ...entry, word: "stale" } }));
    expect(screen.queryByRole("heading", { name: "stale" })).toBeNull();
    expect(screen.getByRole("heading", { name: "apple" })).toBeTruthy();
  });

  it("切模式、下一字與離頁都停止音訊，音源不重疊", async () => {
    const { unmount } = render(<WordbankPractice />);
    await screen.findByRole("heading", { name: "apple" });
    fireEvent.click(screen.getByRole("button", { name: "朗讀單字" }));
    await waitFor(() => expect(audios).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "朗讀例句 1" }));
    expect(audios[0].pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "聽力練習" }));
    expect(audios[1].pause).toHaveBeenCalled();
    await screen.findByRole("heading", { name: "單字提示" });
    fireEvent.click(screen.getByRole("button", { name: "朗讀單字" }));
    fireEvent.click(screen.getByRole("button", { name: /下一個單字/ }));
    expect(audios[2].pause).toHaveBeenCalled();
    await screen.findByRole("heading", { name: "單字提示" });
    fireEvent.click(screen.getByRole("button", { name: "朗讀單字" }));
    unmount();
    expect(audios[3].pause).toHaveBeenCalled();
  });

  it("抽題錯誤可重試，空池和缺文字明示狀態", async () => {
    vi.mocked(api.getWordbankQuestion).mockRejectedValueOnce(new Error("network"));
    render(<WordbankPractice />);
    fireEvent.click(await screen.findByRole("button", { name: "重新抽選" }));
    await screen.findByRole("heading", { name: "apple" });
    vi.mocked(api.getWordbankQuestion).mockResolvedValueOnce({ entry: null, poolSize: 0 });
    fireEvent.click(screen.getByRole("button", { name: /下一個單字/ }));
    await screen.findByRole("heading", { name: "沒有符合條件的單字" });
    vi.mocked(api.getWordbankQuestion).mockResolvedValue({ poolSize: 1, entry: { ...entry, definition: "", explains: [] } });
    fireEvent.click(screen.getByLabelText(/^未分類/));
    await screen.findByText("中文定義待補");
    fireEvent.click(screen.getByRole("button", { name: "單字挑戰" }));
    await screen.findByText("英文解釋待補，可先揭曉答案或換下一個單字。");
  });
});
