import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { mergeWordbankEntry, parseWordbankDocument, WordbankEntrySchema } from "./wordbank";
import { validateWordbankAudioManifest, WordbankAudioManifestSchema, wordbankTextHash, type WordbankAudioManifest } from "./wordbankAudio";

const entry = WordbankEntrySchema.parse({ id: 1, guid: "5cf42a19-a752-5940-9e93-25b1e69e21bf", word: "a" });
const manifest = (): WordbankAudioManifest => ({
  version: 1,
  profile: { model: "Qwen3-TTS-0.6B-8bit", voice: "Serena", instruct: "Kind teacher", lang_code: "English", response_format: "mp3" },
  entries: [{ assetGuid: entry.guid, entryGuid: entry.guid, kind: "word", text: "a", textHash: wordbankTextHash("a"), relativePath: `wordbank/abc123/${entry.guid}.mp3`, durationSeconds: 1, bytes: 100, generatedAt: "2026-10-05T01:00:00.000Z" }],
});

describe("字庫匯入契約", () => {
  it("接受缺少文字與分級，但拒絕重複 GUID", () => {
    expect(entry.definition).toBe("");
    expect(entry.level).toEqual({ cefr: null, tw_7000: null, list: null });
    expect(() => parseWordbankDocument({ entries: [entry, entry] })).toThrow("GUID 重複");
  });

  it("實際來源可完整解析 9166 字，包含 1193 basic 字且保留所有欄位", async () => {
    const source = JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8"));
    const parsed = parseWordbankDocument(source);
    expect(parsed).toHaveLength(9166);
    expect(parsed.filter((item) => item.level.list === "basic")).toHaveLength(1193);
    expect(parsed).toEqual(source.entries);
  });

  it("重匯保留既有人工補齊內容、例句 GUID 與情境，並補新內容", () => {
    const current = { ...entry, definition: "一個", category: ["manual"], scenario: ["school"],
      examples: [{ guid: "900e7622-ab9d-5ad4-b8ba-a617fa982ffc", en: "A cat.", zh: "" }],
      level: { ...entry.level, cefr: "A1" as const } };
    const incoming = { ...entry, definition: "舊版本", category: ["source"],
      examples: [{ guid: "900e7622-ab9d-5ad4-b8ba-a617fa982ffc", en: "Old text.", zh: "一隻貓。" }],
      level: { ...entry.level, cefr: "A2" as const, list: "basic" as const } };
    const merged = mergeWordbankEntry(current, incoming);
    expect(merged.definition).toBe("一個");
    expect(merged.level).toEqual({ cefr: "A1", tw_7000: null, list: "basic" });
    expect(merged.examples).toEqual([{ guid: current.examples[0].guid, en: "A cat.", zh: "一隻貓。" }]);
    expect(merged.category).toEqual(["manual", "source"]);
    expect(merged.scenario).toEqual(["school"]);
    expect(mergeWordbankEntry(merged, incoming)).toEqual(merged);
  });
});

describe("音檔 manifest 對應", () => {
  it("核對單字 GUID、大小寫、文字 SHA256 與檔名", () => {
    expect(() => validateWordbankAudioManifest(manifest(), [entry])).not.toThrow();
    const wrongText = manifest(); wrongText.entries[0].text = "A";
    expect(() => validateWordbankAudioManifest(wrongText, [entry])).toThrow("文字或 textHash");
    const wrongGuid = manifest(); wrongGuid.entries[0].assetGuid = "900e7622-ab9d-5ad4-b8ba-a617fa982ffc";
    expect(() => validateWordbankAudioManifest(wrongGuid, [entry])).toThrow("GUID 未對應");
    const wrongHash = manifest(); wrongHash.entries[0].textHash = "0".repeat(64);
    expect(() => validateWordbankAudioManifest(wrongHash, [entry])).toThrow("文字或 textHash");
  });

  it("不能把其他單字的例句連到這個字，也不能重複 asset GUID", () => {
    const wrongExample = manifest(); wrongExample.entries[0].kind = "example";
    expect(() => validateWordbankAudioManifest(wrongExample, [entry])).toThrow("GUID 未對應");
    const duplicate = manifest(); duplicate.entries.push(duplicate.entries[0]);
    expect(() => validateWordbankAudioManifest(duplicate, [entry])).toThrow("GUID 重複");
  });

  it("英文解釋以自身 GUID 對應、trim 後核對文字與 hash，不能冒用例句或其他字的解釋", () => {
    const explanation = { guid: "19e00b96-25de-5527-ac24-528cef1e33f9", en: "  A grammar word for one thing.  " };
    const explained = { ...entry, explains: [explanation] };
    const data = manifest();
    data.entries[0] = { ...data.entries[0], kind: "explanation", assetGuid: explanation.guid,
      text: explanation.en.trim(), textHash: wordbankTextHash(explanation.en), relativePath: `wordbank/abc123/${explanation.guid}.mp3` };
    expect(WordbankAudioManifestSchema.parse(data)).toEqual(data);
    expect(() => validateWordbankAudioManifest(data, [explained])).not.toThrow();
    const wrongHash = structuredClone(data); wrongHash.entries[0].textHash = "0".repeat(64);
    expect(() => validateWordbankAudioManifest(wrongHash, [explained])).toThrow("文字或 textHash");
    const wrongKind = structuredClone(data); wrongKind.entries[0].kind = "example";
    expect(() => validateWordbankAudioManifest(wrongKind, [explained])).toThrow("GUID 未對應");
    const otherEntry = { ...entry, guid: "64d5d1d1-5838-53c0-967e-9124bcdca6dd", explains: [] };
    const wrongOwner = structuredClone(data); wrongOwner.entries[0].entryGuid = otherEntry.guid;
    expect(() => validateWordbankAudioManifest(wrongOwner, [explained, otherEntry])).toThrow("GUID 未對應");
  });
});
