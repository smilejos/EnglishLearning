// 後台刪除流程的錯誤可見性測試。
//
// 這組測試守的是一個真實發生過的 bug：`DELETE /explanations/:id` 沒被登記在
// nginx / vite 的轉發設定裡，請求根本到不了 api；而刪除的 handler 又沒有
// try/catch，失敗變成 unhandled rejection——使用者按下去只看到「什麼都沒發生」。
// 路由設定本身由 api/src/routeConfig.test.ts 守；此處守的是「失敗一定要被看見」。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import App, { ArticleView, WordManager } from "./App";
import * as api from "./api";
vi.mock("./Illustrations", () => ({
  Illustrations: ({ onValidationWarningsChange }: { onValidationWarningsChange: (warnings: string[]) => void }) => (
    <button onClick={() => onValidationWarningsChange(["段落 67：已略過不合規教學單字"])}>模擬圖片警告</button>
  ),
}));

vi.mock("./api", () => ({
  getArticle: vi.fn(),
  listArticleExplanations: vi.fn(),
  deleteExplanation: vi.fn(),
  retryArticle: vi.fn(),
  regenerateParagraph: vi.fn(),
  searchWords: vi.fn(),
  getWordExplanations: vi.fn(),
  deleteWord: vi.fn(),
  audioUrl: (p: string) => `/audio/${p}`,
  listArticles: vi.fn(),
  listMissingAudio: vi.fn(),
  getStats: vi.fn(),
}));

const mocked = vi.mocked(api);

const ARTICLE = {
  id: 1,
  title: "測試文章",
  materialType: "school",
  grade: null,
  unit: null,
  week: null,
  page: null,
  categoryId: null,
  level: null,
  status: "done",
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const EXPLANATION = {
  id: 7,
  wordId: 3,
  articleId: 1,
  enExplanation: null,
  enExample: null,
  zhTranslation: "習慣",
  zhExplanation: null,
  zhExample: null,
  headword: null,
  word: { id: 3, normalizedWord: "habit" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ArticleView：刪除單字解釋", () => {
  beforeEach(() => {
    mocked.getArticle.mockResolvedValue({
      article: ARTICLE as never,
      paragraphs: [],
    });
    mocked.listArticleExplanations.mockResolvedValue({
      explanations: [EXPLANATION as never],
    });
  });

  it("刪除失敗時把錯誤訊息顯示出來，不是靜默無反應", async () => {
    mocked.deleteExplanation.mockRejectedValue(
      new Error("405 Method Not Allowed"),
    );

    const { container } = render(<ArticleView id={1} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /單字/ }));
    const btn = await screen.findByRole("button", { name: "刪除" });
    btn.click();

    await waitFor(() =>
      expect(container.querySelector(".error-text")?.textContent).toContain(
        "405 Method Not Allowed",
      ),
    );
    // 刪除失敗，清單上的解釋仍在（沒有假裝成功）。
    expect(screen.getByText(/習慣/)).toBeTruthy();
  });

  it("刪除成功時重新載入清單且不顯示錯誤", async () => {
    mocked.deleteExplanation.mockResolvedValue({ ok: true });
    mocked.listArticleExplanations
      .mockResolvedValueOnce({ explanations: [EXPLANATION as never] })
      .mockResolvedValueOnce({ explanations: [] });

    const { container } = render(<ArticleView id={1} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /單字/ }));
    (await screen.findByRole("button", { name: "刪除" })).click();

    await waitFor(() => expect(mocked.deleteExplanation).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(screen.getByText("本篇尚無單字解釋。")).toBeTruthy(),
    );
    expect(container.querySelector(".error-text")).toBeNull();
  });

  it("按刪除後直接送出，不跳確認視窗", async () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocked.deleteExplanation.mockResolvedValue({ ok: true });
    render(<ArticleView id={1} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /單字/ }));
    (await screen.findByRole("button", { name: "刪除" })).click();
    await waitFor(() => expect(mocked.deleteExplanation).toHaveBeenCalledWith(7));
    expect(confirmation).not.toHaveBeenCalled();
  });
});

it("文章詳情預設顯示音檔，切換分頁只呈現所選內容", async () => {
  mocked.getArticle.mockResolvedValue({
    article: ARTICLE as never,
    paragraphs: [{ id: 9, idx: 0, text: "A short paragraph.", status: "done", translation: "簡短的段落。", enAudioPath: null, zhAudioPath: null }] as never,
  });
  mocked.listArticleExplanations.mockResolvedValue({ explanations: [EXPLANATION as never] });
  render(<ArticleView id={1} onBack={() => {}} />);
  const audioTab = await screen.findByRole("tab", { name: /音檔/ });
  expect(screen.getByRole("heading", { name: "測試文章" }).parentElement?.contains(screen.getByRole("button", { name: /返回清單/ }))).toBe(true);
  expect(audioTab.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").textContent).toContain("A short paragraph.");
  fireEvent.click(screen.getByRole("tab", { name: /單字/ }));
  expect(screen.getByRole("tabpanel").textContent).toContain("habit");
  expect(screen.getByRole("tabpanel").textContent).not.toContain("A short paragraph.");
  fireEvent.keyDown(screen.getByRole("tab", { name: /單字/ }), { key: "ArrowLeft" });
  expect(screen.getByRole("tab", { name: /音檔/ }).getAttribute("aria-selected")).toBe("true");
});

it("將所選圖片版本的教學單字警告顯示在單字頁籤", async () => {
  mocked.getArticle.mockResolvedValue({ article: ARTICLE as never, paragraphs: [] });
  mocked.listArticleExplanations.mockResolvedValue({ explanations: [] });
  render(<ArticleView id={1} onBack={() => {}} />);
  fireEvent.click(await screen.findByRole("tab", { name: "圖片" }));
  fireEvent.click(screen.getByRole("button", { name: "模擬圖片警告" }));
  expect(screen.getByRole("tabpanel").textContent).not.toContain("段落 67");
  fireEvent.click(screen.getByRole("tab", { name: /單字/ }));
  expect(screen.getByRole("tabpanel").textContent).toContain("段落 67：已略過不合規教學單字");
});

describe("WordManager：刪除單字／解釋", () => {
  beforeEach(() => {
    mocked.searchWords.mockResolvedValue({
      words: [
        { id: 3, normalizedWord: "habit", enAudioPath: null, explanationCount: 1 },
      ],
    });
    mocked.getWordExplanations.mockResolvedValue({
      word: null,
      explanations: [EXPLANATION as never],
    });
  });

  it("刪除單字失敗時顯示錯誤", async () => {
    mocked.deleteWord.mockRejectedValue(new Error("500 internal server error"));

    const { container } = render(<WordManager />);
    (await screen.findByRole("button", { name: "刪除單字與全部解釋" })).click();

    await waitFor(() =>
      expect(container.querySelector(".error-text")?.textContent).toContain(
        "500 internal server error",
      ),
    );
  });

  it("刪除解釋失敗時顯示錯誤", async () => {
    mocked.deleteExplanation.mockRejectedValue(new Error("404 not found"));

    const { container } = render(<WordManager initialQuery="habit" />);
    (await screen.findByRole("button", { name: "刪除這筆解釋" })).click();

    await waitFor(() =>
      expect(container.querySelector(".error-text")?.textContent).toContain(
        "404 not found",
      ),
    );
  });
});

it("補缺音檔開啟獨立頁面，返回後才顯示文章搜尋", async () => {
  window.history.replaceState(null, "", "#/");
  mocked.listArticles.mockResolvedValue({ articles: [] });
  mocked.listMissingAudio.mockResolvedValue({ items: [] });
  mocked.getStats.mockRejectedValue(new Error("stats unavailable"));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "補缺音檔" }));
  await screen.findByRole("heading", { name: "缺失音檔清單" });
  expect(screen.queryByText(/文章清單 · 共/)).toBeNull();
  expect(screen.getByRole("textbox", { name: "搜尋缺失音檔" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "← 返回文章" }));
  expect(screen.getByText("文章清單 · 共 0 篇")).toBeTruthy();
});

it("文章沒有分類與標籤時不顯示多餘的 0", async () => {
  window.history.replaceState(null, "", "#/");
  mocked.listArticles.mockResolvedValue({
    articles: [{ ...ARTICLE, category: null, tags: [] }] as never,
  });
  mocked.getStats.mockRejectedValue(new Error("stats unavailable"));
  render(<App />);
  const title = await screen.findByText("測試文章");
  expect(title.closest("tr")?.textContent).not.toContain("0");
});
