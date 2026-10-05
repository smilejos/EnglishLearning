import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import * as api from "./api";
import type { Article, Paragraph } from "./types";
import type { VocabularyItem } from "./vocabularyTypes";

vi.mock("./api", () => ({
  listVocabulary: vi.fn(), saveVocabulary: vi.fn(), setVocabularyStatus: vi.fn(), removeVocabulary: vi.fn(),
  getExplanations: vi.fn(), getArticle: vi.fn(), getArticleLookups: vi.fn(), getMe: vi.fn(), listArticles: vi.fn(),
  audioUrl: (p: string) => `/audio/${p}`,
}));
vi.mock("./useArticlePlayer", () => ({
  SPEEDS: [1],
  useArticlePlayer: () => ({ playing: false, active: false, duration: 0, currentParagraphId: null, index: -1 }),
}));
const article: Article = { id: 20, title: "Habit lesson", materialType: "school", grade: "三年級", unit: "第一課", week: null, level: null, category: null, tags: [], status: "done", createdAt: "2026-09-20T00:00:00Z" };
const paragraph: Paragraph = { id: 30, articleId: 20, idx: 0, text: "A good habit.", translation: null, enAudioPath: null, zhAudioPath: null, status: "done" };
const item: VocabularyItem = { id: 1, word: "habit", status: "active", savedAt: article.createdAt,
  sources: [{ id: 10, articleId: 20, paragraphId: 30, title: article.title, text: paragraph.text,
    materialType: "school", grade: "三年級", unit: "第一課", category: null, savedAt: article.createdAt }] };
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  window.history.replaceState(null, "", "#/review");
  vi.mocked(api.getMe).mockResolvedValue({ user: { id: 1, email: "reader@example.com", role: "reader" } });
  vi.mocked(api.getArticle).mockResolvedValue({ article, paragraphs: [paragraph] });
  vi.mocked(api.getArticleLookups).mockResolvedValue({ words: [] });
  vi.mocked(api.getExplanations).mockResolvedValue({ word: null, explanations: [] });
  vi.mocked(api.listVocabulary).mockResolvedValue([item]);
  vi.mocked(api.listArticles).mockResolvedValue({ articles: [article] });
});
afterEach(cleanup);

describe("收藏到原課文的完整導航", () => {
  it("首頁有三功能入口，文章清單獨立路由且品牌回首頁", async () => {
    window.history.replaceState(null, "", "#");
    render(<App />);
    expect(screen.getByRole("link", { name: /文章閱讀/ }).getAttribute("href")).toBe("#/articles");
    expect(screen.getByRole("link", { name: /單字練習/ }).getAttribute("href")).toBe("#/practice");
    expect(screen.getByText("即將推出").closest("[aria-disabled]")).toBeTruthy();
    expect(api.listArticles).not.toHaveBeenCalled();
    await act(async () => { window.location.hash = "#/articles"; window.dispatchEvent(new Event("hashchange")); });
    await screen.findByRole("heading", { name: "開始閱讀" });
    expect(await screen.findByRole("heading", { name: "Habit lesson" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "回首頁" }));
    await act(async () => { window.dispatchEvent(new Event("hashchange")); });
    await screen.findByRole("heading", { name: "今天，想怎麼練習英文？" });
  });
  it("回課文定位原段落及單字，返回複習保留篩選", async () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      render(<App />);
      await screen.findByText("A good habit.");
      fireEvent.change(screen.getByLabelText("年級"), { target: { value: "三年級" } });
      fireEvent.click(screen.getByRole("button", { name: "回原課文" }));
      await act(async () => { window.dispatchEvent(new Event("hashchange")); });
      const word = await screen.findByRole("button", { name: "habit." });
      expect(word.classList.contains("vocab--target")).toBe(true);
      expect(word.closest("p")?.id).toBe("para-30");
      expect(scroll).toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "← 單字複習" }));
      await act(async () => { window.dispatchEvent(new Event("hashchange")); });
      await screen.findByRole("heading", { name: "我的單字複習" });
      expect((screen.getByLabelText("年級") as HTMLSelectElement).value).toBe("三年級");
    } finally { HTMLElement.prototype.scrollIntoView = original; }
  });
  it("一般讀者點字只開卡，收藏需主動按下", async () => {
    window.history.replaceState(null, "", "#/a/20");
    vi.mocked(api.listVocabulary).mockResolvedValue([]);
    vi.mocked(api.saveVocabulary).mockResolvedValue(item);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "habit." }));
    const save = await screen.findByRole("button", { name: "收藏單字" });
    expect(api.saveVocabulary).not.toHaveBeenCalled();
    fireEvent.click(save);
    await waitFor(() => expect(api.saveVocabulary).toHaveBeenCalledWith({ word: "habit", articleId: 20, paragraphId: 30 }));
    await screen.findByRole("button", { name: "已收藏本篇單字" });
  });
  it("例句與解釋使用相同排版，中文只顯示文字", async () => {
    window.history.replaceState(null, "", "#/a/20");
    vi.mocked(api.getExplanations).mockResolvedValue({
      word: { id: 1, normalizedWord: "habit", enAudioPath: "word.wav", createdAt: article.createdAt },
      explanations: [{
        id: 1, wordId: 1, articleId: 20, paragraphId: 30,
        article: { id: 20, title: article.title }, createdAt: article.createdAt,
        headword: null, zhTranslation: "習慣", zhTranslationAudioPath: "old-zh.wav",
        enExplanation: "a regular practice", enExplanationAudioPath: "en-definition.wav",
        zhExplanation: "定期做的事", zhExplanationAudioPath: "old-zh-definition.wav",
        enExample: "A good habit helps.", enExampleAudioPath: "en-example.wav",
        zhExample: "好習慣有幫助。", zhExampleAudioPath: "old-zh-example.wav",
      }],
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "habit." }));
    await screen.findByText("A good habit helps.");
    const definition = screen.getByText("解釋（英）：").closest("p");
    const example = screen.getByText("例句（英）：").closest("p");
    expect(example?.className).toBe(definition?.className);
    expect(screen.queryByRole("button", { name: "播放解釋（中）" })).toBeNull();
    expect(screen.queryByRole("button", { name: "播放例句（中）" })).toBeNull();
    expect(screen.getByRole("button", { name: "播放例句（英）" })).toBeTruthy();
  });
});
