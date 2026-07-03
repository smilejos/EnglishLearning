import { describe, it, expect, vi, beforeEach } from "vitest";
import { claimAudio, releaseAudio, _resetAudioBus } from "./audioBus";

beforeEach(_resetAudioBus);

describe("audioBus", () => {
  it("新的 claim 停止前一個持有者", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimAudio(stopA);
    claimAudio(stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
  });

  it("同一持有者重複 claim 不自我停止", () => {
    const stop = vi.fn();
    claimAudio(stop);
    claimAudio(stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it("release 後再 claim 不會觸發已釋放的 stopper", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimAudio(stopA);
    releaseAudio(stopA);
    claimAudio(stopB);
    expect(stopA).not.toHaveBeenCalled();
  });
});
