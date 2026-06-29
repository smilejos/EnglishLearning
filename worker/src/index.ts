// worker 進入點：輪詢佇列、逐段處理（翻譯 + 中英 TTS），並維持 heartbeat 檔
// 供容器 healthcheck 判斷存活。
import { writeFile } from "node:fs/promises";
import {
  loadConfig,
  createPool,
  apiKeyAuthorizer,
  serviceAccountAuthorizer,
  GeminiTranslateClient,
  GeminiTtsClient,
} from "@el/shared";
import { drainQueue, type WorkerDeps } from "./processor";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000);
const HEARTBEAT_FILE =
  process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const auth = config.gemini.apiKey
  ? apiKeyAuthorizer(config.gemini.apiKey)
  : serviceAccountAuthorizer();

const deps: WorkerDeps = {
  pool,
  translateClient: new GeminiTranslateClient({
    auth,
    model: config.gemini.translateModel,
  }),
  ttsClient: new GeminiTtsClient({ auth, model: config.gemini.ttsModel }),
  voiceEn: config.gemini.voiceEn,
  voiceZh: config.gemini.voiceZh,
  audioDir: config.audioDir,
};

async function touchHeartbeat(): Promise<void> {
  try {
    await writeFile(HEARTBEAT_FILE, new Date().toISOString());
  } catch (err) {
    console.error(
      `[worker] failed to write heartbeat file: ${(err as Error).message}`,
    );
  }
}

async function tick(): Promise<void> {
  try {
    const processed = await drainQueue(deps);
    if (processed > 0) console.log(`[worker] processed ${processed} job(s)`);
  } catch (err) {
    console.error(`[worker] tick error: ${(err as Error).message}`);
  }
  await touchHeartbeat();
}

console.log("[worker] starting — polling for paragraph jobs");
await tick();
setInterval(() => {
  void tick();
}, POLL_MS);
