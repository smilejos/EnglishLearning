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
  it("省略、空白或部分分級都補齊 null，保留已提供的分級", () => {
    const base = { id: 1, guid: entry.guid, word: "a" };
    for (const input of [base, { ...base, level: undefined }, { ...base, level: {} }]) {
      expect(WordbankEntrySchema.parse(input).level).toEqual({ cefr: null, tw_7000: null, list: null });
    }
    expect(WordbankEntrySchema.parse({ ...base, level: { cefr: "A2" } }).level)
      .toEqual({ cefr: "A2", tw_7000: null, list: null });
  });

  it("接受缺少文字與分級，但拒絕重複 GUID", () => {
    expect(entry.definition).toBe("");
    expect(entry.level).toEqual({ cefr: null, tw_7000: null, list: null });
    expect(() => parseWordbankDocument({ entries: [entry, entry] })).toThrow("GUID 重複");
  });

  it("實際來源可完整解析 9247 字，包含 1193 basic 字且保留所有欄位", async () => {
    const source = JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8"));
    const parsed = parseWordbankDocument(source);
    expect(parsed).toHaveLength(9247);
    expect(parsed.filter((item) => item.level.list === "basic")).toHaveLength(1193);
    expect(parsed).toEqual(source.entries);
  });

  it("五個自然發音新詞保留獨立 GUID、完整內容及未分級狀態，不取代原形", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const expected = [
      ["sat", 9213, "069db3d4-41ea-5df6-944b-e3a6609e7894", "sit"],
      ["ran", 9214, "36fd6fc8-36ca-5c99-977e-c941b15e5568", "run"],
      ["men", 9215, "0e1c1d75-59f2-5cf5-b087-622165460e8b", "man"],
      ["fed", 9216, "1b9f1a6e-95b7-5262-a6a9-1edc2509be59", "feed"],
      ["cot", 9217, "044321f5-089b-53c3-a42a-1b90889352bb", null],
    ] as const;
    for (const [word, id, guid, baseWord] of expected) {
      const matches = source.filter((entry) => entry.word === word);
      expect(matches).toHaveLength(1);
      const added = matches[0];
      expect(added.id).toBe(id);
      expect(added.guid).toBe(guid);
      expect(added.level).toEqual({ cefr: null, tw_7000: null, list: null });
      expect(added.definition.trim().length).toBeGreaterThan(0);
      expect(added.parts_of_speech.length).toBeGreaterThan(0);
      expect(added.explains).toHaveLength(3);
      expect(added.examples).toHaveLength(3);
      expect(added.examples.every(({ en, zh }) => en.trim() && zh.trim())).toBe(true);
      if (baseWord) {
        const original = source.find((entry) => entry.word === baseWord)!;
        expect(original).toBeDefined();
        expect(original.guid).not.toBe(added.guid);
        expect(added.definition).toContain(baseWord);
      }
    }
  });

  it("本批八筆例句增量可重跑，保留既有詞的全部文字、分級與舊例句", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../docs/phonics/preparation/short-vowels/wordbank-additions.json", import.meta.url), "utf8")));
    const existingDeltas = delta.filter(({ id }) => id <= 9212);
    expect(existingDeltas).toHaveLength(8);
    for (const incoming of existingDeltas) {
      expect(incoming.definition).toBe("");
      expect(incoming.explains).toEqual([]);
      expect(incoming.examples).toHaveLength(1);
      const completed = source.find(({ guid }) => guid === incoming.guid)!;
      const addedGuids = new Set(incoming.examples.map(({ guid }) => guid));
      const current = { ...completed, examples: completed.examples.filter(({ guid }) => !addedGuids.has(guid)) };
      expect(current.examples.length).toBeGreaterThanOrEqual(3);
      const merged = mergeWordbankEntry(current, incoming);
      expect(merged).toEqual(completed);
      expect(mergeWordbankEntry(merged, incoming)).toEqual(completed);
    }
  });

  it("長母音增量只新增 dune 與十句例句，保留既有詞並可重跑", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../docs/phonics/preparation/long-vowels/wordbank-additions.json", import.meta.url), "utf8")));
    expect(delta).toHaveLength(11);
    const dune = delta.find(({ word }) => word === "dune")!;
    expect(dune).toMatchObject({ id: 9218, guid: "6fdadfd0-12b1-576d-9e70-8935d1b5e24c", level: { cefr: null, tw_7000: null, list: null } });
    expect(dune.explains).toHaveLength(3);
    expect(dune.examples).toHaveLength(3);
    expect(source.filter(({ word }) => word === "dune")).toEqual([dune]);
    for (const incoming of delta.filter(({ guid }) => guid !== dune.guid)) {
      expect(incoming.examples).toHaveLength(1);
      expect(incoming.definition).toBe("");
      expect(incoming.explains).toEqual([]);
      const completed = source.find(({ guid }) => guid === incoming.guid)!;
      const added = new Set(incoming.examples.map(({ guid }) => guid));
      const current = { ...completed, examples: completed.examples.filter(({ guid }) => !added.has(guid)) };
      expect(current.examples.length).toBeGreaterThanOrEqual(3);
      expect(mergeWordbankEntry(current, incoming)).toEqual(completed);
      expect(mergeWordbankEntry(completed, incoming)).toEqual(completed);
    }
  });

  it("第三至五章增量完整補 oar，三十短句歸屬正確且重跑不覆寫舊文字", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../docs/phonics/preparation/phonics-345/wordbank-additions.json", import.meta.url), "utf8")));
    const mapping = JSON.parse(await readFile(new URL("../../docs/phonics/preparation/phonics-345/wordbank-phonics-mapping.json", import.meta.url), "utf8"));
    const oar = delta.find(({ word }) => word === "oar")!;
    expect(oar).toMatchObject({ id: 9219, guid: "048e3d74-d5fe-51a1-85cd-079d1fd684ef", parts_of_speech: ["n"], level: { cefr: null, tw_7000: null, list: null } });
    expect(oar.definition).toContain("槳");
    expect(oar.explains).toHaveLength(3);
    expect(oar.examples.length).toBeGreaterThanOrEqual(3);
    expect(source.filter(({ word }) => word === "oar")).toEqual([oar]);
    expect(mapping.words).toHaveLength(134);
    expect(new Set(mapping.words.map((item: { assetGuid: string }) => item.assetGuid)).size).toBe(134);
    expect(mapping.sentences).toHaveLength(30);
    for (const item of mapping.sentences) {
      const owner = delta.find(({ guid }) => guid === item.entryGuid)!;
      expect(owner.examples.find(({ guid }) => guid === item.assetGuid)?.en).toBe(item.text);
      expect(item.textHash).toBe(wordbankTextHash(item.text));
    }
    for (const incoming of delta.filter(({ word }) => word !== "oar")) {
      const complete = source.find(({ guid }) => guid === incoming.guid)!;
      const added = new Set(incoming.examples.map(({ guid }) => guid));
      const current = { ...complete, examples: complete.examples.filter(({ guid }) => !added.has(guid)) };
      expect(current.examples.length).toBeGreaterThanOrEqual(3);
      expect(mergeWordbankEntry(current, incoming)).toEqual(complete);
      expect(mergeWordbankEntry(complete, incoming)).toEqual(complete);
    }
  });

  it("時間介系詞增量完整包含13既有詞的26子項與autumn，重匯保留原欄位及分級", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../docs/scenarios/preparation/time-prepositions/wordbank-additions.json", import.meta.url), "utf8")));
    expect(delta).toHaveLength(14);
    const existing = delta.filter(({ word }) => word !== "autumn");
    expect(existing.map(({ word }) => word).sort()).toEqual(["in", "on", "at", "before", "after", "from", "to", "by", "until", "for", "since", "during", "within"].sort());
    const subitems = existing.flatMap(({ explains, examples }) => [...explains, ...examples]);
    expect(subitems).toHaveLength(26);
    expect(new Set(subitems.map(({ guid }) => guid)).size).toBe(26);
    for (const incoming of existing) {
      expect(incoming.parts_of_speech).toEqual(["prep"]);
      expect(incoming.definition).toBe("");
      expect(incoming.level).toEqual({ cefr: null, tw_7000: null, list: null });
      expect(incoming.explains).toHaveLength(1);
      expect(incoming.examples).toHaveLength(1);
      expect(incoming.explains[0].en.trim()).not.toBe("");
      expect(incoming.examples[0].en.trim()).not.toBe("");
      expect(incoming.examples[0].zh.trim()).not.toBe("");
      const complete = source.find(({ guid }) => guid === incoming.guid)!;
      expect(complete).toMatchObject({ word: incoming.word, id: incoming.id });
      expect(complete.level.list).toBe(incoming.word === "within" ? "expert" : "basic");
      const explainGuids = new Set(incoming.explains.map(({ guid }) => guid));
      const exampleGuids = new Set(incoming.examples.map(({ guid }) => guid));
      expect(complete.explains.filter(({ guid }) => explainGuids.has(guid))).toEqual(incoming.explains);
      expect(complete.examples.filter(({ guid }) => exampleGuids.has(guid))).toEqual(incoming.examples);
      const current = { ...complete,
        explains: complete.explains.filter(({ guid }) => !explainGuids.has(guid)),
        examples: complete.examples.filter(({ guid }) => !exampleGuids.has(guid)),
      };
      expect(current.explains.length).toBeGreaterThanOrEqual(3);
      expect(current.examples.length).toBeGreaterThanOrEqual(3);
      // 完整物件相等同時保護既有詞性、定義、分類、情境、分級與所有舊子項。
      expect(mergeWordbankEntry(current, incoming)).toEqual(complete);
      expect(mergeWordbankEntry(complete, incoming)).toEqual(complete);
    }
    const autumn = delta.find(({ word }) => word === "autumn")!;
    expect(autumn).toMatchObject({ id: 9253, guid: "8f3a9c1c-fc8e-5494-b126-31fe95b29df8", parts_of_speech: ["n"], level: { cefr: null, tw_7000: null, list: null } });
    expect(autumn.definition).toContain("秋天");
    expect(autumn.explains).toHaveLength(3);
    expect(autumn.examples).toHaveLength(3);
    expect(autumn.explains.every(({ en }) => en.trim())).toBe(true);
    expect(autumn.examples.every(({ en, zh }) => en.trim() && zh.trim())).toBe(true);
    const allSubitems = delta.flatMap(({ explains, examples }) => [...explains, ...examples]);
    expect(new Set(allSubitems.map(({ guid }) => guid)).size).toBe(32);
    expect(source.filter(({ word }) => word === "autumn")).toEqual([autumn]);
    expect(mergeWordbankEntry(autumn, autumn)).toEqual(autumn);
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

describe("字尾教材的共用字庫增量", () => {
  it("33屈折詞有獨立GUID與完整內容，原形不被取代且41個音訊歸屬正確", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../docs/phonics/preparation/endings/wordbank-additions.json", import.meta.url), "utf8")));
    const mapping = JSON.parse(await readFile(new URL("../../docs/phonics/preparation/endings/wordbank-phonics-mapping.json", import.meta.url), "utf8"));
    const audio = WordbankAudioManifestSchema.parse(JSON.parse(await readFile(new URL("../../docs/phonics/preparation/endings/wordbank-audio-import.json", import.meta.url), "utf8")));
    const bank = new Map(source.map((entry) => [entry.guid, entry]));
    expect(delta).toHaveLength(33);
    expect(mapping.words).toHaveLength(33);
    expect(mapping.sentences).toHaveLength(8);
    expect(audio.entries).toHaveLength(41);
    validateWordbankAudioManifest(audio, source);
    for (const incoming of delta) {
      expect(bank.get(incoming.guid)).toEqual(incoming);
      expect(incoming.level).toEqual({ cefr: null, tw_7000: null, list: null });
      expect(incoming.explains).toHaveLength(3);
      expect(incoming.examples).toHaveLength(3);
      expect(incoming.examples.every(({ en, zh }) => en && zh)).toBe(true);
      expect(mergeWordbankEntry(incoming, incoming)).toEqual(incoming);
    }
    for (const item of mapping.words) {
      const inflected = bank.get(item.entryGuid)!;
      const base = source.find(({ word }) => word === item.baseWord)!;
      expect(base).toBeDefined();
      expect(base.guid).not.toBe(inflected.guid);
      expect(inflected.definition).toContain(item.baseWord);
      expect(item.assetGuid).toBe(inflected.guid);
      expect(inflected.word).toBe(item.text);
      expect(item.textHash).toBe(wordbankTextHash(item.text));
    }
    for (const item of mapping.sentences) {
      expect(bank.get(item.entryGuid)!.examples.find(({ guid }) => guid === item.assetGuid)?.en).toBe(item.text);
      expect(item.textHash).toBe(wordbankTextHash(item.text));
    }
  });
});
