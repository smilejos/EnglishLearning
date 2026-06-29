import { describe, it, expect, afterEach } from "vitest";
import { createPool, ping } from "./db";
import type { Pool } from "pg";

const pools: Pool[] = [];

afterEach(async () => {
  while (pools.length) {
    await pools.pop()!.end().catch(() => {});
  }
});

describe("createPool", () => {
  it("回傳設定了 connectionString 的 Pool", () => {
    const pool = createPool("postgres://app:app@localhost:5432/english_learning");
    pools.push(pool);
    expect(pool.options.connectionString).toBe(
      "postgres://app:app@localhost:5432/english_learning",
    );
  });

  it("允許以 overrides 覆寫設定（如 max）", () => {
    const pool = createPool("postgres://app:app@localhost:5432/english_learning", {
      max: 3,
    });
    pools.push(pool);
    expect(pool.options.max).toBe(3);
  });
});

describe("ping", () => {
  it("以查詢回傳 1 判定連線健康", async () => {
    // 以最小 fake 取代真實連線：驗證 ping 對 SELECT 1 結果的判讀（state-based）。
    const fakePool = {
      query: async () => ({ rows: [{ ok: 1 }] }),
    } as unknown as Pool;
    expect(await ping(fakePool)).toBe(true);
  });
});
