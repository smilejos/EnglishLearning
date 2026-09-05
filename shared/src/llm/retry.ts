// LLM 呼叫的共用重試策略（原位於 tts.ts，抽出供 translate／explainWord 共用）。
// 指數退避 + 配額錯誤快速失敗：429／RESOURCE_EXHAUSTED 在一輪內不會恢復，
// 重試只是白花時間與配額，直接讓上層（worker 的 job 退避）接手。

export interface RetryOpts {
  retries: number;
  baseDelayMs: number;
}

/** 配額／速率限制錯誤在一輪內不會恢復，不浪費重試。 */
export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const s = `${e?.status ?? ""} ${e?.message ?? ""}`;
  return s.includes("429") || s.includes("RESOURCE_EXHAUSTED");
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isQuotaError(err)) throw err; // 配額錯誤快速失敗，重試無益
      if (attempt < opts.retries) {
        const delay = opts.baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
