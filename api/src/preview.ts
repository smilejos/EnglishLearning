// 本機介面驗收用 API：不注入 LLM／TTS，沿用現有身分與權限檢查。
import { createPool, loadConfig } from "@el/shared";
import { buildApp } from "./app";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = buildApp({ config, pool, audioDir: config.audioDir, logger: true });
const close = async () => { await app.close(); await pool.end(); };
process.once("SIGINT", () => { void close(); });
process.once("SIGTERM", () => { void close(); });
app.listen({ port: Number(process.env.API_PORT ?? 8180), host: "127.0.0.1" }).catch(async (error) => {
  app.log.error(error); await close(); process.exitCode = 1;
});
