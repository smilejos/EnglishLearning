import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GenerationSettings } from "./GenerationSettings";
import { req } from "./api";

vi.mock("./api", () => ({ req: vi.fn() }));

const google = { provider: "google", model: "gemini-text", label: "Gemini Text" };
const openai = { provider: "openai", model: "gpt-text", label: "GPT Text" };
const response = {
  settings: {
    text: { provider: "google", model: "gemini-text" },
    speech: { provider: "google", model: "gemini-speech", voiceEn: "Kore", voiceZh: "Aoede" },
    image: { provider: "google", model: "gemini-image" },
  },
  version: 3,
  options: {
    text: [google, openai],
    speech: [
      { provider: "google", model: "gemini-speech", label: "Gemini Speech" },
      { provider: "openai", model: "gpt-speech", label: "GPT Speech" },
    ],
    image: [
      { provider: "google", model: "gemini-image", label: "Gemini Image" },
      { provider: "openai", model: "gpt-image", label: "GPT Image" },
    ],
    voices: { google: ["Kore", "Aoede"], openai: ["alloy", "nova"] },
  },
  availability: { google: true, openai: true },
};

beforeEach(() => {
  vi.mocked(req).mockReset();
  vi.mocked(req).mockResolvedValue(response as never);
});
afterEach(cleanup);

it("loads three generation settings and keeps save disabled until edited", async () => {
  render(<GenerationSettings />);
  await screen.findByRole("heading", { name: "生成設定" });
  await screen.findByRole("group", { name: "文字" });
  expect(screen.getAllByRole("group")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "儲存生成設定" }).hasAttribute("disabled")).toBe(true);
});

it("filters models by provider and saves settings with the loaded version", async () => {
  render(<GenerationSettings />);
  const text = await screen.findByRole("group", { name: "文字" });
  fireEvent.change(within(text).getByLabelText("供應商"), { target: { value: "openai" } });
  expect(within(text).getByRole("option", { name: "GPT Text" })).toBeTruthy();
  expect(within(text).queryByRole("option", { name: "Gemini Text" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "儲存生成設定" }));
  await waitFor(() => expect(vi.mocked(req)).toHaveBeenCalledWith("/generation-settings", expect.objectContaining({
    method: "PUT",
    body: expect.stringContaining('"version":3'),
  })));
  const put = vi.mocked(req).mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(JSON.parse(String(put[1]?.body)).settings.text).toEqual({ provider: "openai", model: "gpt-text" });
});

it("switches speech voices with provider and reports a version conflict", async () => {
  vi.mocked(req).mockImplementation(async (_path, init) => {
    if (init?.method === "PUT") throw new Error("409 Conflict: stale version");
    return response as never;
  });
  render(<GenerationSettings />);
  const speech = await screen.findByRole("group", { name: "語音" });
  fireEvent.change(within(speech).getByLabelText("供應商"), { target: { value: "openai" } });
  expect((within(speech).getByLabelText("英文聲線") as HTMLSelectElement).value).toBe("alloy");
  expect((within(speech).getByLabelText("中文聲線") as HTMLSelectElement).value).toBe("alloy");
  fireEvent.click(screen.getByRole("button", { name: "儲存生成設定" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "設定已在其他視窗更新。請重新載入後再儲存。");
  expect(screen.getByRole("button", { name: "重新載入設定" })).toBeTruthy();
});

it("does not submit a provider without a configured credential", async () => {
  vi.mocked(req).mockResolvedValue({ ...response, availability: { google: true, openai: false } } as never);
  render(<GenerationSettings />);
  const text = await screen.findByRole("group", { name: "文字" });
  fireEvent.change(within(text).getByLabelText("供應商"), { target: { value: "openai" } });
  expect(within(text).getByRole("alert").textContent).toContain("尚未設定憑證");
  expect(screen.getByRole("button", { name: "儲存生成設定" }).hasAttribute("disabled")).toBe(true);
});
