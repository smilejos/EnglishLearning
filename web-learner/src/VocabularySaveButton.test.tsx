import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VocabularySaveButton } from "./VocabularySaveButton";
import * as api from "./api";
import type { VocabularyItem } from "./vocabularyTypes";

vi.mock("./api", () => ({ listVocabulary: vi.fn(), saveVocabulary: vi.fn() }));
const saved: VocabularyItem = {
  id: 1, word: "habit", status: "active", savedAt: "2026-09-20T00:00:00Z",
  sources: [{ id: 1, articleId: 2, paragraphId: 3, title: "課文", text: "A habit.",
    materialType: "school", grade: null, unit: null, category: null, savedAt: "2026-09-20T00:00:00Z" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listVocabulary).mockResolvedValue([]);
  vi.mocked(api.saveVocabulary).mockResolvedValue(saved);
});
afterEach(cleanup);

describe("單字卡主動收藏", () => {
  it("開卡不寫資料，按收藏才寫來源；成功後防止重複點選", async () => {
    render(<VocabularySaveButton word="Habit" articleId={2} paragraphId={3} />);
    const button = await screen.findByRole("button", { name: "收藏單字" });
    expect(api.saveVocabulary).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(api.saveVocabulary).toHaveBeenCalledWith({ word: "Habit", articleId: 2, paragraphId: 3 });
    expect((await screen.findByRole("button", { name: "已收藏本篇單字" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("已熟悉仍可重新收藏；失敗可重試且不顯示收藏成功", async () => {
    vi.mocked(api.listVocabulary).mockResolvedValue([{ ...saved, status: "mastered" }]);
    vi.mocked(api.saveVocabulary).mockRejectedValueOnce(new Error("離線"));
    render(<VocabularySaveButton word="habit" articleId={2} paragraphId={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "重新收藏單字" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "已收藏本篇單字" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新收藏單字" }));
    await screen.findByRole("button", { name: "已收藏本篇單字" });
  });
  it("同字在其他課文已收藏，仍可收藏這篇來源", async () => {
    vi.mocked(api.listVocabulary).mockResolvedValue([saved]);
    render(<VocabularySaveButton word="habit" articleId={9} paragraphId={10} />);
    fireEvent.click(await screen.findByRole("button", { name: "收藏單字" }));
    await waitFor(() => expect(api.saveVocabulary).toHaveBeenCalledWith({ word: "habit", articleId: 9, paragraphId: 10 }));
  });
});
