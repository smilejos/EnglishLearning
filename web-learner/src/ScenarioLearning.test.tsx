import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { ScenarioLearning, ScenarioList, scenarioKeyFromHash } from "./ScenarioLearning";
import * as api from "./api";
import type { ScenarioDetail } from "./scenarioTypes";
import type { WordbankEntry } from "./wordbankTypes";
import { _resetAudioBus, claimAudio } from "./lib/audioBus";

vi.mock("./api", () => ({
  listScenarios: vi.fn(), getScenario: vi.fn(), getWordbankEntry: vi.fn(), getMe: vi.fn(),
  scenarioMediaUrl: (path: string) => path,
}));
const words = ["sofa", "television", "lamp", "chair", "table", "read", "sleep", "comfortable", "window", "curtain", "shelf", "book", "pillow", "clock", "plant"];
const scenario: ScenarioDetail = {
  scenarioKey: "living-room", revision: 1, status: "published", titleZh: "午後客廳", targetCount: 15,
  vocabularyFilter: { system: "list", levels: ["basic", "advance"] },
  targets: words.map((word, index) => ({ word, entryGuid: `${word}-guid`, list: "basic", teachingPos: "n", senseZh: `情境釋義${index}`,
    interaction: { label: { x: .1 + index * .04, y: .15 }, object: { x: .1 + index * .04, y: .4 } } })),
  story: { textEn: "Books are comfortable.", textZh: "書本很舒服。", sentences: [{ id: "s1", en: "Books are comfortable.", zh: "書本很舒服。",
    wordLinks: [
      { surface: "Books", word: "book", entryGuid: "book-guid", isTarget: true, start: 0, end: 5 },
      { surface: "are", word: "be", entryGuid: "be-guid", isTarget: false, start: 6, end: 9 },
      { surface: "comfortable", word: "comfortable", entryGuid: "comfortable-guid", isTarget: true, start: 10, end: 21 },
    ] }] },
  image: { url: "/scenarios/living-room/revisions/1/media/image", width: 1672, height: 941 },
  storyAudio: { url: "/scenarios/living-room/revisions/1/media/audio" },
};
function entry(word: string): WordbankEntry {
  return { guid: `${word}-guid`, word, partsOfSpeech: ["n"], definition: `${word} 中文釋義`, level: { cefr: null, tw_7000: null, list: "basic" },
    wordAudioUrl: `/audio/${word}.mp3`,
    explains: [1, 2, 3].map(number => ({ guid: `${word}-explain-${number}`, en: `${word} definition ${number}`, audioUrl: `/audio/${word}-definition-${number}.mp3` })),
    examples: [1, 2, 3, 4].map(number => ({ guid: `${word}-example-${number}`, en: `${word} example ${number}`, zh: `${word} 例句翻譯 ${number}`, audioUrl: `/audio/${word}-example-${number}.mp3` })),
  };
}
type FakeAudio = {
  url: string; currentTime: number; playbackRate: number;
  play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>;
  onended: (() => void) | null; onerror: (() => void) | null; ontimeupdate: (() => void) | null;
};
let audios: FakeAudio[];
let nextPlay: () => Promise<void>;
beforeEach(() => {
  vi.resetAllMocks(); _resetAudioBus(); audios = []; nextPlay = () => Promise.resolve();
  window.history.replaceState(null, "", "#");
  vi.mocked(api.getMe).mockResolvedValue({ user: { id: 1, email: "reader@example.com", role: "reader" } });
  vi.mocked(api.listScenarios).mockResolvedValue({ scenarios: [scenario] });
  vi.mocked(api.getScenario).mockResolvedValue(scenario);
  vi.mocked(api.getWordbankEntry).mockImplementation(async guid => entry(guid.replace("-guid", "")));
  vi.stubGlobal("Audio", vi.fn((url: string) => {
    const audio: FakeAudio = { url, currentTime: 0, playbackRate: 1, play: vi.fn(() => nextPlay()), pause: vi.fn(), onended: null, onerror: null, ontimeupdate: null };
    audios.push(audio); return audio;
  }));
});
afterEach(() => { cleanup(); _resetAudioBus(); vi.unstubAllGlobals(); });
const card = () => screen.getByRole("dialog", { name: "單字卡" });
const story = () => screen.getByRole("dialog", { name: "情境小故事" });
async function load() {
  const result = render(<ScenarioLearning scenarioKey="living-room" />);
  await screen.findByRole("heading", { name: "午後客廳" });
  return result;
}
async function selectWord(word: string) {
  fireEvent.click(screen.getByRole("button", { name: `查看 ${word} 單字卡` }));
  await within(card()).findByRole("heading", { name: word });
}
function openStory() { fireEvent.click(screen.getByRole("button", { name: "故事與旁白" })); }
async function click(name: string, scope = document.body) {
  await act(async () => { fireEvent.click(within(scope).getAllByRole("button", { name })[0]); });
}

describe("正式情境學習", () => {
  it("首頁、清單與detail路由接續，瀏覽器返回清單重新載入；不產生資料或收藏", async () => {
    render(<App />);
    expect(screen.getByRole("link", { name: /情境模擬/ }).getAttribute("href")).toBe("#/scenarios");
    await act(async () => { window.location.hash = "#/scenarios"; window.dispatchEvent(new Event("hashchange")); });
    const sceneLink = await screen.findByRole("link", { name: /午後客廳/ });
    expect(sceneLink.getAttribute("href")).toBe("#/scenarios/living-room");
    await act(async () => { window.location.hash = sceneLink.getAttribute("href")!; window.dispatchEvent(new Event("hashchange")); });
    await screen.findByRole("button", { name: "查看 sofa 單字卡" });
    expect(api.getScenario).toHaveBeenCalledWith("living-room", expect.any(AbortSignal));
    await act(async () => { window.location.hash = "#/scenarios"; window.dispatchEvent(new Event("hashchange")); });
    await screen.findByRole("link", { name: /午後客廳/ });
    expect(api.listScenarios).toHaveBeenCalledTimes(2);
    expect(audios).toHaveLength(0);
    expect(screen.queryByText("收藏單字")).toBeNull();
    expect(scenarioKeyFromHash("#/scenarios/a%20b")).toBe("a b");
    expect(scenarioKeyFromHash("#/scenarios/%xy")).toBeNull();
  });

  it("清單只呈現published並能篩選程度，提供空清單與載入失敗重試", async () => {
    vi.mocked(api.listScenarios).mockRejectedValueOnce(new Error("offline"));
    render(<ScenarioList />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    await screen.findByRole("link", { name: /午後客廳/ });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "expert" } });
    expect(screen.queryByRole("link", { name: /午後客廳/ })).toBeNull();
    expect(screen.getByText(/目前沒有符合程度/)).toBeTruthy();
    cleanup();
    vi.mocked(api.listScenarios).mockResolvedValue({ scenarios: [{ ...scenario, status: "draft" }] });
    render(<ScenarioList />);
    await screen.findByText("目前還沒有已發布的情境。");
  });

  it("detail失敗可重試，不顯示draft；只點標籤才依GUID載入完整卡與全部例句", async () => {
    vi.mocked(api.getScenario).mockResolvedValueOnce({ ...scenario, status: "draft" });
    render(<ScenarioLearning scenarioKey="living-room" />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "故事與旁白" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    await screen.findByRole("heading", { name: "午後客廳" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.getWordbankEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: /單字/ })).toBeNull();
    await selectWord("sofa");
    expect(api.getWordbankEntry).toHaveBeenCalledWith("sofa-guid", expect.any(AbortSignal));
    expect(within(card()).getByText("sofa 中文釋義")).toBeTruthy();
    expect(within(card()).getByText("sofa definition 3")).toBeTruthy();
    expect(within(card()).getByText("sofa example 4")).toBeTruthy();
    expect(within(card()).getByText("sofa 例句翻譯 4")).toBeTruthy();
    expect(audios).toHaveLength(0);
  });

  it("回想不把標籤、故事、翻譯或查字答案放入DOM及aria，揭曉後恢復互動", async () => {
    await load(); openStory();
    fireEvent.click(within(story()).getByRole("button", { name: "展開繁中翻譯" }));
    fireEvent.click(within(story()).getByRole("button", { name: "關閉情境小故事" }));
    fireEvent.click(screen.getByRole("button", { name: "看圖回想" }));
    expect(screen.queryByRole("button", { name: /^查看/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "故事與旁白" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.textContent).not.toContain("Books");
    expect(document.body.textContent).not.toContain("書本很舒服");
    expect(document.body.innerHTML).not.toContain("sofa");
    expect(screen.getByRole("img").getAttribute("alt")).toBe("情境插圖");
    fireEvent.click(screen.getByRole("button", { name: "揭曉答案" }));
    expect(screen.getAllByRole("button", { name: /^查看/ })).toHaveLength(15);
    await selectWord("book");
    expect(within(card()).getByText("book 中文釋義")).toBeTruthy();
  });

  it("故事屈折字與非目標字皆載入原形；單一Modal查詞返回保持翻譯", async () => {
    await load(); openStory();
    expect(within(story()).queryByText(scenario.story.textZh)).toBeNull();
    fireEvent.click(within(story()).getByRole("button", { name: "展開繁中翻譯" }));
    fireEvent.click(within(story()).getByRole("button", { name: "查看 Books（book）單字卡" }));
    await within(card()).findByRole("heading", { name: "book" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const content = card().querySelector<HTMLDivElement>(".scenario-dialog-content")!;
    content.scrollTop = 300;
    fireEvent.click(within(card()).getByRole("button", { name: "回到故事" }));
    expect(content.scrollTop).toBe(0);
    expect(within(story()).getByText(scenario.story.textZh)).toBeTruthy();
    fireEvent.click(within(story()).getByRole("button", { name: "查看 are（be）單字卡" }));
    await within(card()).findByRole("heading", { name: "be" });
    expect(within(card()).queryByText(/^本情境/)).toBeNull();
  });

  it("旁白切卡暫停保留位置，單字與解釋例句仲裁；返回故事手動續播、改速、重播", async () => {
    const { unmount } = await load(); openStory();
    await click("播放英文旁白", story());
    const narration = audios[0];
    expect(narration.url).toBe(scenario.storyAudio!.url);
    act(() => { narration.currentTime = 12; narration.ontimeupdate?.(); });
    fireEvent.click(within(story()).getByRole("button", { name: "查看 Books（book）單字卡" }));
    await within(card()).findByRole("heading", { name: "book" });
    expect(narration.pause).toHaveBeenCalled();
    expect(narration.currentTime).toBe(12);
    await click("播放book 單字", card());
    await click("播放book 英文解釋", card());
    expect(audios[1].pause).toHaveBeenCalled();
    await click("播放book 英文例句", card());
    expect(audios[2].pause).toHaveBeenCalled();
    fireEvent.click(within(card()).getByRole("button", { name: "回到故事" }));
    expect(audios[3].pause).toHaveBeenCalled();
    expect(narration.play).toHaveBeenCalledTimes(1);
    fireEvent.change(within(story()).getByRole("combobox", { name: "旁白語速" }), { target: { value: "0.75" } });
    await click("繼續旁白", story());
    expect(narration.play).toHaveBeenCalledTimes(2);
    expect(narration.currentTime).toBe(12);
    expect(narration.playbackRate).toBe(.75);
    const externalStop = vi.fn(); act(() => claimAudio(externalStop));
    expect(within(story()).getByRole("button", { name: "繼續旁白" })).toBeTruthy();
    await click("重新播放", story());
    expect(narration.currentTime).toBe(0);
    expect(externalStop).toHaveBeenCalled();
    unmount(); expect(narration.pause).toHaveBeenCalled();
  });

  it("缺音停用且播放失敗能重試，回想及關閉故事停止旁白", async () => {
    vi.mocked(api.getWordbankEntry).mockResolvedValue({ ...entry("sofa"), wordAudioUrl: null });
    await load(); await selectWord("sofa");
    expect((within(card()).getByRole("button", { name: "播放sofa 單字" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(card()).getByRole("button", { name: "關閉單字卡" })); openStory();
    nextPlay = () => Promise.reject(new Error("offline"));
    await click("播放英文旁白", story());
    expect(within(story()).getByText("旁白播放失敗，請重試。")).toBeTruthy();
    nextPlay = () => Promise.resolve(); await click("重試旁白", story());
    expect(within(story()).queryByText("旁白播放失敗，請重試。")).toBeNull();
    fireEvent.click(within(story()).getByRole("button", { name: "關閉情境小故事" }));
    expect(audios[0].pause).toHaveBeenCalled();
    openStory(); await click("播放英文旁白", story());
    fireEvent.click(within(story()).getByRole("button", { name: "關閉情境小故事" }));
    fireEvent.click(screen.getByRole("button", { name: "看圖回想" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("單字失敗可重試，取消舊GUID請求不會覆蓋新卡", async () => {
    let resolveOld!: (value: WordbankEntry) => void;
    vi.mocked(api.getWordbankEntry).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await load(); fireEvent.click(screen.getByRole("button", { name: "查看 sofa 單字卡" }));
    await within(card()).findByText("正在載入單字…");
    const oldSignal = vi.mocked(api.getWordbankEntry).mock.calls[0][1]!;
    fireEvent.click(within(card()).getByRole("button", { name: "關閉單字卡" }));
    vi.mocked(api.getWordbankEntry).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "查看 book 單字卡" }));
    await within(card()).findByRole("alert");
    fireEvent.click(within(card()).getByRole("button", { name: "重新載入單字" }));
    await within(card()).findByRole("heading", { name: "book" });
    await act(async () => resolveOld(entry("sofa")));
    expect(oldSignal.aborted).toBe(true);
    expect(within(card()).getByRole("heading", { name: "book" })).toBeTruthy();
    expect(within(card()).queryByRole("heading", { name: "sofa" })).toBeNull();
  });

  it("缺旁白時可讀故事；取消延遲play後的舊Promise與媒體事件不干擾新單字音源", async () => {
    vi.mocked(api.getScenario).mockResolvedValueOnce({ ...scenario, storyAudio: null });
    await load(); openStory();
    expect((within(story()).getByRole("button", { name: "英文旁白待準備" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(story()).getByRole("button", { name: "重新播放" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    await load(); openStory();
    let resolvePlay!: () => void;
    nextPlay = () => new Promise(resolve => { resolvePlay = resolve; });
    fireEvent.click(within(story()).getByRole("button", { name: "播放英文旁白" }));
    const stale = audios[0]; const staleError = stale.onerror; const staleEnd = stale.onended;
    fireEvent.click(within(story()).getByRole("button", { name: "查看 Books（book）單字卡" }));
    await within(card()).findByRole("heading", { name: "book" });
    nextPlay = () => Promise.resolve(); await click("播放book 單字", card());
    await act(async () => resolvePlay());
    act(() => { staleError?.(); staleEnd?.(); });
    expect(within(card()).getByRole("button", { name: "暫停book 單字" })).toBeTruthy();
    expect(audios[1].pause).not.toHaveBeenCalled();
    fireEvent.click(within(card()).getByRole("button", { name: "回到故事" }));
    expect(within(story()).getByRole("button", { name: "播放英文旁白" })).toBeTruthy();
    expect(within(story()).queryByText("旁白播放失敗，請重試。")).toBeNull();
  });

  it("Modal鎖捲動、Tab含語速select循環、Escape恢復焦點，StrictMode不誤關閉", async () => {
    render(<StrictMode><ScenarioLearning scenarioKey="living-room" /></StrictMode>);
    await screen.findByRole("heading", { name: "午後客廳" });
    const trigger = screen.getByRole("button", { name: "故事與旁白" }); trigger.focus(); openStory();
    expect((story() as HTMLDialogElement).open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const first = within(story()).getByRole("button", { name: "關閉情境小故事" });
    const last = within(story()).getByRole("button", { name: "展開繁中翻譯" });
    first.focus(); fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" }); expect(document.activeElement).toBe(first);
    fireEvent(story(), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe(""); expect(document.activeElement).toBe(trigger);
  });

  it("背景點擊才關閉，拖選至背景不關閉；圖片失敗可故事查字與重試", async () => {
    await load(); await selectWord("book");
    fireEvent.pointerDown(within(card()).getByRole("heading", { name: "book" }));
    fireEvent.click(card(), { clientX: -1, clientY: -1 }); expect(card()).toBeTruthy();
    fireEvent.pointerDown(card(), { clientX: -1, clientY: -1 }); fireEvent.click(card(), { clientX: -1, clientY: -1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.error(screen.getByRole("img")); expect(screen.queryByRole("button", { name: /^查看/ })).toBeNull();
    openStory(); fireEvent.click(within(story()).getByRole("button", { name: "查看 Books（book）單字卡" }));
    await within(card()).findByRole("heading", { name: "book" });
    fireEvent.click(within(card()).getByRole("button", { name: "關閉單字卡" }));
    fireEvent.click(screen.getByRole("button", { name: "重試載入圖片" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe(scenario.image.url));
  });
});
