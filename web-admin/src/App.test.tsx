// 後台刪除流程的錯誤可見性測試。
//
// 這組測試守的是一個真實發生過的 bug：`DELETE /explanations/:id` 沒被登記在
// nginx / vite 的轉發設定裡，請求根本到不了 api；而刪除的 handler 又沒有
// try/catch，失敗變成 unhandled rejection——使用者按下去只看到「什麼都沒發生」。
// 路由設定本身由 api/src/routeConfig.test.ts 守；此處守的是「失敗一定要被看見」。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ArticleView, WordManager } from "./App";
import * as api from "./api";

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
  vi.spyOn(window, "confirm").mockReturnValue(true);
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
    (await screen.findByRole("button", { name: "刪除" })).click();

    await waitFor(() => expect(mocked.deleteExplanation).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(screen.getByText("本篇尚無單字解釋。")).toBeTruthy(),
    );
    expect(container.querySelector(".error-text")).toBeNull();
  });

  it("使用者在確認框按取消時不送出刪除", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ArticleView id={1} onBack={() => {}} />);
    (await screen.findByRole("button", { name: "刪除" })).click();
    await waitFor(() => expect(mocked.deleteExplanation).not.toHaveBeenCalled());
  });
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
    (await screen.findByRole("button", { name: "刪除單字" })).click();

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
