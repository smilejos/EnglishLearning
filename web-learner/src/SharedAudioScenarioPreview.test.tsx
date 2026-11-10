import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SharedAudioScenarioPreview } from "./SharedAudioScenarioPreview";
import data from "./scenarioPreviewData.json";

vi.mock("./ScenarioPreview", () => ({ ScenarioPreview: ({ audioUrls }: { audioUrls: Record<string, string> }) => <output>{JSON.stringify(audioUrls)}</output> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const guid = "00000000-0000-4000-8000-000000000001";
const url = `/audio/wordbank/09eeb3d17582e855/${guid}.mp3`;

it("獨立情境預覽以原GUID key取得共用API音檔，失敗後可重新載入", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, json: async () => ({ assets: { [`${guid}.mp3`]: { url, text: "sofa", assetGuid: guid } } }) }));
  render(<SharedAudioScenarioPreview data={data} imageUrl="/image.png" />);
  await act(async () => {});
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("{}");
  fireEvent.click(screen.getByRole("button", { name: "重新載入音訊" }));
  await act(async () => {});
  expect(screen.queryByRole("alert")).toBeNull();
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ [`${guid}.mp3`]: url });
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/audio-assets/scenario-preview/living-room");
});

it("離開預覽會取消尚未完成的API讀取", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const { unmount } = render(<SharedAudioScenarioPreview data={data} imageUrl="/image.png" />);
  const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});
