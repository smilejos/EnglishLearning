import { describe, expect, it } from "vitest";
import { AudioAssetsManifestSchema, audioAssetProfileHash, audioAssetTextHash, type AudioAssetManifestEntry } from "./audioAssets";

const profile = { model: "qwen", voice: "Serena", instruct: "Read clearly", lang_code: "English", response_format: "mp3" as const };
const profileHash = audioAssetProfileHash(profile);
const guid = "1c9f6b77-3906-54f3-850e-fe30107a006c";
const entry: AudioAssetManifestEntry = { scope: "phonics", lessonId: "short-a", key: "cat", assetGuid: guid,
  profile, profileHash, kind: "word", text: "cat", textHash: audioAssetTextHash("cat"),
  relativePath: `wordbank/${profileHash}/${guid}.mp3`, sha256: "a".repeat(64), bytes: 100,
  durationSeconds: 1, generatedAt: "2026-11-10T00:00:00.000Z" };
const parse = (changes: Record<string, unknown> = {}) => AudioAssetsManifestSchema.parse({ version: 1, entries: [{ ...entry, ...changes }] });

describe("共用音訊匯入契約", () => {
  it("與字庫相同的 profile hash 不受呼叫者物件欄位順序影響，wordbank 與自由素材使用相同檔名規則", () => {
    expect(audioAssetProfileHash({ response_format: "mp3", lang_code: "English", instruct: "Read clearly", voice: "Serena", model: "qwen" })).toBe(profileHash);
    expect(parse().entries[0].relativePath).toBe(entry.relativePath);
    expect(parse({ relativePath: `assets/${profileHash}/${guid}.mp3`, kind: "support" }).entries[0].kind).toBe("support");
    expect(parse({ scope: "scenario-preview", key: `${guid}.mp3` }).entries[0].key).toBe(`${guid}.mp3`);
  });

  it("拒絕文字／設定錯配、目錄穿越、lesson-key 檔名及情境受保護媒體路徑", () => {
    for (const changes of [
      { text: "dog" }, { profileHash: "0".repeat(16) }, { sha256: "invalid" }, { bytes: 0 },
      { relativePath: `assets/../${guid}.mp3` }, { relativePath: "phonics/short-a/cat.mp3" },
      { relativePath: `scenarios/living-room/1/${"a".repeat(64)}.mp3` },
      { relativePath: `wordbank/${profileHash}/cat.mp3` }, { lessonId: "../short-a" }, { lessonId: "short.a" },
      { key: "../cat.mp3" }, { key: "." }, { key: ".." }, { scope: "scenarios" },
    ]) expect(() => parse(changes), JSON.stringify(changes)).toThrow();
  });
});
