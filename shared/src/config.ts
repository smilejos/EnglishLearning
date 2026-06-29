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

export interface Config {
  databaseUrl: string;
  audioDir: string;
  gemini: GeminiConfig;
  /** 啟用 dev 繞過時為 null；正式環境必須設定。 */
  cfAccess: CfAccessConfig | null;
  devAuthBypass: boolean;
  /** 僅在 devAuthBypass 時使用的假身分 email。 */
  devUserEmail: string;
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
  };
}
