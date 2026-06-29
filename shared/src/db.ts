// 可重用的 PostgreSQL 連線模組（pg Pool）。
// 各服務（api / worker）在啟動時建立一個 Pool 並傳遞給 repo 層使用，
// 不在模組層持有全域單例，便於測試與明確的生命週期管理。

import { Pool } from "pg";
import type { PoolConfig, PoolClient } from "pg";

/** pg Pool 的對外型別別名，讓服務不必直接 import pg。 */
export type DbPool = Pool;

/**
 * 以連線字串建立 Pool。
 * @param connectionString 例如 `postgres://app:app@db:5432/english_learning`
 * @param overrides 額外的 pg PoolConfig（如 `max`、`idleTimeoutMillis`）。
 */
export function createPool(
  connectionString: string,
  overrides?: PoolConfig,
): Pool {
  const pool = new Pool({ connectionString, ...overrides });
  // pg 會在閒置 client 發生錯誤時於 Pool 觸發 'error'（例如 db 重啟、連線被中斷）。
  // 未掛處理器會讓未處理的 'error' 事件使整個行程崩潰；此處記錄並吞掉，
  // 由後續查詢自動重新取得連線。
  pool.on("error", (err) => {
    console.error(`[db] idle client error: ${err.message}`);
  });
  return pool;
}

/** 連線健康檢查：執行 `SELECT 1`，成功回 true。 */
export async function ping(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

/**
 * 在單一交易中執行 fn：BEGIN → fn(client) → COMMIT；
 * 拋錯則 ROLLBACK 後重拋。client 滿足 Queryable，可直接傳給 repo 函式。
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
