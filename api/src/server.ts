// api 進入點：載入環境設定、建立 DB pool、LLM/TTS client 與 app，開始監聽。
import {
  loadConfig,
  createPool,
  createVertexAuthorizer,
  serviceAccountAuthorizer,
  GeminiExplainClient,
  GeminiTtsClient,
  loadImageModelCatalog,
  visualHash,
  getGenerationSettings,
  createExplainClient,
  createTtsClient,
  plannerForSelection,
} from "@el/shared";
import { buildApp } from "./app";
import { LookupLimiter } from "./rateLimit";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const imageCatalog = config.images.modelsFile ? loadImageModelCatalog(config.images.modelsFile, config.images.pricingFile) : null;

const auth = createVertexAuthorizer(config.gemini);
const googleAuth = auth ?? serviceAccountAuthorizer(config.gemini.project, config.gemini.location);
const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
const credentials = { googleAuth: auth, openaiApiKey: openaiApiKey === "dev-placeholder" ? undefined : openaiApiKey };
const availableModelIds = async () => {
  if (!imageCatalog) return [];
  const rows = (await pool.query("SELECT models FROM image_worker_heartbeats WHERE updated_at > now()-interval '60 seconds'")).rows;
  return imageCatalog.models.filter(m => rows.some(r => r.models.some((v: {id: string; hash: string}) => v.id === m.id && v.hash === visualHash(m)))).map(m => m.id);
};

const lookupLimiter = new LookupLimiter(config.lookupLimits);

const app = buildApp({
  config,
  pool,
  scenarios: { imageDir: config.images.directory, audioDir: config.audioDir },
  scenarioStudio: process.env.SCENARIO_STUDIO_DIR ? {
    studioDir: process.env.SCENARIO_STUDIO_DIR,
    imageDir: config.images.directory,
    audioDir: config.audioDir,
    catalog: imageCatalog ?? undefined,
    resolveSettings: async () => (await getGenerationSettings(pool)).settings,
    getAvailability: () => ({ google: Boolean(auth), openai: Boolean(credentials.openaiApiKey), localQwen: Boolean(process.env.SCENARIO_QWEN_TTS_URL) }),
  } : undefined,
  illustrations: imageCatalog ? {
    catalog: imageCatalog,
    imageDir: config.images.directory,
    availableModelIds,
    resolveCatalog: async () => {
      const { settings } = await getGenerationSettings(pool);
      return {
        ...imageCatalog,
        defaultModelId: settings.image.model,
        planner: plannerForSelection(imageCatalog.planner, settings.text, imageCatalog.plannerProfiles),
      };
    },
  } : undefined,
  generationSettings: imageCatalog ? {
    catalog: imageCatalog,
    availableModelIds,
    getAvailability: () => ({
      google: Boolean(auth),
      openai: Boolean(credentials.openaiApiKey),
    }),
  } : undefined,
  audioDir: config.audioDir,
  lookupLimiter,
  lookupDeps: {
    explainClient: new GeminiExplainClient({
      auth: googleAuth,
      model: config.gemini.explainModel,
    }),
    ttsClient: new GeminiTtsClient({ auth: googleAuth, model: config.gemini.ttsModel }),
    voiceEn: config.gemini.voiceEn,
    audioDir: config.audioDir,
    audioFormat: config.audioFormat,
    resolveGeneration: async () => {
      const { settings } = await getGenerationSettings(pool);
      return {
        explainClient: createExplainClient(settings.text, credentials),
        ttsClient: createTtsClient(settings.speech, credentials),
        voiceEn: settings.speech.voiceEn,
      };
    },
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
