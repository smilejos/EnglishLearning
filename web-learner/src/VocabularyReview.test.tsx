// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VocabularyReview from "./VocabularyReview";
import * as api from "./api";
import type { VocabularyItem, VocabularySource } from "./vocabularyTypes";
import { emptyVocabularyFilters, filterVocabulary } from "./lib/vocabulary";
import type { WordExplanation } from "./types";
vi.mock("./api", () => ({ listVocabulary: vi.fn(), setVocabularyStatus: vi.fn(), removeVocabulary: vi.fn(), getExplanations: vi.fn(), audioUrl: (p: string) => `/audio/${p}` }));
const source: VocabularySource = { id: 10, articleId: 20, paragraphId: 30, title: "Habit lesson", text: "A good habit.", materialType: "school", grade: "三年級", unit: "第一課", category: "生活", savedAt: "2026-09-19T16:00:00Z" };
const item: VocabularyItem = { id: 1, word: "habit", status: "active", savedAt: source.savedAt, sources: [source] };
beforeEach(() => {
  sessionStorage.clear(); vi.resetAllMocks();
  vi.mocked(api.listVocabulary).mockResolvedValue([item]);
  vi.mocked(api.getExplanations).mockResolvedValue({ word: null, explanations: [] });
  vi.mocked(api.setVocabularyStatus).mockImplementation(async (_id, status) => ({ ...item, status }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("收藏篩選", () => {
  it("同一來源須同時符合各條件，收藏日期用台北日且含端點", () => {
    const multi = { ...item, sources: [source, { ...source, id: 11, materialType: "extracurricular" as const, grade: "五年級" }] };
    expect(filterVocabulary([multi], { ...emptyVocabularyFilters, materialType: "school", grade: "五年級" })).toEqual([]);
    expect(filterVocabulary([multi], { ...emptyVocabularyFilters, from: "2026-09-20", to: "2026-09-20" })).toHaveLength(1);
    expect(filterVocabulary([multi], { ...emptyVocabularyFilters, to: "2026-09-19" })).toEqual([]);
  });
});

describe("單字複習", () => {
  it("優先所選課文的解釋，切换挑戰停止音訊並隱藏答案", async () => {
    const explanation = (id: number, articleId: number, zhTranslation: string): WordExplanation => ({
      id, articleId, wordId: 1, paragraphId: 30, zhTranslation, headword: null, createdAt: item.savedAt,
      article: { id: articleId, title: `課文 ${articleId}` },
      enExplanation: null, zhExplanation: null, enExample: null, zhExample: null,
      enExplanationAudioPath: null, zhExplanationAudioPath: null, enExampleAudioPath: null,
      zhExampleAudioPath: null, zhTranslationAudioPath: "meaning.wav",
    });
    const pause = vi.fn();
    vi.stubGlobal("Audio", vi.fn(() => ({ play: vi.fn().mockResolvedValue(undefined), pause })));
    vi.mocked(api.getExplanations).mockResolvedValue({ word: null, explanations: [explanation(2, 21, "其他意思"), explanation(1, 20, "習慣")] });
    render(<VocabularyReview onJump={vi.fn()} />);
    await screen.findByText("習慣");
    expect(screen.queryByText("其他意思")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "中文意思語音" }));
    fireEvent.click(screen.getByRole("button", { name: "快速挑戰" }));
    expect(pause).toHaveBeenCalled();
    expect(screen.queryByText("習慣")).toBeNull();
    expect(screen.queryByText("A good habit.")).toBeNull();
  });
  it("沒有解釋仍顯示原文，回到正確課文段落並保留篩選", async () => {
    const jump = vi.fn();
    const view = render(<VocabularyReview onJump={jump} />);
    await screen.findByText("尚無解釋，可先用收藏原文複習。");
    fireEvent.change(screen.getByLabelText("年級"), { target: { value: "三年級" } });
    fireEvent.click(screen.getByRole("button", { name: "回原課文" }));
    expect(jump).toHaveBeenCalledWith(20, 30, "habit");
    view.unmount(); render(<VocabularyReview onJump={jump} />);
    await screen.findByText("A good habit.");
    expect((screen.getByLabelText("年級") as HTMLSelectElement).value).toBe("三年級");
  });
  it("挑戰先隱藏原文；忘記保留並重設，記得成功後才移出且可重新收藏", async () => {
    render(<VocabularyReview onJump={vi.fn()} />);
    await screen.findByText("A good habit.");
    fireEvent.click(screen.getByRole("button", { name: "快速挑戰" }));
    expect(screen.queryByText("A good habit.")).toBeNull();
    expect(screen.queryByRole("button", { name: "記得" })).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "揭曉答案" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "揭曉答案" }));
    fireEvent.click(screen.getByRole("button", { name: "忘記" }));
    expect(api.setVocabularyStatus).not.toHaveBeenCalled();
    expect(screen.queryByText("A good habit.")).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "揭曉答案" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "揭曉答案" }));
    fireEvent.click(screen.getByRole("button", { name: "記得" }));
    await screen.findByText("目前沒有符合條件的收藏單字。");
    expect(api.setVocabularyStatus).toHaveBeenCalledWith(1, "mastered");
    fireEvent.change(screen.getByLabelText("收藏狀態"), { target: { value: "mastered" } });
    fireEvent.click(await screen.findByRole("button", { name: "重新收藏" }));
    await waitFor(() => expect(api.setVocabularyStatus).toHaveBeenLastCalledWith(1, "active"));
  });
  it("更新失敗不移除卡片，解釋載入失敗不允許標熟悉", async () => {
    vi.mocked(api.setVocabularyStatus).mockRejectedValue(new Error("儲存失敗"));
    const view = render(<VocabularyReview onJump={vi.fn()} />);
    await screen.findByText("尚無解釋，可先用收藏原文複習。");
    fireEvent.click(screen.getByRole("button", { name: "已熟悉" }));
    await screen.findByText(/操作失敗：儲存失敗/);
    expect(screen.getByRole("heading", { name: "habit" })).toBeTruthy();
    view.unmount(); vi.mocked(api.getExplanations).mockRejectedValue(new Error("離線"));
    render(<VocabularyReview onJump={vi.fn()} />);
    await screen.findByText(/解釋載入失敗：離線/);
    expect((screen.getByRole("button", { name: "已熟悉" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("來源課文刪除仍有快照，但無返回按鈕；取消收藏失敗保留", async () => {
    vi.mocked(api.listVocabulary).mockResolvedValue([{ ...item, sources: [{ ...source, articleId: null, paragraphId: null }] }]);
    vi.mocked(api.removeVocabulary).mockRejectedValue(new Error("刪除失敗"));
    render(<VocabularyReview onJump={vi.fn()} />);
    await screen.findByText("A good habit.");
    expect(screen.queryByRole("button", { name: "回原課文" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));
    await screen.findByText(/操作失敗：刪除失敗/);
    expect(screen.getByRole("heading", { name: "habit" })).toBeTruthy();
  });
});
