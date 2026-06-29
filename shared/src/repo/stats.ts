// 平台統計（admin 觀測用）：各表依狀態的計數與總量。
import type { Status } from "../schemas";
import { type Queryable, toNum } from "./types";

export interface Stats {
  articles: Record<Status, number>;
  paragraphs: Record<Status, number>;
  jobs: Record<Status, number>;
  words: number;
  explanations: number;
}

function emptyCounts(): Record<Status, number> {
  return { pending: 0, processing: 0, done: 0, failed: 0 };
}

async function countByStatus(
  db: Queryable,
  table: "articles" | "paragraphs" | "jobs",
): Promise<Record<Status, number>> {
  // table 為固定字面值（非使用者輸入），無注入風險。
  const res = await db.query<{ status: Status; n: number }>(
    `SELECT status, count(*)::int AS n FROM ${table} GROUP BY status`,
  );
  const counts = emptyCounts();
  for (const row of res.rows) counts[row.status] = row.n;
  return counts;
}

async function total(
  db: Queryable,
  table: "words" | "word_explanations",
): Promise<number> {
  const res = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table}`,
  );
  return toNum(res.rows[0]?.n ?? 0);
}

export async function getStats(db: Queryable): Promise<Stats> {
  const [articles, paragraphs, jobs, words, explanations] = await Promise.all([
    countByStatus(db, "articles"),
    countByStatus(db, "paragraphs"),
    countByStatus(db, "jobs"),
    total(db, "words"),
    total(db, "word_explanations"),
  ]);
  return { articles, paragraphs, jobs, words, explanations };
}
