import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import {
  createPool,
  loadImageModelCatalog,
  DEFAULT_GENERATION_SETTINGS,
  getGenerationSettings,
} from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";

const pool = createPool(resolveTestDatabaseUrl());
const catalog = loadImageModelCatalog(
  new URL("../../../config/image-models.json", import.meta.url).pathname,
  new URL("../../../config/image-pricing.json", import.meta.url).pathname,
);
const config = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "admin@example.com",
  adminEmails: ["admin@example.com"],
};
const deps = {
  catalog,
  availableModelIds: async () => catalog.models.map((model) => model.id),
  getAvailability: () => ({ google: true, openai: true }),
};

beforeAll(async () => {
  await pool.query("SELECT 1");
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  await pool.query("UPDATE generation_settings SET settings=$1, version=1", [DEFAULT_GENERATION_SETTINGS]);
});

describe("全站生成設定 API", () => {
  it("只有管理員能讀寫，GET 不洩露金鑰", async () => {
    const reader = buildApp({
      config: { ...config, devUserEmail: "reader@example.com", adminEmails: [] },
      pool,
      generationSettings: deps,
    });
    expect((await reader.inject("/generation-settings")).statusCode).toBe(403);
    expect((await reader.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings: DEFAULT_GENERATION_SETTINGS } })).statusCode).toBe(403);
    await reader.close();

    const app = buildApp({ config, pool, generationSettings: deps });
    const response = await app.inject("/generation-settings");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ settings: DEFAULT_GENERATION_SETTINGS, version: 1, availability: { google: true, openai: true } });
    expect(response.json().options.image.some((model: { model: string }) => model.model === DEFAULT_GENERATION_SETTINGS.image.model)).toBe(true);
    expect(response.body).not.toContain("apiKey");
    await app.close();
  });

  it("儲存三種選擇並拒絕舊版本", async () => {
    const app = buildApp({ config, pool, generationSettings: deps });
    const settings = {
      ...DEFAULT_GENERATION_SETTINGS,
      text: { provider: "openai", model: "gpt-4.1-mini" },
      speech: { provider: "openai", model: "gpt-4o-mini-tts", voiceEn: "coral", voiceZh: "marin" },
    };
    const first = await app.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ settings, version: 2 });
    expect((await getGenerationSettings(pool)).settings).toEqual(settings);
    const stale = await app.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings } });
    expect(stale.statusCode).toBe(409);
    await app.close();
  });

  it("拒絕未知模型、缺憑證與 image worker 不可用", async () => {
    const app = buildApp({ config, pool, generationSettings: deps });
    const invalid = await app.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings: { ...DEFAULT_GENERATION_SETTINGS, text: { provider: "openai", model: "unknown" } } } });
    expect(invalid.statusCode).toBe(400);
    await app.close();

    const noKey = buildApp({ config, pool, generationSettings: { ...deps, getAvailability: () => ({ google: true, openai: false }) } });
    expect((await noKey.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings: DEFAULT_GENERATION_SETTINGS } })).statusCode).toBe(400);
    await noKey.close();

    const noWorker = buildApp({ config, pool, generationSettings: { ...deps, availableModelIds: async () => [] } });
    const otherImage = catalog.models.find((model) => model.provider === "google-gemini")!;
    const changed = { ...DEFAULT_GENERATION_SETTINGS, image: { provider: "google", model: otherImage.id } };
    expect((await noWorker.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings: changed } })).statusCode).toBe(400);
    expect((await noWorker.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings: DEFAULT_GENERATION_SETTINGS } })).statusCode).toBe(200);
    await noWorker.close();
  });

  it("圖片規劃選項須有 config 費率才能儲存", async () => {
    const app = buildApp({ config, pool, generationSettings: {
      ...deps,
      catalog: { ...catalog, plannerProfiles: [] },
    } });
    const settings = { ...DEFAULT_GENERATION_SETTINGS, text: { provider: "openai", model: "gpt-4.1-mini" } };
    const result = await app.inject({ method: "PUT", url: "/generation-settings", payload: { version: 1, settings } });
    expect(result.statusCode).toBe(400);
    expect(result.json().error).toMatch(/pricing profile/);
    await app.close();
  });
});
