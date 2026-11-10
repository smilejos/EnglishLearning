import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { audioAssetProfileHash, audioAssetTextHash, createPool, importAudioAssetsManifest, importWordbankAudioManifest,
  importWordbankEntries, WordbankEntrySchema, type AudioAssetManifestEntry } from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const config: AuthConfig = { cfAccess: null, devAuthBypass: true, devUserEmail: "reader@example.com", adminEmails: [] };
const profile = { model: "qwen", voice: "Serena", instruct: "Read clearly", lang_code: "English", response_format: "mp3" as const };
const profileHash = audioAssetProfileHash(profile);
const guid = "1c9f6b77-3906-54f3-850e-fe30107a006c";
const supportGuid = "5ba89121-4ca8-51de-b2d2-ce9ba00084d4";
const word: AudioAssetManifestEntry = { scope: "phonics", lessonId: "short-a", key: "cat", assetGuid: guid,
  profile, profileHash, kind: "word", text: "cat", textHash: audioAssetTextHash("cat"),
  relativePath: `wordbank/${profileHash}/${guid}.mp3`, sha256: "a".repeat(64), bytes: 100,
  durationSeconds: 1, generatedAt: "2026-11-10T00:00:00.000Z" };
const support: AudioAssetManifestEntry = { ...word, key: "support-a-cat", assetGuid: supportGuid,
  kind: "support", text: "a cat", textHash: audioAssetTextHash("a cat"),
  relativePath: `assets/${profileHash}/${supportGuid}.mp3` };
let pool: ReturnType<typeof createPool>;
let app: ReturnType<typeof buildApp>;
let audioDir: string;
beforeAll(() => { pool = createPool(resolveTestDatabaseUrl()); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => {
  await pool.query("TRUNCATE audio_asset_bindings, audio_assets, users, wordbank_entries CASCADE");
  audioDir = await mkdtemp(path.join(tmpdir(), "el-audio-assets-"));
  app = buildApp({ pool, config, audioDir });
});
afterEach(async () => { await app?.close(); if (audioDir) await rm(audioDir, { recursive: true, force: true }); });

describe("共用音訊 registry 與播放 API", () => {
  it("跨課共用同一素材、重匯不複製 metadata；音檔透相同 /audio 路由支援 Range", async () => {
    const manifest = { version: 1 as const, entries: [word, support, { ...word, lessonId: "second-lesson" }] };
    expect(await importAudioAssetsManifest(pool, manifest)).toEqual({ assets: 2, bindings: 3 });
    expect(await importAudioAssetsManifest(pool, manifest)).toEqual({ assets: 2, bindings: 3 });
    expect((await pool.query("SELECT count(*)::int AS count FROM audio_assets")).rows[0].count).toBe(2);
    expect((await app.inject("/audio-assets/phonics/short-a")).json()).toEqual({ assets: {
      cat: { url: `/audio/${word.relativePath}`, text: "cat", assetGuid: guid },
      "support-a-cat": { url: `/audio/${support.relativePath}`, text: "a cat", assetGuid: supportGuid },
    } });
    await mkdir(path.dirname(path.join(audioDir, support.relativePath)), { recursive: true });
    await writeFile(path.join(audioDir, support.relativePath), Buffer.from("ID3abcdefghijk"));
    const range = await app.inject({ url: `/audio/${support.relativePath}`, headers: { range: "bytes=0-2" } });
    expect(range.statusCode).toBe(206);
    expect(range.body).toBe("ID3");
    expect(range.headers["content-type"]).toContain("audio/mpeg");
    expect((await app.inject("/audio/phonics/short-a/cat.mp3")).statusCode).toBe(404);
  });

  it("字庫有效新錄音立即共用，過期文字／錯誤歸屬不採用，保留同volume有效素材", async () => {
    await importAudioAssetsManifest(pool, { version: 1, entries: [word] });
    await importWordbankEntries(pool, [WordbankEntrySchema.parse({ id: 1, guid, word: "cat" })]);
    await importWordbankAudioManifest(pool, { version: 1, profile, entries: [{
      assetGuid: guid, entryGuid: guid, kind: "word", text: "cat", textHash: word.textHash,
      relativePath: `wordbank/updated/${guid}.mp3`, bytes: 150, durationSeconds: 2, generatedAt: word.generatedAt,
    }] });
    const url = async () => (await app.inject("/audio-assets/phonics/short-a")).json().assets.cat.url;
    expect(await url()).toBe(`/audio/wordbank/updated/${guid}.mp3`);
    await pool.query("UPDATE wordbank_audio SET text_hash=$1", ["0".repeat(64)]);
    expect(await url()).toBe(`/audio/${word.relativePath}`);
    await pool.query("UPDATE wordbank_audio SET text_hash=$1", [word.textHash]);
    await pool.query("UPDATE wordbank_entries SET word='dog'");
    expect(await url()).toBe(`/audio/${word.relativePath}`);
  });

  it("遇到已存在的不同內容或不同binding，整批回滾且不覆寫", async () => {
    await importAudioAssetsManifest(pool, { version: 1, entries: [word] });
    await expect(importAudioAssetsManifest(pool, { version: 1, entries: [support, { ...word, sha256: "b".repeat(64) }] })).rejects.toThrow("拒絕覆寫");
    expect((await pool.query("SELECT count(*)::int AS count FROM audio_assets")).rows[0].count).toBe(1);
    await expect(importAudioAssetsManifest(pool, { version: 1, entries: [{ ...support, key: word.key }] })).rejects.toThrow("綁定衝突");
    expect((await pool.query("SELECT count(*)::int AS count FROM audio_assets")).rows[0].count).toBe(1);
  });

  it("同manifest內衝突也拒絕，沒有HTTP匯入入口；讀取保留身分驗證、400及404", async () => {
    await expect(importAudioAssetsManifest(pool, { version: 1, entries: [word, { ...word, bytes: 200 }] })).rejects.toThrow("素材衝突");
    const unauthorized = buildApp({ pool, config: { ...config, devAuthBypass: false } });
    try { expect((await unauthorized.inject("/audio-assets/phonics/short-a")).statusCode).toBe(403); }
    finally { await unauthorized.close(); }
    expect((await app.inject("/audio-assets/phonics/missing")).statusCode).toBe(404);
    expect((await app.inject("/audio-assets/scenarios/short-a")).statusCode).toBe(400);
    expect((await app.inject("/audio-assets/phonics/short-a?extra=1")).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/audio-assets/phonics/short-a", payload: {} })).statusCode).toBe(404);
  });
});
