// 明確指定 DATABASE_URL 後才可匯入；不讀 .env，也不預設連正式庫。
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool, importWordbankEntries, parseWordbankDocument } from "@el/shared";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filename = args.find((arg) => !arg.startsWith("--")) ?? fileURLToPath(new URL("../source/vocabulary-database.json", import.meta.url));
  for (const arg of args) if (arg.startsWith("--") && arg !== "--dry-run") throw new Error(`未知參數：${arg}`);
  const entries = parseWordbankDocument(JSON.parse(await readFile(filename, "utf8")));
  console.log(`字庫檢查：${entries.length} 字，basic ${entries.filter((entry) => entry.level.list === "basic").length} 字；缺中文定義 ${entries.filter((entry) => !entry.definition.trim()).length} 字，缺英文解釋 ${entries.filter((entry) => !entry.explains.length).length} 字。`);
  if (dryRun) { console.log("僅檢查檔案，未連線或寫入資料庫。"); return; }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("請明確指定 DATABASE_URL；正式庫匯入須先取得使用者確認。可先加 --dry-run 檢查資料。");
  const target = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.pathname.replace(/^\//, "")) throw new Error("DATABASE_URL 必須指定 PostgreSQL 資料庫名稱");
  const pool = createPool(databaseUrl);
  try {
    const identity = await pool.query<{ database: string; address: string; port: number }>(`SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port`);
    const actual = identity.rows[0];
    console.log(`匯入目標：${target.hostname}:${target.port || "5432"}/${decodeURIComponent(target.pathname.slice(1))}；伺服器 ${actual.address}:${actual.port}/${actual.database}`);
    const result = await importWordbankEntries(pool, entries);
    console.log(`匯入完成：新增 ${result.inserted} 字，既有 ${result.existing} 字（僅補缺、不刪字）。`);
  } finally { await pool.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
