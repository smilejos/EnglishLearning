import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScenarioStudio } from "./ScenarioStudio";
import * as api from "./scenarioStudioApi";
import { STUDIO_BLOCKS, type StudioDetail, type StudioDraft, type StudioJob, type StudioOptions, type StudioWord } from "./scenarioStudioTypes";

vi.mock("./scenarioStudioApi", () => ({ listDrafts: vi.fn(), listRevisions: vi.fn(), getOptions: vi.fn(), createDraft: vi.fn(), getDraft: vi.fn(), saveDraft: vi.fn(), resolveWords: vi.fn(), searchWords: vi.fn(), quoteJob: vi.fn(), startJob: vi.fn(), retryJob: vi.fn(), cancelJob: vi.fn(), uploadAsset: vi.fn(), forkDraft: vi.fn(), publishRevision: vi.fn() }));
const mocked = vi.mocked(api);
const words: StudioWord[] = Array.from({ length: 15 }, (_, i) => ({ guid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, word: i === 0 ? "sofa" : i === 1 ? "read" : i === 2 ? "comfortable" : `word${i}`, partsOfSpeech: [i === 1 ? "v" : i === 2 ? "adj" : "n"], definition: `詞義${i}`, level: { list: i === 14 ? "advance" : "basic" } }));
function draft(): StudioDraft {
  return { id: "00000000-0000-4000-8000-000000000999", version: 1, scenarioKey: "living-room", titleZh: "午後客廳", vocabularyFilter: { system: "list", levels: ["basic", "advance"] }, targets: words.map((word, i) => ({ word: word.word, entryGuid: word.guid, list: word.level.list as "basic" | "advance", teachingPos: i === 1 ? "v" : i === 2 ? "adj" : "n", senseZh: word.definition, interaction: { label: null, object: null } })), sceneDescription: "一個午後客廳", promptSettings: { stylePreset: "cute-3d", imageModelKey: "image-model", blocks: Object.fromEntries(STUDIO_BLOCKS.map(block => [block, ""])) as StudioDraft["promptSettings"]["blocks"] }, story: { language: "en", translationLanguage: "zh-Hant", textEn: "A child reads.", textZh: "一個孩子在讀書。", sentences: [{ id: "s1", en: "A child reads.", zh: "一個孩子在讀書。", wordLinks: [] }] }, selectedImageId: null, selectedAudioId: null, review: { story: false, image: false, coordinates: false, audio: false }, createdAt: "2026-10-10", updatedAt: "2026-10-10", materializedRevision: null };
}
function detail(overrides: Partial<StudioDetail> = {}): StudioDetail { return { draft: draft(), assets: [], jobs: [], checks: [{ code: "missing-image", message: "請選用底圖", blocking: true }], compiledPrompt: "No words. Wide 16:9 composition.", missingAudioPlan: [], publishedRevision: null, ...overrides }; }
const options: StudioOptions = { presets: [{ id: "cute-3d", label: "溫暖 3D 卡通", style: "3D" }], blocks: [...STUDIO_BLOCKS], imageModels: [{ id: "image-model", label: "測試圖片模型", provider: "openai", available: true }], text: { provider: "openai", model: "text-model", available: true }, speech: { provider: "local-qwen", model: "Qwen3", voice: "Serena", available: true }, workers: [], workerOnline: true, defaultImageModelKey: "image-model" };
let current: StudioDetail;
beforeEach(() => {
  vi.resetAllMocks(); current = detail();
  mocked.listDrafts.mockResolvedValue({ drafts: [current.draft] }); mocked.listRevisions.mockResolvedValue({ scenarios: [] }); mocked.getOptions.mockResolvedValue(options); mocked.getDraft.mockImplementation(async () => current);
  mocked.saveDraft.mockImplementation(async input => { current = { ...current, draft: { ...input, version: input.version + 1 } }; return current; });
  mocked.quoteJob.mockImplementation(async (_id, version, kind) => ({ kind, version, inputHash: "hash", estimatedCostUsdMicros: 10000, localCompute: kind.includes("audio"), expiresAt: "2099-01-01T00:00:00.000Z", modelLabel: kind.includes("audio") ? "Qwen／Serena" : "測試模型", quoteHash: `quote-${kind}` }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function open() { render(<ScenarioStudio />); fireEvent.click(await screen.findByRole("button", { name: "開啟情境" })); await screen.findByRole("button", { name: "儲存草稿" }); }
function stage(name: string) { fireEvent.click(screen.getByRole("button", { name: new RegExp(`\\d\\. ${name}$`) })); }

describe("情境工作室的人工作業邊界", () => {
  it("舊十五詞可繼續編輯，顯示分類數量與非強制備料目標", async () => {
    await open();
    expect(screen.getByRole("heading", { name: "目前目標詞（15/25）" })).toBeTruthy();
    expect(screen.getByLabelText("目標詞分類數量").textContent).toBe("名詞 13 · 形容詞 1 · 動詞 1");
    expect(screen.getByText(/15個名詞、5個形容詞、5個動詞/)).toBeTruthy();
    mocked.resolveWords.mockResolvedValue({ results: [{ input: "extra", status: "matched", entries: [{ ...words[0], guid: "00000000-0000-4000-8000-000000000026", word: "extra" }] }] });
    fireEvent.change(screen.getByLabelText("貼上目標單字"), { target: { value: "extra" } }); fireEvent.click(screen.getByRole("button", { name: "比對字庫" })); fireEvent.click(await screen.findByRole("button", { name: "加入 extra" }));
    expect(screen.getByRole("heading", { name: "目前目標詞（16/25）" })).toBeTruthy();
    expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it("25詞和空動詞組可顯示與估價，拒絕加入第26詞且不自動生成", async () => {
    const targets = Array.from({ length: 25 }, (_, i) => ({ ...draft().targets[0], word: `target${i}`, entryGuid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, teachingPos: "n" as const }));
    current = detail({ draft: { ...draft(), targets } }); await open();
    expect(screen.getByRole("heading", { name: "目前目標詞（25/25）" })).toBeTruthy();
    expect(screen.getByLabelText("目標詞分類數量").textContent).toBe("名詞 25 · 形容詞 0 · 動詞 0");
    mocked.resolveWords.mockResolvedValue({ results: [{ input: "extra", status: "matched", entries: [{ ...words[0], guid: "00000000-0000-4000-8000-000000000026", word: "extra" }] }] });
    fireEvent.change(screen.getByLabelText("貼上目標單字"), { target: { value: "extra" } }); fireEvent.click(screen.getByRole("button", { name: "比對字庫" })); fireEvent.click(await screen.findByRole("button", { name: "加入 extra" }));
    expect(await screen.findByText(/每張情境最多25詞/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "目前目標詞（25/25）" })).toBeTruthy();
    stage("故事");
    expect((screen.getByRole("button", { name: "取得英文故事與翻譯估價" }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocked.startJob).not.toHaveBeenCalled(); expect(mocked.saveDraft).not.toHaveBeenCalled();
  });
  it("載入與切換七階段不會呼叫生成、儲存或發布", async () => {
    await open(); for (const name of ["場景與風格", "故事", "底圖", "標籤定位", "錄音", "預覽與發布"]) stage(name);
    expect(mocked.startJob).not.toHaveBeenCalled(); expect(mocked.quoteJob).not.toHaveBeenCalled(); expect(mocked.saveDraft).not.toHaveBeenCalled(); expect(mocked.publishRevision).not.toHaveBeenCalled();
    expect(screen.getByText("請選用底圖")).toBeTruthy(); expect((screen.getByRole("button", { name: "固定為新版本" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("Textarea 比對保持複合詞，明示查無、重複與超出級別", async () => {
    await open(); mocked.resolveWords.mockResolvedValue({ results: [{ input: "coffee table", status: "unknown", entries: [] }, { input: "sofa", status: "duplicate", entries: [] }, { input: "expert-word", status: "out-of-level", entries: [] }] });
    fireEvent.change(screen.getByLabelText("貼上目標單字"), { target: { value: "coffee table, sofa\nexpert-word" } }); fireEvent.click(screen.getByRole("button", { name: "比對字庫" }));
    await screen.findByText(/字庫未找到/); expect(mocked.resolveWords).toHaveBeenCalledWith(["coffee table", "sofa", "expert-word"], ["basic", "advance"]); expect(screen.getByText(/輸入重複/)).toBeTruthy(); expect(screen.getByText(/超出所選級別/)).toBeTruthy();
  });
  it("新增詞必須指定實際 GUID，不自動生成未知詞", async () => {
    current = detail({ draft: { ...draft(), targets: draft().targets.slice(0, 14) } }); await open(); mocked.resolveWords.mockResolvedValue({ results: [{ input: words[14].word, status: "matched", entries: [words[14]] }] });
    fireEvent.change(screen.getByLabelText("貼上目標單字"), { target: { value: words[14].word } }); fireEvent.click(screen.getByRole("button", { name: "比對字庫" })); fireEvent.click(await screen.findByRole("button", { name: `加入 ${words[14].word}` }));
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" })); await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled()); expect(mocked.saveDraft.mock.calls[0][0].targets[14].entryGuid).toBe(words[14].guid); expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it("進階設定固定目標詞、網頁標註及無文字規則", async () => {
    await open(); stage("場景與風格"); fireEvent.click(screen.getByText("進階圖片設定（十個提示區塊）"));
    expect((screen.getByLabelText("目標詞（依所選字庫產生）") as HTMLTextAreaElement).readOnly).toBe(true); expect((screen.getByLabelText("標註（由網頁提供）") as HTMLTextAreaElement).readOnly).toBe(true); expect((screen.getByLabelText("文字（底圖不含文字）") as HTMLTextAreaElement).readOnly).toBe(true); expect((screen.getByLabelText("人物與動作") as HTMLTextAreaElement).readOnly).toBe(false);
  });
  it("409 保留本地輸入並提供重新載入，不假裝儲存成功", async () => {
    await open(); stage("場景與風格"); fireEvent.change(screen.getByLabelText("情境標題"), { target: { value: "本地未儲存內容" } }); mocked.saveDraft.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" })); await screen.findByRole("alert"); expect((screen.getByLabelText("情境標題") as HTMLInputElement).value).toBe("本地未儲存內容"); expect(screen.getByText(/本地編輯已保留/)).toBeTruthy(); expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it("先保存與估價，明確按生成才建立一次工作；內容改動後估價失效", async () => {
    await open(); stage("故事"); fireEvent.change(screen.getByLabelText("英文"), { target: { value: "The child reads a book." } }); fireEvent.click(screen.getByRole("button", { name: "取得英文故事與翻譯估價" }));
    await screen.findByText(/本次預估 US\$0.0100/); expect(mocked.saveDraft.mock.calls[0][0].story?.textEn).toBe("The child reads a book."); expect(mocked.startJob).not.toHaveBeenCalled();
    mocked.startJob.mockResolvedValue({ job: { id: "j", draftId: current.draft.id, kind: "story", status: "done", inputVersion: 2, inputHash: "hash", output: null, error: null, createdAt: "", updatedAt: "" } });
    fireEvent.click(screen.getByRole("button", { name: "產生英文故事與翻譯" })); await waitFor(() => expect(mocked.startJob).toHaveBeenCalledWith(current.draft.id, 2, "story", "quote-story", expect.any(String), false));
    await waitFor(() => expect((screen.getByRole("button", { name: "產生英文故事與翻譯" }) as HTMLButtonElement).disabled).toBe(true));
  });
  it("故事指定字庫原型不需手填索引，保存 baseWords 與 GUID", async () => {
    await open(); stage("故事"); fireEvent.click(screen.getByText("檢查故事字庫對應／指定原型")); fireEvent.click(screen.getByRole("button", { name: /reads.*待對應/ })); mocked.searchWords.mockResolvedValue({ entries: [words[1]], total: 1 });
    fireEvent.change(screen.getByLabelText("搜尋原型"), { target: { value: "read" } }); fireEvent.click(screen.getByRole("button", { name: "搜尋原型" })); fireEvent.click(await screen.findByRole("button", { name: "指定 read" })); fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled()); const sentence = mocked.saveDraft.mock.calls[0][0].story!.sentences[0]; expect(sentence.baseWords?.[2]).toBe("read"); expect(sentence.wordLinks[0]).toMatchObject({ word: "read", entryGuid: words[1].guid, start: 8, end: 13, surface: "reads" });
  });
  it("新增句子保留分段metadata，移除句子後清除不存在或落在末句的分段", async () => {
    const split = draft();
    split.story!.sentences.push({ id: "s2", en: "The child reads again.", zh: "孩子再讀一次。", wordLinks: [] });
    split.story!.paragraphBreakAfterSentenceIds = ["s1"];
    current = detail({ draft: split }); await open(); stage("故事");
    fireEvent.click(screen.getByRole("button", { name: "新增故事句子" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalledTimes(1));
    expect(mocked.saveDraft.mock.calls[0][0].story!.paragraphBreakAfterSentenceIds).toEqual(["s1"]);
    fireEvent.click(screen.getByRole("button", { name: "移除第 1 句" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalledTimes(2));
    expect(mocked.saveDraft.mock.calls[1][0].story).not.toHaveProperty("paragraphBreakAfterSentenceIds");
    expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it("生成的網路錯誤重送保留操作編號，不會把同一按鈕當成新生成", async () => {
    await open(); stage("故事"); fireEvent.click(screen.getByRole("button", { name: "取得英文故事與翻譯估價" })); await screen.findByText(/本次預估/);
    mocked.startJob.mockRejectedValue(new Error("網路中斷")); fireEvent.click(screen.getByRole("button", { name: "產生英文故事與翻譯" })); await screen.findByText("網路中斷");
    await waitFor(() => expect((screen.getByRole("button", { name: "產生英文故事與翻譯" }) as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByRole("button", { name: "產生英文故事與翻譯" })); await waitFor(() => expect(mocked.startJob).toHaveBeenCalledTimes(2)); expect(mocked.startJob.mock.calls[0][4]).toBe(mocked.startJob.mock.calls[1][4]);
  });
  it("標籤與物件座標獨立編輯並拒絕範圍外值", async () => {
    current = detail({ draft: { ...draft(), selectedImageId: "image" }, assets: [{ id: "image", kind: "image", sha256: "hash", bytes: 1, contentType: "image/png", inputHash: "hash", metadata: {}, createdAt: "", url: "/safe-image", width: 1600, height: 900 }] });
    await open(); stage("標籤定位"); fireEvent.change(screen.getByLabelText("標籤 X"), { target: { value: "0.2" } }); fireEvent.change(screen.getByLabelText("標籤 Y"), { target: { value: "0.3" } }); fireEvent.change(screen.getByLabelText("位置種類"), { target: { value: "object" } }); fireEvent.change(screen.getByLabelText("物件 X"), { target: { value: "0.7" } }); fireEvent.change(screen.getByLabelText("物件 Y"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" })); await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled()); expect(mocked.saveDraft.mock.calls[0][0].targets[0].interaction).toEqual({ label: { x: .2, y: .3 }, object: { x: .7, y: .5 } });
  });
  it("缺音計畫和 Serena 旁白分開估價，沒有缺音時不提供補音操作", async () => {
    await open(); stage("錄音"); expect(screen.getByText("字庫音檔已齊備。")).toBeTruthy(); expect(screen.queryByRole("button", { name: "產生缺失字庫音檔" })).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "取得Serena 英文旁白估價" })); await screen.findByText(/本機運算，不呼叫雲端 TTS/); expect(mocked.quoteJob.mock.calls[0][2]).toBe("story-audio"); expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it("結果不明重試需要明示承認，再傳 ackUncertain", async () => {
    const job: StudioJob = { id: "uncertain-job", draftId: draft().id, kind: "image", status: "uncertain", inputVersion: 1, inputHash: "hash", output: null, error: "結果不明", createdAt: "", updatedAt: "" }; current = detail({ jobs: [job] }); await open();
    const retry = screen.getByRole("button", { name: "重試底圖" }) as HTMLButtonElement; expect(retry.disabled).toBe(true); fireEvent.click(screen.getByLabelText(/上次請求或取消中的請求結果不明/)); mocked.retryJob.mockResolvedValue({ job }); fireEvent.click(retry); await waitFor(() => expect(mocked.retryJob).toHaveBeenCalledWith(job.id, 1, true, expect.any(String)));
  });
  it("固定版本唯讀，驗收與發布分離，複製不改原版本", async () => {
    current = detail({ draft: { ...draft(), materializedRevision: 2 }, checks: [] }); await open(); stage("場景與風格"); expect((screen.getByLabelText("情境標題").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true); stage("預覽與發布"); const link = screen.getByRole("link", { name: "開啟學習前台驗收" }); expect(link.getAttribute("href")).toContain("#/scenarios/living-room/revisions/2"); expect(mocked.publishRevision).not.toHaveBeenCalled();
    mocked.publishRevision.mockResolvedValue({}); fireEvent.click(screen.getByRole("button", { name: "發布此版本" })); await waitFor(() => expect(mocked.publishRevision).toHaveBeenCalledWith("living-room", 2));
    mocked.forkDraft.mockResolvedValue(detail({ draft: { ...draft(), id: "new-draft" } })); fireEvent.click(screen.getByRole("button", { name: "複製成新草稿" })); await waitFor(() => expect(mocked.forkDraft).toHaveBeenCalledWith("living-room", 2));
  });
  it("job 輪詢不覆寫未儲存內容，離頁清除 timer", async () => {
    const job: StudioJob = { id: "job", draftId: draft().id, kind: "image", status: "processing", inputVersion: 1, inputHash: "", output: null, error: null, createdAt: "", updatedAt: "" };
    current = detail({ jobs: [job] });
    vi.useFakeTimers(); const view = render(<ScenarioStudio />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); }); fireEvent.click(screen.getByRole("button", { name: "開啟情境" })); await act(async () => { await Promise.resolve(); });
    stage("場景與風格");
    // 模擬工作啟動邊界的尚未儲存 input；即使背景poll收到新版本也要保留。
    fireEvent.change(screen.getByLabelText("情境標題"), { target: { value: "未儲存" } }); current = { ...current, draft: { ...current.draft, titleZh: "伺服器版本", version: 2 } };
    const calls = mocked.getDraft.mock.calls.length; await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); }); expect(mocked.getDraft.mock.calls.length).toBeGreaterThan(calls); expect((screen.getByLabelText("情境標題") as HTMLInputElement).value).toBe("未儲存"); view.unmount(); const stopped = mocked.getDraft.mock.calls.length; await act(async () => { vi.advanceTimersByTime(9000); }); expect(mocked.getDraft.mock.calls.length).toBe(stopped);
  });
  it("現有離線匯入版本可驗收與複製，不必重建已完成客廳", async () => {
    mocked.listRevisions.mockResolvedValue({ scenarios: [{ scenarioKey: "living-room", revision: 1, titleZh: "客廳試點", status: "published", targetCount: 15 }] }); mocked.forkDraft.mockResolvedValue(detail()); render(<ScenarioStudio />); fireEvent.click(await screen.findByRole("button", { name: "複製為製作草稿" })); await waitFor(() => expect(mocked.forkDraft).toHaveBeenCalledWith("living-room", 1)); expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it.each(["done", "cancelled", "failed", "uncertain"] as const)("%s 故事候選不自動覆寫編輯，手動套用保留其他內容並作廢旁白與驗收", async status => {
    const candidate = { ...draft().story!, textEn: "A child sleeps.", textZh: "孩子睡著了。", sentences: [{ id: "candidate", en: "A child sleeps.", zh: "孩子睡著了。", wordLinks: [] }] };
    const job: StudioJob = { id: "story-candidate", draftId: draft().id, kind: "story", status, inputVersion: 1, inputHash: "hash", output: { story: candidate }, error: null, createdAt: "", updatedAt: "" };
    current = detail({ draft: { ...draft(), selectedAudioId: "old-audio", review: { story: true, image: true, coordinates: true, audio: true } }, jobs: [job] });
    await open(); stage("場景與風格"); fireEvent.change(screen.getByLabelText("情境標題"), { target: { value: "尚未儲存的標題" } }); stage("故事");
    expect((screen.getByLabelText("英文") as HTMLTextAreaElement).value).toBe("A child reads."); expect(mocked.saveDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("已完成的故事候選（1）")); fireEvent.click(screen.getByRole("button", { name: "套用故事候選第 1 份" })); expect((screen.getByLabelText("英文") as HTMLTextAreaElement).value).toBe(candidate.textEn);
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" })); await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalled()); expect(mocked.saveDraft.mock.calls[0][0]).toMatchObject({ titleZh: "尚未儲存的標題", selectedAudioId: null, review: { story: false, image: false, coordinates: false, audio: false } }); expect(mocked.startJob).not.toHaveBeenCalled();
  });
  it("損壞的故事候選不提供套用入口", async () => {
    const job: StudioJob = { id: "bad-candidate", draftId: draft().id, kind: "story", status: "done", inputVersion: 1, inputHash: "hash", output: { story: { textEn: "invalid", sentences: [null] } }, error: null, createdAt: "", updatedAt: "" }; current = detail({ jobs: [job] }); await open(); stage("故事"); expect(screen.queryByText(/已完成的故事候選/)).toBeNull();
  });
  it("已取消但外部結果不明仍須承認費用，重試與新生成都傳 ack", async () => {
    const job: StudioJob = { id: "cancelled-charge", draftId: draft().id, kind: "image", status: "cancelled", requiresUncertainAcknowledgement: true, inputVersion: 1, inputHash: "hash", output: null, error: "外部結果不明", createdAt: "", updatedAt: "" }; current = detail({ jobs: [job] }); await open(); stage("故事");
    fireEvent.click(screen.getByRole("button", { name: "取得英文故事與翻譯估價" })); await screen.findByText(/本次預估/); expect((screen.getByRole("button", { name: "產生英文故事與翻譯" }) as HTMLButtonElement).disabled).toBe(true); expect((screen.getByRole("button", { name: "重試底圖" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/上次請求或取消中的請求結果不明/)); mocked.startJob.mockResolvedValue({ job }); fireEvent.click(screen.getByRole("button", { name: "產生英文故事與翻譯" })); await waitFor(() => expect(mocked.startJob.mock.calls[0][5]).toBe(true));
    await waitFor(() => expect((screen.getByRole("button", { name: "重試底圖" }) as HTMLButtonElement).disabled).toBe(true)); fireEvent.click(screen.getByLabelText(/上次請求或取消中的請求結果不明/)); mocked.retryJob.mockResolvedValue({ job }); fireEvent.click(screen.getByRole("button", { name: "重試底圖" })); await waitFor(() => expect(mocked.retryJob).toHaveBeenCalledWith(job.id, 1, true, expect.any(String)));
  });
  it("執行中取消說明送出請求仍可能完成或計費，取消回應的風險不能消失", async () => {
    const job: StudioJob = { id: "sending", draftId: draft().id, kind: "image", status: "processing", inputVersion: 1, inputHash: "hash", output: null, error: null, createdAt: "", updatedAt: "" }; current = detail({ jobs: [job] }); await open();
    expect(screen.getByText(/若請求已送出，仍可能完成或計費/)).toBeTruthy(); mocked.cancelJob.mockImplementation(async () => { const cancelled: StudioJob = { ...job, status: "cancelled", requiresUncertainAcknowledgement: true }; current = detail({ jobs: [cancelled] }); return { job: cancelled }; }); fireEvent.click(screen.getByRole("button", { name: "取消執行中的工作" })); await screen.findByLabelText(/上次請求或取消中的請求結果不明/); expect((screen.getByRole("button", { name: "重試底圖" }) as HTMLButtonElement).disabled).toBe(true); expect(mocked.cancelJob).toHaveBeenCalledWith("sending");
  });
});
