// POST /lookups 的用量韁繩（in-memory）：per-user 每分鐘 + 全站每日雙上限。
// 單一 api 行程內有效；行程重啟即歸零（家用規模可接受，見設計文件 §6 Phase 1.2）。

export type LimitScope = "user" | "global";

export interface LookupLimiterOpts {
  userPerMin: number;
  globalPerDay: number;
  /** 注入時鐘（測試用），預設系統時間。 */
  now?: () => Date;
}

export class LookupLimiter {
  private windows = new Map<number, { start: number; count: number }>();
  private dayKey = "";
  private dayCount = 0;

  constructor(private opts: LookupLimiterOpts) {}

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  /** 以伺服器本地日期為界的跨日重置。 */
  private rollDay(): void {
    const d = this.now();
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayCount = 0;
      this.windows.clear();
    }
  }

  /**
   * 嘗試取得一次 LLM 查詢額度。
   * @returns null = 放行（已登記本次用量）；否則回超限範圍。
   */
  tryAcquire(userId: number): LimitScope | null {
    this.rollDay();
    if (this.dayCount >= this.opts.globalPerDay) return "global";
    const nowMs = this.now().getTime();
    const w = this.windows.get(userId);
    if (!w || nowMs - w.start >= 60_000) {
      this.windows.set(userId, { start: nowMs, count: 0 });
    }
    const cur = this.windows.get(userId)!;
    if (cur.count >= this.opts.userPerMin) return "user";
    cur.count += 1;
    this.dayCount += 1;
    return null;
  }

  /** 今日已放行的 LLM 查詢數（/stats 用）。 */
  todayCount(): number {
    this.rollDay();
    return this.dayCount;
  }

  get limits(): { userPerMin: number; globalPerDay: number } {
    return {
      userPerMin: this.opts.userPerMin,
      globalPerDay: this.opts.globalPerDay,
    };
  }
}
