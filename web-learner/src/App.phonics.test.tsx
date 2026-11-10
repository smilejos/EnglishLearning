import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import * as api from "./api";

const phonicsCleanup = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ getMe: vi.fn() }));
vi.mock("./PhonicsLearning", () => ({
  PhonicsLearning({ lessonOpen, lessonId, chapterId }: { lessonOpen: boolean; lessonId?: string; chapterId?: string }) {
    useEffect(() => () => phonicsCleanup(), []);
    return <main><h1>{lessonOpen ? "自然發音課程測試" : chapterId ? "自然發音章節測試" : "自然發音總覽測試"}</h1>{lessonOpen && <p>課程：{lessonId}</p>}{chapterId && <p>章節：{chapterId}</p>}</main>;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "#");
  vi.mocked(api.getMe).mockResolvedValue({ user: null });
});
afterEach(cleanup);

async function navigate(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

describe("自然發音入口導航", () => {

  it.each([
    ["short-vowels", "short-a"], ["long-vowels", "long-a"],
    ["blends", "blends-l"], ["digraphs", "digraph-sh"], ["r-controlled", "r-ar"], ["endings", "endings-s"],
  ])("可直接開啟 %s 章節，切換小課及返回時卸載舊頁", async (chapterId, firstLesson) => {
    window.history.replaceState(null, "", `#/phonics/${chapterId}`);
    render(<App />);
    expect(screen.getByRole("heading", { name: "自然發音章節測試" })).toBeTruthy();
    expect(screen.getByText(`章節：${chapterId}`)).toBeTruthy();
    await navigate(`#/phonics/${firstLesson}`);
    expect(screen.getByText(`課程：${firstLesson}`)).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(1);
    await navigate(`#/phonics/${chapterId}`);
    expect(screen.getByText(`章節：${chapterId}`)).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(2);
    await navigate("#/phonics");
    expect(screen.getByRole("heading", { name: "自然發音總覽測試" })).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(3);
    await navigate(`#/phonics/${chapterId === "short-vowels" ? "long-vowels" : "short-vowels"}`);
    expect(screen.getByRole("heading", { name: "自然發音章節測試" })).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(4);
  });

  it("首頁第四入口開總覽，課程與總覽切換會卸載舊頁，品牌可返回首頁", async () => {
    render(<App />);
    expect(screen.getByRole("link", { name: /自然發音/ }).getAttribute("href")).toBe("#/phonics");
    await navigate("#/phonics");
    expect(screen.getByRole("heading", { name: "自然發音總覽測試" })).toBeTruthy();
    expect(api.getMe).toHaveBeenCalledTimes(1);
    await navigate("#/phonics/short-a");
    expect(screen.getByRole("heading", { name: "自然發音課程測試" })).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(1);
    await navigate("#/phonics");
    expect(screen.getByRole("heading", { name: "自然發音總覽測試" })).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "回首頁" }));
    await act(async () => { window.dispatchEvent(new Event("hashchange")); });
    expect(screen.getByRole("heading", { name: "今天，想怎麼練習英文？" })).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(3);
  });

  it("五個短母音可直接開啟，切課會卸載舊課與其音訊", async () => {
    window.history.replaceState(null, "", "#/phonics/short-a");
    render(<App />);
    for (const [index, vowel] of ["a", "e", "i", "o", "u"].entries()) {
      await navigate(`#/phonics/short-${vowel}`);
      expect(screen.getByText(`課程：short-${vowel}`)).toBeTruthy();
      expect(phonicsCleanup).toHaveBeenCalledTimes(index);
    }
  });

  it("五個長母音可直接開啟，切課卸載舊課", async () => {
    window.history.replaceState(null, "", "#/phonics/long-a");
    render(<App />);
    for (const [index, vowel] of ["a", "e", "i", "o", "u"].entries()) {
      await navigate(`#/phonics/long-${vowel}`);
      expect(screen.getByText(`課程：long-${vowel}`)).toBeTruthy();
      expect(phonicsCleanup).toHaveBeenCalledTimes(index);
    }
  });

  it("直接開啟短母音課程的網址會進入課程", async () => {
    window.history.replaceState(null, "", "#/phonics/short-a");
    render(<App />);
    expect(screen.getByRole("heading", { name: "自然發音課程測試" })).toBeTruthy();
    await act(async () => {});
  });
});


it("第三至五章十五個小課可直接開啟，逐課切換卸載舊播放", async () => {
  const lessonIds = ["blends-l", "blends-r", "blends-s", "blends-final", "blends-three",
    "digraph-sh", "digraph-ch", "digraph-th-voiceless", "digraph-th-voiced", "digraph-wh", "digraph-ph", "digraph-tch",
    "r-ar", "r-or", "r-ore-oar"];
  window.history.replaceState(null, "", `#/phonics/${lessonIds[0]}`);
  render(<App />);
  for (const [index, id] of lessonIds.entries()) {
    await navigate(`#/phonics/${id}`);
    expect(screen.getByText(`課程：${id}`)).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(index);
  }
});


it("字尾變化四課可直接開啟，切課卸載舊播放", async () => {
  const ids = ["endings-s", "endings-es", "endings-ed", "endings-ing"];
  window.history.replaceState(null, "", `#/phonics/${ids[0]}`);
  render(<App />);
  for (const [index, id] of ids.entries()) {
    await navigate(`#/phonics/${id}`);
    expect(screen.getByText(`課程：${id}`)).toBeTruthy();
    expect(phonicsCleanup).toHaveBeenCalledTimes(index);
  }
});
