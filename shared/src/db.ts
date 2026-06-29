// 可重用的 PostgreSQL 連線模組（pg Pool）。
// 各服務（api / worker）在啟動時建立一個 Pool 並傳遞給 repo 層使用，
// 不在模組層持有全域單例，便於測試與明確的生命週期管理。

import { Pool } from "pg";
import type { PoolConfig } from "pg";

/**
 * 以連線字串建立 Pool。
 * @param connectionString 例如 `postgres://app:app@db:5432/english_learning`
 * @param overrides 額外的 pg PoolConfig（如 `max`、`idleTimeoutMillis`）。
 */
export function createPool(
  connectionString: string,
  overrides?: PoolConfig,
): Pool {
  return new Pool({ connectionString, ...overrides });
}

/** 連線健康檢查：執行 `SELECT 1`，成功回 true。 */
export async function ping(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
