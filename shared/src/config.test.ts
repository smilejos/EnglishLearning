import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

/** 一組齊全且合法的環境變數。 */
function fullEnv(): Record<string, string> {
  return {
    DATABASE_URL: "postgres://app:app@db:5432/english_learning",
    AUDIO_DIR: "/data/audio",
    GEMINI_API_KEY: "test-key",
    GEMINI_TTS_MODEL: "tts-model",
    GEMINI_TRANSLATE_MODEL: "translate-model",
    GEMINI_EXPLAIN_MODEL: "explain-model",
    GEMINI_TTS_VOICE_EN: "VoiceEn",
    GEMINI_TTS_VOICE_ZH: "VoiceZh",
    CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    CF_ACCESS_AUD: "aud-tag",
    DEV_AUTH_BYPASS: "0",
    DEV_USER_EMAIL: "dev@example.com",
  };
}

describe("loadConfig", () => {
  it("齊全時回傳正確型別與結構", () => {
    const cfg = loadConfig(fullEnv());
    expect(cfg.databaseUrl).toBe("postgres://app:app@db:5432/english_learning");
    expect(cfg.audioDir).toBe("/data/audio");
    expect(cfg.gemini).toMatchObject({
      apiKey: "test-key",
      ttsModel: "tts-model",
      translateModel: "translate-model",
      explainModel: "explain-model",
      voiceEn: "VoiceEn",
      voiceZh: "VoiceZh",
    });
    expect(cfg.cfAccess).toEqual({
      teamDomain: "team.cloudflareaccess.com",
      aud: "aud-tag",
    });
    expect(cfg.devAuthBypass).toBe(false);
  });

  it("缺少 DATABASE_URL 時拋出明確錯誤", () => {
    const env = fullEnv();
    delete env.DATABASE_URL;
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL is required/);
  });

  it("同時缺 API key 與憑證路徑時拋錯", () => {
    const env = fullEnv();
    delete env.GEMINI_API_KEY;
    expect(() => loadConfig(env)).toThrow(
      /GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS/,
    );
  });

  it("只提供憑證路徑亦視為合法", () => {
    const env = fullEnv();
    delete env.GEMINI_API_KEY;
    env.GOOGLE_APPLICATION_CREDENTIALS = "/run/secrets/sa.json";
    const cfg = loadConfig(env);
    expect(cfg.gemini.credentialsPath).toBe("/run/secrets/sa.json");
    expect(cfg.gemini.apiKey).toBeUndefined();
  });

  it("缺少英文或中文 voice 時拋錯（voice 不可寫死）", () => {
    const env = fullEnv();
    delete env.GEMINI_TTS_VOICE_EN;
    expect(() => loadConfig(env)).toThrow(/GEMINI_TTS_VOICE_EN is required/);
  });

  it("非 dev 繞過時，缺 Cloudflare Access 設定會拋錯", () => {
    const env = fullEnv();
    env.DEV_AUTH_BYPASS = "0";
    delete env.CF_ACCESS_TEAM_DOMAIN;
    delete env.CF_ACCESS_AUD;
    expect(() => loadConfig(env)).toThrow(/CF_ACCESS_TEAM_DOMAIN is required/);
  });

  it("DEV_AUTH_BYPASS=1 時可省略 Cloudflare Access 設定，cfAccess 為 null", () => {
    const env = fullEnv();
    env.DEV_AUTH_BYPASS = "1";
    delete env.CF_ACCESS_TEAM_DOMAIN;
    delete env.CF_ACCESS_AUD;
    const cfg = loadConfig(env);
    expect(cfg.devAuthBypass).toBe(true);
    expect(cfg.cfAccess).toBeNull();
  });

  it("缺少可選變數時採用預設值", () => {
    const env = fullEnv();
    delete env.AUDIO_DIR;
    delete env.GEMINI_TTS_MODEL;
    delete env.DEV_USER_EMAIL;
    const cfg = loadConfig(env);
    expect(cfg.audioDir).toBe("/data/audio");
    expect(cfg.gemini.ttsModel).toBe("gemini-2.5-flash-preview-tts");
    expect(cfg.devUserEmail).toBe("dev@example.com");
  });

  it("解析 ADMIN_EMAILS 為小寫去空白的清單；未設定時為空陣列", () => {
    const env = fullEnv();
    env.ADMIN_EMAILS = " Admin@Example.com , owner@example.com ";
    expect(loadConfig(env).adminEmails).toEqual([
      "admin@example.com",
      "owner@example.com",
    ]);
    delete env.ADMIN_EMAILS;
    expect(loadConfig(env).adminEmails).toEqual([]);
  });

  it("一次回報所有缺漏的必填變數", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*VOICE_EN/);
  });

  it("空字串或全空白視為未設定", () => {
    const env = fullEnv();
    env.DATABASE_URL = "   ";
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL is required/);
  });
});

describe("lookupLimits", () => {
  const BASE = {
    DATABASE_URL: "postgres://x",
    GEMINI_API_KEY: "k",
    GEMINI_TTS_VOICE_EN: "Kore",
    GEMINI_TTS_VOICE_ZH: "Kore",
    DEV_AUTH_BYPASS: "1",
  };
  it("預設 10/分、200/日", () => {
    const c = loadConfig(BASE);
    expect(c.lookupLimits).toEqual({ userPerMin: 10, globalPerDay: 200 });
  });
  it("可由環境變數覆寫", () => {
    const c = loadConfig({ ...BASE, LOOKUP_USER_PER_MIN: "3", LOOKUP_GLOBAL_PER_DAY: "50" });
    expect(c.lookupLimits).toEqual({ userPerMin: 3, globalPerDay: 50 });
  });
  it("非法值列入錯誤清單", () => {
    expect(() => loadConfig({ ...BASE, LOOKUP_USER_PER_MIN: "abc" })).toThrow(
      /LOOKUP_USER_PER_MIN/,
    );
  });
});

describe("audioFormat", () => {
  const BASE = {
    DATABASE_URL: "postgres://x",
    GEMINI_API_KEY: "k",
    GEMINI_TTS_VOICE_EN: "Kore",
    GEMINI_TTS_VOICE_ZH: "Kore",
    DEV_AUTH_BYPASS: "1",
  };
  it("預設 m4a、可覆寫為 wav、非法值報錯", () => {
    expect(loadConfig(BASE).audioFormat).toBe("m4a");
    expect(loadConfig({ ...BASE, AUDIO_FORMAT: "wav" }).audioFormat).toBe("wav");
    expect(() => loadConfig({ ...BASE, AUDIO_FORMAT: "mp3" })).toThrow(/AUDIO_FORMAT/);
  });
});
