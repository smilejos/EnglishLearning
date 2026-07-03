// 型別化的環境設定載入器。
// 單一事實來源為 `.env.example`；此處負責讀取、驗證與提供型別化的 config。
// 任何服務（api / worker）都應透過 `loadConfig()` 取得設定，而非直接讀 process.env。

export interface GeminiConfig {
  /** API key（與 credentialsPath 至少擇一）。 */
  apiKey?: string;
  /** Service account 憑證路徑（與 apiKey 至少擇一）。 */
  credentialsPath?: string;
  ttsModel: string;
  translateModel: string;
  explainModel: string;
  /** 英文語音 voice（不寫死，必填）。 */
  voiceEn: string;
  /** 中文語音 voice（不寫死，必填）。 */
  voiceZh: string;
}

export interface CfAccessConfig {
  teamDomain: string;
  aud: string;
}

export interface LookupLimitsConfig {
  /** 每位使用者每分鐘可觸發的 LLM 查詢數。 */
  userPerMin: number;
  /** 全站每日可觸發的 LLM 查詢數。 */
  globalPerDay: number;
}

export interface Config {
  databaseUrl: string;
  audioDir: string;
  gemini: GeminiConfig;
  /** 啟用 dev 繞過時為 null；正式環境必須設定。 */
  cfAccess: CfAccessConfig | null;
  devAuthBypass: boolean;
  /** 僅在 devAuthBypass 時使用的假身分 email。 */
  devUserEmail: string;
  /** admin 角色允許清單（email，小寫）；命中者於登入時授予 admin（設計 §9.6 app 內 allowlist）。 */
  adminEmails: string[];
  /** POST /lookups 快取未命中的用量韁繩（設計文件 §6 Phase 1.2）。 */
  lookupLimits: LookupLimitsConfig;
  /** 新產出音檔格式：m4a（AAC，預設）或 wav；既有音檔不受影響。 */
  audioFormat: "m4a" | "wav";
}

/** 預設值（與 `.env.example` 一致），缺漏時採用。 */
const DEFAULTS = {
  audioDir: "/data/audio",
  ttsModel: "gemini-2.5-flash-preview-tts",
  translateModel: "gemini-2.5-flash",
  explainModel: "gemini-2.5-flash",
  devUserEmail: "dev@example.com",
} as const;

type Env = Record<string, string | undefined>;

function trimmed(env: Env, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function intEnv(env: Env, key: string, dflt: number, errors: string[]): number {
  const raw = trimmed(env, key);
  if (raw === undefined) return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`${key} must be a non-negative integer`);
    return dflt;
  }
  return n;
}

/**
 * 從環境變數讀取並驗證設定。
 * 缺少任何必填變數時，丟出列出所有缺漏項的明確錯誤（一次回報全部）。
 */
export function loadConfig(env: Env = process.env): Config {
  const errors: string[] = [];

  const databaseUrl = trimmed(env, "DATABASE_URL");
  if (!databaseUrl) errors.push("DATABASE_URL is required");

  const apiKey = trimmed(env, "GEMINI_API_KEY");
  const credentialsPath = trimmed(env, "GOOGLE_APPLICATION_CREDENTIALS");
  if (!apiKey && !credentialsPath) {
    errors.push(
      "one of GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS is required",
    );
  }

  const voiceEn = trimmed(env, "GEMINI_TTS_VOICE_EN");
  if (!voiceEn) errors.push("GEMINI_TTS_VOICE_EN is required");

  const voiceZh = trimmed(env, "GEMINI_TTS_VOICE_ZH");
  if (!voiceZh) errors.push("GEMINI_TTS_VOICE_ZH is required");

  const devAuthBypass = isTruthy(trimmed(env, "DEV_AUTH_BYPASS"));

  const cfTeamDomain = trimmed(env, "CF_ACCESS_TEAM_DOMAIN");
  const cfAud = trimmed(env, "CF_ACCESS_AUD");
  let cfAccess: CfAccessConfig | null = null;
  if (!devAuthBypass) {
    if (!cfTeamDomain) {
      errors.push("CF_ACCESS_TEAM_DOMAIN is required (unless DEV_AUTH_BYPASS=1)");
    }
    if (!cfAud) {
      errors.push("CF_ACCESS_AUD is required (unless DEV_AUTH_BYPASS=1)");
    }
    if (cfTeamDomain && cfAud) {
      cfAccess = { teamDomain: cfTeamDomain, aud: cfAud };
    }
  } else if (cfTeamDomain && cfAud) {
    // 即使繞過驗證，若兩者都有也一併帶上，方便混合測試。
    cfAccess = { teamDomain: cfTeamDomain, aud: cfAud };
  }

  const lookupLimits: LookupLimitsConfig = {
    userPerMin: intEnv(env, "LOOKUP_USER_PER_MIN", 10, errors),
    globalPerDay: intEnv(env, "LOOKUP_GLOBAL_PER_DAY", 200, errors),
  };

  const audioFormatRaw = trimmed(env, "AUDIO_FORMAT") ?? "m4a";
  if (audioFormatRaw !== "m4a" && audioFormatRaw !== "wav") {
    errors.push("AUDIO_FORMAT must be 'm4a' or 'wav'");
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join("\n  - ")}`,
    );
  }

  return {
    databaseUrl: databaseUrl!,
    audioDir: trimmed(env, "AUDIO_DIR") ?? DEFAULTS.audioDir,
    gemini: {
      apiKey,
      credentialsPath,
      ttsModel: trimmed(env, "GEMINI_TTS_MODEL") ?? DEFAULTS.ttsModel,
      translateModel:
        trimmed(env, "GEMINI_TRANSLATE_MODEL") ?? DEFAULTS.translateModel,
      explainModel: trimmed(env, "GEMINI_EXPLAIN_MODEL") ?? DEFAULTS.explainModel,
      voiceEn: voiceEn!,
      voiceZh: voiceZh!,
    },
    cfAccess,
    devAuthBypass,
    devUserEmail: trimmed(env, "DEV_USER_EMAIL") ?? DEFAULTS.devUserEmail,
    adminEmails: parseEmailList(trimmed(env, "ADMIN_EMAILS")),
    lookupLimits,
    audioFormat: audioFormatRaw as "m4a" | "wav",
  };
}

/** 解析逗號分隔的 email 清單，去空白並轉小寫。 */
function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
}
