// api 進入點：載入環境設定、建立 DB pool、LLM/TTS client 與 app，開始監聽。
import {
  loadConfig,
  createPool,
  apiKeyAuthorizer,
  serviceAccountAuthorizer,
  GeminiExplainClient,
  GeminiTtsClient,
  loadImageModelCatalog,
  visualHash,
} from "@el/shared";
import { buildApp } from "./app";
import { LookupLimiter } from "./rateLimit";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const imageCatalog = config.images.modelsFile ? loadImageModelCatalog(config.images.modelsFile, config.images.pricingFile) : null;

// LLM 授權：優先用 API key，否則用 service account（兩者擇一已於 config 驗證）。
const auth = config.gemini.apiKey
  ? apiKeyAuthorizer(config.gemini.apiKey)
  : serviceAccountAuthorizer();

const lookupLimiter = new LookupLimiter(config.lookupLimits);

const app = buildApp({
  config,
  pool,
  illustrations: imageCatalog ? {
    catalog: imageCatalog,
    imageDir: config.images.directory,
    availableModelIds: async () => {
      const rows = (await pool.query("SELECT models FROM image_worker_heartbeats WHERE updated_at > now()-interval '60 seconds'")).rows;
      return imageCatalog.models.filter(m => rows.some(r => r.models.some((v: {id: string; hash: string}) => v.id === m.id && v.hash === visualHash(m)))).map(m => m.id);
    },
  } : undefined,
  audioDir: config.audioDir,
  lookupLimiter,
  lookupDeps: {
    explainClient: new GeminiExplainClient({
      auth,
      model: config.gemini.explainModel,
    }),
    ttsClient: new GeminiTtsClient({ auth, model: config.gemini.ttsModel }),
    voiceEn: config.gemini.voiceEn,
    audioDir: config.audioDir,
    audioFormat: config.audioFormat,
  },
  logger: true,
});

const port = Number(process.env.API_PORT ?? 8080);
const host = "0.0.0.0";

app
  .listen({ port, host })
  .then((addr) => app.log.info(`api listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
