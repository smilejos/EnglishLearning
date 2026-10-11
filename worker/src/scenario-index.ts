// 情境製作獨立入口：只執行管理者逐步建立的 studio jobs，不接文章／文章插圖佇列。
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  loadConfig, createPool, createVertexAuthorizer, loadImageModelCatalog,
  createScenarioStudioProviders, processScenarioStudioJob, recoverStudioJobs, announceStudioWorker,
  StudioProviderError,
} from "@el/shared";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const googleAuth = createVertexAuthorizer(config.gemini);
const rawKey = process.env.OPENAI_API_KEY_FILE ? (await readFile(process.env.OPENAI_API_KEY_FILE, "utf8")).trim() : process.env.OPENAI_API_KEY?.trim();
const openaiApiKey = rawKey && rawKey !== "dev-placeholder" ? rawKey : undefined;
const qwenEndpoint = process.env.SCENARIO_QWEN_TTS_URL?.trim();
const studioDir = process.env.SCENARIO_STUDIO_DIR?.trim();
if (!studioDir) throw new Error("SCENARIO_STUDIO_DIR 未設定");
await mkdir(studioDir, { recursive: true });
const configuredProviders = createScenarioStudioProviders({ googleAuth, openaiApiKey, qwenEndpoint: qwenEndpoint || "http://127.0.0.1:8000/v1/audio/speech" });
const providers = { ...configuredProviders, speech: qwenEndpoint ? configuredProviders.speech : async () => { throw new StudioProviderError("本機 Qwen TTS 未設定", false); } };
const catalog = loadImageModelCatalog(config.images.modelsFile ?? "/app/config/image-models.json", config.images.pricingFile);
const workerId = randomUUID();
const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/scenario-worker-heartbeat";
const capabilities = { text: Boolean(googleAuth || openaiApiKey), imageModelKeys: catalog.models.filter(m => m.enabled && (m.provider === "openai" ? Boolean(openaiApiKey) : Boolean(googleAuth))).map(m => m.id), speech: Boolean(qwenEndpoint), finalize: true };
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
const announce = async () => {
  await announceStudioWorker(pool, workerId, capabilities);
  await writeFile(heartbeatFile, new Date().toISOString());
};
await announce();
// 獨立heartbeat不等待生圖／整段TTS，長工作不會讓healthcheck誤報。
const heartbeat = setInterval(() => { void announce().catch(() => console.error("情境 worker heartbeat 失敗")); }, 15_000);
try {
  while (!stopped) {
    try {
      await recoverStudioJobs(pool);
      if (!await processScenarioStudioJob({ pool, providers, studioDir, imageDir: config.images.directory, audioDir: config.audioDir })) await new Promise(resolve => setTimeout(resolve, 1500));
    } catch {
      // 不在錯誤日誌輸出內容、憑證或原始provider response；expired租約由保守recover處理。
      console.error("情境 worker 本輪失敗；未確認工作不會自動重送");
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
} finally {
  clearInterval(heartbeat);
  await pool.query("DELETE FROM scenario_studio_worker_heartbeats WHERE id=$1", [workerId]).catch(() => {});
  await pool.end();
}
