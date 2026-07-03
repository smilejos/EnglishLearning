import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArticlePlayer } from "./useArticlePlayer";
import { _resetAudioBus } from "./lib/audioBus";

/** 可手動觸發事件的假 Audio。 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  preload = "";
  currentTime = 0;
  playbackRate = 1;
  duration = 10;
  private handlers = new Map<string, Set<() => void>>();
  constructor() {
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.handlers.get(type)?.delete(fn);
  }
  dispatch(type: string) {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn();
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}

const items = [
  { paragraphId: 11, url: "/audio/a/p0.wav" },
  { paragraphId: 22, url: "/audio/a/p1.wav" },
];

beforeEach(() => {
  FakeAudio.instances = [];
  _resetAudioBus();
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
});

describe("useArticlePlayer", () => {
  it("初始狀態：未播放、index -1、播放列不顯示", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    expect(result.current.playing).toBe(false);
    expect(result.current.index).toBe(-1);
    expect(result.current.active).toBe(false);
  });

  it("playParagraph 設定音源並開始播放", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.playParagraph(0));
    expect(result.current.playing).toBe(true);
    expect(result.current.currentParagraphId).toBe(11);
    // 主播放器是 hook render 期間第一個建立的 Audio（probe 於 effect 才建立）。
    expect(FakeAudio.instances[0].src).toBe("/audio/a/p0.wav");
  });

  it("連續播放：段落結束自動接下一段；最後一段結束即停止", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.playParagraph(0));
    const main = FakeAudio.instances[0];
    act(() => main.dispatch("ended"));
    expect(result.current.currentParagraphId).toBe(22);
    expect(result.current.playing).toBe(true);
    act(() => main.dispatch("ended"));
    expect(result.current.playing).toBe(false);
  });

  it("repeat 開啟時最後一段結束回到第一段", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.toggleRepeat());
    act(() => result.current.playParagraph(1));
    const main = FakeAudio.instances[0];
    act(() => main.dispatch("ended"));
    expect(result.current.currentParagraphId).toBe(11);
    expect(result.current.playing).toBe(true);
  });

  it("單段播放（continuous=false）結束即停，不接續", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.playParagraph(0, false));
    const main = FakeAudio.instances[0];
    act(() => main.dispatch("ended"));
    expect(result.current.playing).toBe(false);
    expect(result.current.currentParagraphId).toBe(11);
  });

  it("toggle：播放中暫停、暫停後續播；未播過則從第 0 段開始", () => {
    const { result } = renderHook(() => useArticlePlayer(items));
    act(() => result.current.toggle());
    expect(result.current.index).toBe(0);
    expect(result.current.playing).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
  });
});
