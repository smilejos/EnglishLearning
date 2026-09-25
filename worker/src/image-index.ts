import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  loadConfig,
  loadImageModelCatalog,
  createPool,
  apiKeyAuthorizer,
  serviceAccountAuthorizer,
  OpenAIImageAdapter,
  GeminiImageAdapter,
  GeminiVisualPlanner,
  LocalImageStorage,
  processImageJob,
  recoverImageJobs,
  cleanupImageFiles,
  visualHash,
  type ImageAdapter,
} from "@el/shared";

const config = loadConfig();
const catalog = loadImageModelCatalog(
  config.images.modelsFile ?? "/app/config/image-models.json",
  config.images.pricingFile,
);
const key = process.env.OPENAI_API_KEY_FILE
  ? readFileSync(process.env.OPENAI_API_KEY_FILE, "utf8").trim()
  : process.env.OPENAI_API_KEY?.trim();
const auth = config.gemini.apiKey
  ? apiKeyAuthorizer(config.gemini.apiKey)
  : serviceAccountAuthorizer();
const adapters: Record<string, ImageAdapter> = {};
if (key && key !== "dev-placeholder")
  adapters["openai-images-v1"] = new OpenAIImageAdapter(key);
if (
  (config.gemini.apiKey && config.gemini.apiKey !== "dev-placeholder") ||
  config.gemini.credentialsPath
)
  adapters["gemini-generate-content-v1beta"] = new GeminiImageAdapter(auth);
const enabled = catalog.models.filter((m) => m.enabled);
const missing = enabled.filter((m) => !adapters[m.adapter]);
if (!adapters["gemini-generate-content-v1beta"])
  throw new Error(
    "Gemini planner requires a real API key or service-account credentials",
  );
if (missing.length)
  throw new Error(
    `Missing image-worker credentials for enabled models: ${missing.map((m) => m.id).join(", ")}. Configure credentials or disable those catalog entries.`,
  );
const pool = createPool(config.databaseUrl);
const storage = new LocalImageStorage(config.images.directory, pool);
const deps = {
  pool,
  storage,
  adapters,
  planner: new GeminiVisualPlanner(auth),
};
const workerId = randomUUID();
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
const announce = () =>
  pool.query(
    "INSERT INTO image_worker_heartbeats(id,models) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET models=excluded.models,updated_at=now()",
    [
      workerId,
      JSON.stringify(enabled.map((m) => ({ id: m.id, hash: visualHash(m) }))),
    ],
  );
await announce();
const heartbeat = setInterval(() => {
  void announce().catch(() => console.error("image-worker heartbeat failed"));
}, 15000);
try {
  while (!stopped) {
    try {
      await recoverImageJobs(pool);
      await cleanupImageFiles(pool, storage);
      if (!(await processImageJob(deps)))
        await new Promise((r) => setTimeout(r, 3000));
    } catch {
      console.error(
        "image-worker tick failed; pending attempts will be recovered conservatively",
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
} finally {
  clearInterval(heartbeat);
  await pool.query("DELETE FROM image_worker_heartbeats WHERE id=$1", [
    workerId,
  ]);
  await pool.end();
}
