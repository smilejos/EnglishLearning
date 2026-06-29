import { Client } from "pg";
import { writeFile } from "node:fs/promises";

const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS ?? 5000);
const DATABASE_URL = process.env.DATABASE_URL;
// worker 沒有 HTTP 端點，改以「定期更新的 heartbeat 檔」供容器 healthcheck 判斷存活。
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";

async function checkDb(): Promise<string> {
  if (!DATABASE_URL) return "no DATABASE_URL set";
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return "db ok";
  } catch (err) {
    return `db error: ${(err as Error).message}`;
  } finally {
    await client.end().catch(() => {});
  }
}

async function touchHeartbeat(): Promise<void> {
  try {
    await writeFile(HEARTBEAT_FILE, new Date().toISOString());
  } catch (err) {
    console.error(`[worker] failed to write heartbeat file: ${(err as Error).message}`);
  }
}

async function tick(): Promise<void> {
  const db = await checkDb();
  await touchHeartbeat();
  console.log(`[worker] heartbeat ${new Date().toISOString()} — ${db}`);
}

console.log("[worker] starting (skeleton) — job processing lands in Phase 5");
await tick();
setInterval(() => {
  void tick();
}, HEARTBEAT_MS);
