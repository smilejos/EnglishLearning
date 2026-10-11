import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScenarioTags } from "./ScenarioTags";
import * as api from "./scenarioStudioApi";

vi.mock("./scenarioStudioApi", () => ({ scenarioTagOptions: vi.fn(), saveScenarioTags: vi.fn() }));
const family = { id: 1, kind: "生活場景", label: "家庭" };
const restaurant = { id: 2, kind: "生活場景", label: "餐廳" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.scenarioTagOptions).mockResolvedValue({ kind: "生活場景", tags: [family, restaurant] });
  vi.mocked(api.saveScenarioTags).mockResolvedValue({ tags: [family, restaurant] });
});
afterEach(cleanup);
it("原有分類可複選儲存，只有明確提交才更新並重新讀取清單", async () => {
  const saved = vi.fn().mockResolvedValue(undefined);
  render(<ScenarioTags scenarioKey="breakfast" title="一起準備早餐" tags={[family]} onSaved={saved} />);
  expect(screen.getByText("情境分類：家庭")).toBeTruthy();
  expect(api.scenarioTagOptions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "設定一起準備早餐的情境分類" }));
  const second = await screen.findByRole("checkbox", { name: "餐廳" });
  expect((screen.getByRole("checkbox", { name: "家庭" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText("生活場景（可複選）")).toBeTruthy();
  fireEvent.click(second);
  expect(api.saveScenarioTags).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "儲存分類" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.saveScenarioTags).toHaveBeenCalledWith("breakfast", [1, 2]);
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("取消不寫入，清空可存為未分類，失敗保留選項並可重試", async () => {
  render(<ScenarioTags scenarioKey="breakfast" title="早餐" tags={[family]} onSaved={vi.fn().mockResolvedValue(undefined)} />);
  const open = () => fireEvent.click(screen.getByRole("button", { name: "設定早餐的情境分類" }));
  open(); await screen.findByRole("checkbox", { name: "家庭" });
  fireEvent.click(screen.getByRole("checkbox", { name: "餐廳" }));
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(api.saveScenarioTags).not.toHaveBeenCalled();
  open(); await screen.findByRole("checkbox", { name: "家庭" });
  expect((screen.getByRole("checkbox", { name: "餐廳" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("checkbox", { name: "家庭" }));
  vi.mocked(api.saveScenarioTags).mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "儲存分類" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("checkbox", { name: "家庭" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "儲存分類" }));
  await waitFor(() => expect(screen.queryByRole("checkbox")).toBeNull());
  expect(api.saveScenarioTags).toHaveBeenLastCalledWith("breakfast", []);
});
it("載入失敗可重試，空標籤維度提供管理提示", async () => {
  vi.mocked(api.scenarioTagOptions).mockRejectedValueOnce(new Error("offline"));
  render(<ScenarioTags scenarioKey="breakfast" title="早餐" onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "設定早餐的情境分類" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: "儲存分類" }) as HTMLButtonElement).disabled).toBe(true);
  vi.mocked(api.scenarioTagOptions).mockResolvedValue({ kind: "情境", tags: [] });
  fireEvent.click(screen.getByRole("button", { name: "重新載入分類" }));
  await screen.findByText(/尚未建立「情境」標籤值/);
  expect(api.saveScenarioTags).not.toHaveBeenCalled();
});
