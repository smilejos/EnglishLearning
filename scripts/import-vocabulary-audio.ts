import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool, importWordbankAudioManifest, parseWordbankDocument, validateWordbankAudioManifest, WordbankAudioManifestSchema } from "@el/shared";

async function main() {
  const args = process.argv.slice(2);
  for (const arg of args) if (arg.startsWith("--") && arg !== "--dry-run") throw new Error(`未知參數：${arg}`);
  const path = args.find((arg) => !arg.startsWith("--")) ?? fileURLToPath(new URL("../data/wordbank-audio/manifest.json", import.meta.url));
  const manifest = WordbankAudioManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (args.includes("--dry-run")) {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../source/vocabulary-database.json", import.meta.url), "utf8")));
    validateWordbankAudioManifest(manifest, source);
    console.log(`音檔清單檢查通過：${manifest.entries.length} 段；已核對來源 JSON 的 GUID 與 textHash，未連線或寫入資料庫。`);
    return;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("請明確指定 DATABASE_URL；正式庫寫入音檔 metadata 須先取得使用者確認。");
  const target = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.pathname.replace(/^\//, "")) throw new Error("DATABASE_URL 必須指定 PostgreSQL 資料庫名稱");
  const pool = createPool(databaseUrl);
  try {
    const identity = await pool.query(`SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port`);
    const actual = identity.rows[0];
    console.log(`音檔 metadata 目標：${target.hostname}:${target.port || "5432"}/${decodeURIComponent(target.pathname.slice(1))}；伺服器 ${actual.address}:${actual.port}/${actual.database}`);
    const count = await importWordbankAudioManifest(pool, manifest);
    console.log(`音檔 metadata 匯入完成：${count} 段；未複製或生成音檔。`);
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
