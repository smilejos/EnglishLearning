import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_SETTINGS,
  GENERATION_OPTIONS,
  GENERATION_MODEL_CATALOG,
  parseGenerationModelCatalog,
  validateGenerationSettings,
} from "./generationSettings";

describe("全站生成設定契約", () => {
  it("接受目前預設及 OpenAI 聲線", () => {
    expect(validateGenerationSettings(DEFAULT_GENERATION_SETTINGS)).toEqual(DEFAULT_GENERATION_SETTINGS);
    const settings = {
      ...DEFAULT_GENERATION_SETTINGS,
      speech: { provider: "openai", model: "gpt-4o-mini-tts", voiceEn: "coral", voiceZh: "marin" },
    };
    expect(validateGenerationSettings(settings).speech).toEqual(settings.speech);
    expect(GENERATION_OPTIONS.voices.openai).toContain("marin");
    expect(GENERATION_OPTIONS.text).toContainEqual({ provider: "google", model: "gemini-3.8-flash", label: "Gemini 3.8 Flash" });
    expect(GENERATION_OPTIONS.speech.some((option) => option.model === "gemini-3.8-flash-lite-tts")).toBe(false);
  });

  it("拒絕跨用途模型與跨供應商聲線", () => {
    expect(() => validateGenerationSettings({
      ...DEFAULT_GENERATION_SETTINGS,
      text: { provider: "openai", model: "gpt-4o-mini-tts" },
    })).toThrow("text");
    expect(() => validateGenerationSettings({
      ...DEFAULT_GENERATION_SETTINGS,
      speech: { provider: "openai", model: "gpt-4o-mini-tts", voiceEn: "Kore", voiceZh: "coral" },
    })).toThrow("voice");
  });

  it("從設定目錄新增同供應商模型後，可供該工作選擇與驗證", () => {
    const catalog = parseGenerationModelCatalog({
      ...GENERATION_MODEL_CATALOG,
      text: [
        ...GENERATION_MODEL_CATALOG.text,
        { provider: "openai", model: "future-text-model", label: "New text model" },
      ],
    });
    const settings = {
      ...DEFAULT_GENERATION_SETTINGS,
      text: { provider: "openai", model: "future-text-model" },
    };
    expect(validateGenerationSettings(settings, catalog).text).toEqual(settings.text);
    expect(() => validateGenerationSettings(settings)).toThrow("text");
  });

  it("啟動時拒絕重複或不存在的預設模型", () => {
    expect(() => parseGenerationModelCatalog({
      ...GENERATION_MODEL_CATALOG,
      speech: [...GENERATION_MODEL_CATALOG.speech, GENERATION_MODEL_CATALOG.speech[0]],
    })).toThrow("duplicate");
    expect(() => parseGenerationModelCatalog({
      ...GENERATION_MODEL_CATALOG,
      defaults: { ...GENERATION_MODEL_CATALOG.defaults, text: { provider: "openai", model: "missing" } },
    })).toThrow("default provider/model");
  });
});
