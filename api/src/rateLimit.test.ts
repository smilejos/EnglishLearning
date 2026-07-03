import { describe, it, expect } from "vitest";
import { LookupLimiter } from "./rateLimit";

/** 可推進的假時鐘。 */
function clockAt(iso: string) {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("LookupLimiter", () => {
  it("per-user 每分鐘上限：超過回 user，滿一分鐘後重置", () => {
    const c = clockAt("2026-07-04T10:00:00Z");
    const l = new LookupLimiter({ userPerMin: 2, globalPerDay: 100, now: c.now });
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(1)).toBe("user");
    c.advance(60_000);
    expect(l.tryAcquire(1)).toBeNull();
  });

  it("不同使用者的分鐘窗各自獨立", () => {
    const c = clockAt("2026-07-04T10:00:00Z");
    const l = new LookupLimiter({ userPerMin: 1, globalPerDay: 100, now: c.now });
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(1)).toBe("user");
    expect(l.tryAcquire(2)).toBeNull();
  });

  it("全站每日上限：達上限回 global；跨日重置", () => {
    const c = clockAt("2026-07-04T10:00:00Z");
    const l = new LookupLimiter({ userPerMin: 100, globalPerDay: 2, now: c.now });
    expect(l.tryAcquire(1)).toBeNull();
    expect(l.tryAcquire(2)).toBeNull();
    expect(l.tryAcquire(3)).toBe("global");
    expect(l.todayCount()).toBe(2);
    c.advance(24 * 60 * 60 * 1000);
    expect(l.tryAcquire(3)).toBeNull();
    expect(l.todayCount()).toBe(1);
  });
});
