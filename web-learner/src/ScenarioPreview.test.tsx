import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ScenarioPreview, type ScenarioPreviewData } from "./ScenarioPreview";
import fixture from "./scenarioPreviewData.json";
import { _resetAudioBus, claimAudio, stopAudio } from "./lib/audioBus";

const data: ScenarioPreviewData = fixture;
const imageUrl = "/preview/living-room.png";
// 提供假網址，測試不讀實際音檔、不連資料庫或生成 API。
const audioUrls = Object.fromEntries(data.entries.flatMap(entry => [
  entry.wordAudioKey, ...entry.explains.map(item => item.audioKey), ...entry.examples.map(item => item.audioKey),
]).filter((key): key is string => !!key).map(key => [key, `/preview/audio/${key}`]));

type FakeAudio = {
  url: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  onended: null | (() => void);
  onerror: null | (() => void);
};
let audios: FakeAudio[];
let nextPlay: () => Promise<void>;
let fetchMock: ReturnType<typeof vi.fn>;
let originalBodyOverflow: string;

beforeEach(() => {
  _resetAudioBus();
  originalBodyOverflow = document.body.style.overflow;
  audios = [];
  nextPlay = () => Promise.resolve();
  fetchMock = vi.fn(() => { throw new Error("預覽行為測試不可連線"); });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { callback(0); return 1; }));
  vi.stubGlobal("Audio", vi.fn((url: string) => {
    const audio: FakeAudio = { url, play: vi.fn(() => nextPlay()), pause: vi.fn(), onended: null, onerror: null };
    audios.push(audio);
    return audio;
  }));
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = originalBodyOverflow;
  _resetAudioBus();
  vi.unstubAllGlobals();
});

function openPreview(urls = audioUrls) {
  return render(<ScenarioPreview data={data} imageUrl={imageUrl} audioUrls={urls} />);
}
function card() { return screen.getByRole("dialog", { name: "單字卡" }); }
function story() { return screen.getByRole("dialog", { name: "客廳裡的小故事" }); }
function imageLabel(word: string) { return screen.getByRole("button", { name: `查看 ${word} 單字卡` }); }
function closeCard() { fireEvent.click(within(card()).getByRole("button", { name: "關閉單字卡" })); }
function chooseImage(word: string) {
  if (screen.queryByRole("dialog", { name: "單字卡" })) closeCard();
  fireEvent.click(imageLabel(word));
}
function openStory() { fireEvent.click(screen.getByRole("button", { name: "故事與旁白" })); }
function closeStory() { fireEvent.click(within(story()).getByRole("button", { name: "關閉客廳裡的小故事" })); }
async function clickAudio(name: string) {
  // 主內容的第一段；happy-dom 也會將收合 details 內的同名按鈕列入查詢。
  await act(async () => { fireEvent.click(within(card()).getAllByRole("button", { name })[0]); });
}

describe("獨立客廳情境預覽", () => {
  it("初始只顯示圖片與工具；十五詞列、單字卡和故事均不佔頁面", () => {
    openPreview();
    expect(data.targets).toHaveLength(15);
    expect(screen.getAllByRole("button", { name: /^查看 .+ 單字卡$/ })).toHaveLength(15);
    expect(screen.queryByRole("navigation", { name: "十五個目標單字" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByText("客廳裡的小故事")).toBeNull();
    expect(screen.queryByText(data.story.textZh)).toBeNull();
    expect(screen.getByRole("button", { name: "故事與旁白" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "放大圖片" })).toBeTruthy();
    expect(audios).toHaveLength(0);
  });

  it("十五個圖標籤皆開啟正確原形卡，故事屈折字和非目標字也可查閱", () => {
    openPreview();
    for (const target of data.targets) {
      chooseImage(target.word);
      expect(within(card()).getByRole("heading", { name: target.word })).toBeTruthy();
      expect((card() as HTMLDialogElement).open).toBe(true);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    }
    closeCard();
    openStory();
    expect(within(story()).getAllByRole("button", { name: /^查看/ })).toHaveLength(data.story.sentences.flatMap(sentence => sentence.wordLinks).length);
    expect(story().querySelector(".scenario-story-text")?.textContent?.trim()).toBe(fixture.story.textEn);
    fireEvent.click(within(story()).getByRole("button", { name: "查看 reads（read）單字卡" }));
    const read = data.entries.find(entry => entry.word === "read")!;
    expect(within(card()).getByRole("heading", { name: "read" })).toBeTruthy();
    expect(within(card()).getByText(read.definition)).toBeTruthy();
    expect(within(card()).getByText(read.explains[0].en)).toBeTruthy();
    expect(within(card()).getByText(read.examples[0].en)).toBeTruthy();
    expect(within(card()).getByText(read.examples[0].zh)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "客廳裡的小故事" })).toBeNull();
    fireEvent.click(within(card()).getByRole("button", { name: "回到故事" }));
    fireEvent.click(within(story()).getByRole("button", { name: "查看 quiet（quiet）單字卡" }));
    expect(within(card()).getByRole("heading", { name: "quiet" })).toBeTruthy();
    expect(within(card()).queryByText(/^本情境：/)).toBeNull();
    expect(audios).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("翻譯與更多解釋例句可收合；查詞後回到故事保留翻譯狀態且只開一個 Modal", () => {
    openPreview();
    openStory();
    const translationToggle = within(story()).getByRole("button", { name: "展開繁中翻譯" });
    expect(translationToggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(story()).queryByText(data.story.textZh)).toBeNull();
    fireEvent.click(translationToggle);
    expect(within(story()).getByRole("button", { name: "收起繁中翻譯" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(story()).getByText(data.story.textZh)).toBeTruthy();
    fireEvent.click(within(story()).getByRole("button", { name: "查看 reads（read）單字卡" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const read = data.entries.find(entry => entry.word === "read")!;
    for (const [name, content] of [
      ["更多英文解釋", read.explains[1].en],
      [`更多例句（${read.examples.length - 1}）`, read.examples[1].zh],
    ]) {
      const toggle = within(card()).getByText(name);
      const details = toggle.closest("details")!;
      expect(details.open).toBe(false);
      fireEvent.click(toggle);
      expect(details.open).toBe(true);
      expect(within(details).getByText(content)).toBeTruthy();
      fireEvent.click(toggle);
      expect(details.open).toBe(false);
    }
    fireEvent.click(within(card()).getByRole("button", { name: "回到故事" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const returnedToggle = within(story()).getByRole("button", { name: "收起繁中翻譯" });
    expect(returnedToggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(story()).getByText(data.story.textZh)).toBeTruthy();
    fireEvent.click(returnedToggle);
    expect(within(story()).queryByText(data.story.textZh)).toBeNull();
    closeStory();
    expect(screen.getByText("這張參考圖的英文已畫在圖片內，暫不提供隱藏答案練習。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /隱藏答案|揭曉答案|快速挑戰/ })).toBeNull();
  });

  it("圖片失敗可從故事查詞、重試原圖；放大與點選位置控制保留狀態", () => {
    openPreview();
    fireEvent.click(screen.getByRole("button", { name: "顯示點選位置" }));
    expect(screen.getByRole("button", { name: "收起點選位置" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "放大圖片" }));
    expect(screen.getByRole("button", { name: "還原圖片" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("alert").textContent).toContain("故事");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "查看 read 單字卡" })).toBeNull();
    openStory();
    fireEvent.click(within(story()).getByRole("button", { name: "查看 sleeps（sleep）單字卡" }));
    expect(within(card()).getByRole("heading", { name: "sleep" })).toBeTruthy();
    closeCard();
    fireEvent.click(screen.getByRole("button", { name: "重試載入圖片" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe(imageUrl);
    expect(imageLabel("read")).toBeTruthy();
  });

  it("advance 缺音與未提供網址的 basic 音檔均停用，旁白待準備且不觸發 API", () => {
    const { rerender } = openPreview();
    openStory();
    expect(within(story()).getByText("英文旁白待準備")).toBeTruthy();
    closeStory();
    for (const word of ["curtain", "shelf", "pillow", "read"]) {
      if (word === "read") rerender(<ScenarioPreview data={data} imageUrl={imageUrl} audioUrls={{}} />);
      chooseImage(word);
      const buttons = within(card()).getAllByRole("button", { name: /^播放/ });
      expect(buttons.length).toBeGreaterThanOrEqual(3);
      for (const button of buttons) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(button.textContent).toBe("音檔待準備");
        fireEvent.click(button);
      }
    }
    expect(audios).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("已有音檔可播放暫停、結束後再播，關卡、改查單字及離頁停止播放", async () => {
    const { unmount } = openPreview();
    chooseImage("read");
    const read = data.entries.find(entry => entry.word === "read")!;
    await clickAudio("播放read 單字");
    expect(audios[0].url).toBe(audioUrls[read.wordAudioKey!]);
    await clickAudio("暫停read 單字");
    expect(audios[0].pause).toHaveBeenCalledOnce();
    await clickAudio("播放read 單字");
    act(() => audios[1].onended?.());
    expect(within(card()).getByRole("button", { name: "播放read 單字" })).toBeTruthy();
    await clickAudio("播放read 單字");
    closeCard();
    expect(audios[2].pause).toHaveBeenCalledOnce();
    chooseImage("sleep");
    await clickAudio("播放sleep 單字");
    unmount();
    expect(audios[3].pause).toHaveBeenCalledOnce();
  });

  it("Modal 開啟鎖住頁面捲動；按鈕與原生 cancel 關閉均還原焦點及原捲動設定", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = openPreview();
    const trigger = imageLabel("read");
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    expect(card().contains(document.activeElement) || document.activeElement === card()).toBe(true);
    closeCard();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(trigger);
    const storyTrigger = screen.getByRole("button", { name: "故事與旁白" });
    storyTrigger.focus();
    openStory();
    expect(document.body.style.overflow).toBe("hidden");
    // 瀏覽器按 Escape 發出 cancel；happy-dom 不模擬瀏覽器鍵盤預設行為。
    fireEvent(story(), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(storyTrigger);
    openStory();
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("Modal 的 Tab 邊界循環留在卡片，略過停用音檔與收合內容", () => {
    openPreview();
    for (const word of ["read", "shelf"]) {
      chooseImage(word);
      const first = within(card()).getByRole("button", { name: "關閉單字卡" });
      const entry = data.entries.find(item => item.word === word)!;
      const last = within(card()).getByText(`更多例句（${entry.examples.length - 1}）`);
      expect(last.tagName).toBe("SUMMARY");
      expect(last.closest("details")!.open).toBe(false);
      if (word === "shelf") {
        expect(within(card()).getAllByRole("button", { name: /^播放/ }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
      }
      first.focus();
      expect(fireEvent.keyDown(first, { key: "Tab", shiftKey: true })).toBe(false);
      expect(document.activeElement).toBe(last);
      expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(false);
      expect(document.activeElement).toBe(first);
      const heading = within(card()).getByRole("heading", { name: "單字卡" });
      heading.focus();
      fireEvent.keyDown(heading, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    }
    expect(audios).toHaveLength(0);
  });

  it("點對話框內文不關閉；點背景關閉並停止卡片音檔", async () => {
    openPreview();
    chooseImage("read");
    fireEvent.click(within(card()).getByRole("heading", { name: "read" }));
    expect(card()).toBeTruthy();
    expect(within(card()).queryByRole("button", { name: "回到故事" })).toBeNull();
    // 從對話框內拖選文字至背景，不應誤判成背景點擊。
    fireEvent.pointerDown(within(card()).getByRole("heading", { name: "read" }));
    fireEvent.click(card(), { clientX: -1, clientY: -1 });
    expect(card()).toBeTruthy();
    // 對話框本身的留白也不是背景。
    fireEvent.pointerDown(card(), { clientX: 0, clientY: 0 });
    fireEvent.click(card(), { clientX: 0, clientY: 0 });
    expect(card()).toBeTruthy();
    await clickAudio("播放read 單字");
    fireEvent.pointerDown(card(), { clientX: -1, clientY: -1 });
    fireEvent.click(card(), { clientX: -1, clientY: -1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(audios[0].pause).toHaveBeenCalledOnce();
    openStory();
    fireEvent.click(within(story()).getByRole("heading", { name: "客廳裡的小故事" }));
    expect(story()).toBeTruthy();
    fireEvent.pointerDown(story(), { clientX: -1, clientY: -1 });
    fireEvent.click(story(), { clientX: -1, clientY: -1 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("StrictMode 重掛載效果不會誤關 Modal，收起後仍還原捲動與焦點", () => {
    render(<StrictMode><ScenarioPreview data={data} imageUrl={imageUrl} audioUrls={audioUrls} /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "故事與旁白" });
    trigger.focus();
    openStory();
    expect((story() as HTMLDialogElement).open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    closeStory();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe(originalBodyOverflow);
    expect(document.activeElement).toBe(trigger);
  });

  it("由故事查詞後返回故事會停止音檔且沒有重新自動播放", async () => {
    openPreview();
    openStory();
    fireEvent.click(within(story()).getByRole("button", { name: "查看 reads（read）單字卡" }));
    await clickAudio("播放read 單字");
    fireEvent.click(within(card()).getByRole("button", { name: "回到故事" }));
    expect(story()).toBeTruthy();
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios).toHaveLength(1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("單字、英文解釋、例句與外部音源共用 audioBus 仲裁，僅有當前音源播放", async () => {
    openPreview();
    chooseImage("read");
    const read = data.entries.find(entry => entry.word === "read")!;
    await clickAudio("播放read 單字");
    await clickAudio("播放read 英文解釋");
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios[1].url).toBe(audioUrls[read.explains[0].audioKey!]);
    await clickAudio("播放read 英文例句");
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(audios[2].url).toBe(audioUrls[read.examples[0].audioKey!]);
    const externalStop = vi.fn();
    act(() => claimAudio(externalStop));
    expect(audios[2].pause).toHaveBeenCalledOnce();
    expect(within(card()).queryByRole("button", { name: /^暫停/ })).toBeNull();
    await clickAudio("播放read 單字");
    expect(externalStop).toHaveBeenCalledOnce();
    act(() => stopAudio());
    expect(audios[3].pause).toHaveBeenCalledOnce();
    expect(within(card()).queryByRole("button", { name: /^暫停/ })).toBeNull();
  });

  it("play 拒絕或音檔 error 顯示失敗，重試可正常播放並清除錯誤", async () => {
    openPreview();
    chooseImage("read");
    nextPlay = () => Promise.reject(new Error("無法播放"));
    await clickAudio("播放read 單字");
    expect(within(card()).getByRole("status").textContent).toBe("播放失敗，請重試。");
    expect(audios[0].pause).toHaveBeenCalledOnce();
    nextPlay = () => Promise.resolve();
    await clickAudio("重試read 單字");
    expect(within(card()).queryByRole("status")).toBeNull();
    expect(within(card()).getByRole("button", { name: "暫停read 單字" })).toBeTruthy();
    act(() => audios[1].onerror?.());
    expect(within(card()).getByRole("status")).toBeTruthy();
    await clickAudio("重試read 單字");
    expect(audios[2].play).toHaveBeenCalledOnce();
    expect(within(card()).queryByRole("status")).toBeNull();
  });

  it("切詞後舊 play promise 成功或失敗及延遲媒體事件皆不改寫新卡或停止新音源", async () => {
    openPreview();
    for (const outcome of ["resolve", "reject"] as const) {
      let resolve!: () => void;
      let reject!: (reason: Error) => void;
      nextPlay = () => new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      chooseImage("read");
      fireEvent.click(within(card()).getByRole("button", { name: "播放read 單字" }));
      const stale = audios.at(-1)!;
      chooseImage("sleep");
      expect(stale.pause).toHaveBeenCalledOnce();
      nextPlay = () => Promise.resolve();
      await clickAudio("播放sleep 單字");
      const current = audios.at(-1)!;
      await act(async () => { if (outcome === "resolve") resolve(); else reject(new Error("舊音源失敗")); });
      act(() => { stale.onerror?.(); stale.onended?.(); });
      expect(within(card()).getByRole("heading", { name: "sleep" })).toBeTruthy();
      expect(within(card()).getByRole("button", { name: "暫停sleep 單字" })).toBeTruthy();
      expect(within(card()).queryByRole("status")).toBeNull();
      expect(current.pause).not.toHaveBeenCalled();
    }
  });
});
