// repo 層共用型別與 row → DTO 映射工具。
// 所有 repo 函式第一參數接受 `Queryable`（Pool 或交易中的 PoolClient），
// 便於依賴注入與在交易中重用。

import type { QueryResult, QueryResultRow } from "pg";

/** Pool 與 PoolClient 皆滿足此介面。 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

/** BIGINT 由 pg 預設以字串回傳，轉為 number（本平台規模內安全）。 */
export const toNum = (v: string | number): number =>
  typeof v === "number" ? v : Number(v);

export const toNumOrNull = (v: string | number | null): number | null =>
  v === null || v === undefined ? null : toNum(v);

/** timestamptz 由 pg 以 Date 回傳，DTO 統一為 ISO 字串。 */
export const toIso = (v: Date | string): string =>
  v instanceof Date ? v.toISOString() : v;
