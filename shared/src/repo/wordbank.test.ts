import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createPool } from "../db";
import { resolveTestDatabaseUrl } from "../testing";
import { parseWordbankDocument, WordbankEntrySchema } from "../wordbank";
import { importWordbankEntries, getWordbankEntry, listWordbankEntries } from "./wordbank";
import { importWordbankAudioManifest } from "./wordbankAudio";
import { wordbankTextHash, type WordbankAudioManifest } from "../wordbankAudio";

let pool: ReturnType<typeof createPool>;
const first = WordbankEntrySchema.parse({ id: 1, guid: "5cf42a19-a752-5940-9e93-25b1e69e21bf", word: "a", level: { cefr: "A1", list: "basic", tw_7000: 1 },
  explains: [{ guid: "19e00b96-25de-5527-ac24-528cef1e33f9", en: "A grammar word for one thing." }],
  examples: [{ guid: "900e7622-ab9d-5ad4-b8ba-a617fa982ffc", en: "A cat.", zh: "一隻貓。" }] });
beforeAll(() => { pool = createPool(resolveTestDatabaseUrl()); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await pool.query("TRUNCATE wordbank_entries CASCADE"); });

describe("字庫 repo", () => {
  it("完整 9244 字匯入／重匯演練，所有欄位 round-trip 相同且不遺失缺文字詞條", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8")));
    expect(await importWordbankEntries(pool, source)).toEqual({ inserted: 9244, existing: 0 });
    expect(await listWordbankEntries(pool)).toEqual(source);
    expect(await importWordbankEntries(pool, source)).toEqual({ inserted: 0, existing: 9244 });
    const persisted = await listWordbankEntries(pool);
    expect(persisted).toEqual(source);
    expect(persisted.filter((entry) => entry.level.list === "basic")).toHaveLength(1193);
  }, 30000);

  it("自然發音增量新增五詞並只補八個例句，重匯不改舊詞、原形或 null 分級", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../docs/phonics/preparation/short-vowels/wordbank-additions.json", import.meta.url), "utf8")));
    const originalForms = source.filter(({ word }) => ["sit", "run", "man", "feed"].includes(word));
    expect(originalForms).toHaveLength(4);
    const existingDeltas = delta.filter(({ id }) => id <= 9212);
    const initial = new Map(originalForms.map((entry) => [entry.guid, entry]));
    for (const incoming of existingDeltas) {
      const current = source.find(({ guid }) => guid === incoming.guid)!;
      const newExampleGuids = new Set(incoming.examples.map(({ guid }) => guid));
      initial.set(current.guid, { ...current, examples: current.examples.filter(({ guid }) => !newExampleGuids.has(guid)) });
    }
    await importWordbankEntries(pool, [...initial.values()]);
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 5, existing: 8 });
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 0, existing: 13 });
    for (const incoming of delta) {
      const expected = source.find(({ guid }) => guid === incoming.guid)!;
      expect(await getWordbankEntry(pool, incoming.guid)).toEqual(expected);
      if (incoming.id >= 9213) expect(expected.level).toEqual({ cefr: null, tw_7000: null, list: null });
    }
    for (const original of originalForms) {
      expect(await getWordbankEntry(pool, original.guid)).toEqual(original);
    }
    expect(await listWordbankEntries(pool)).toHaveLength(initial.size + 5);
  });

  it("長母音增量新增 dune 並補十句例句，重匯保留舊內容與 null 分級", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../docs/phonics/preparation/long-vowels/wordbank-additions.json", import.meta.url), "utf8")));
    const existing = delta.filter(({ word }) => word !== "dune").map((incoming) => {
      const completed = source.find(({ guid }) => guid === incoming.guid)!;
      const added = new Set(incoming.examples.map(({ guid }) => guid));
      return { ...completed, examples: completed.examples.filter(({ guid }) => !added.has(guid)) };
    });
    expect(existing).toHaveLength(10);
    await importWordbankEntries(pool, existing);
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 1, existing: 10 });
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 0, existing: 11 });
    for (const incoming of delta) {
      expect(await getWordbankEntry(pool, incoming.guid)).toEqual(source.find(({ guid }) => guid === incoming.guid));
    }
    expect(await listWordbankEntries(pool)).toHaveLength(11);
  });

  it("第三至五章增量在測試庫可新增 oar 與例句，重匯維持所有既有欄位", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../docs/phonics/preparation/phonics-345/wordbank-additions.json", import.meta.url), "utf8")));
    const initial = delta.filter(({ word }) => word !== "oar").map((incoming) => {
      const complete = source.find(({ guid }) => guid === incoming.guid)!;
      const added = new Set(incoming.examples.map(({ guid }) => guid));
      return { ...complete, examples: complete.examples.filter(({ guid }) => !added.has(guid)) };
    });
    expect(initial).toHaveLength(29);
    await importWordbankEntries(pool, initial);
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 1, existing: 29 });
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 0, existing: 30 });
    for (const incoming of delta) expect(await getWordbankEntry(pool, incoming.guid)).toEqual(source.find(({ guid }) => guid === incoming.guid));
    expect(await listWordbankEntries(pool)).toHaveLength(30);
  });

  it("時間介系詞增量新增autumn與26子項，重匯完整保留13既有詞所有欄位", async () => {
    const source = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8")));
    const delta = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../docs/scenarios/preparation/time-prepositions/wordbank-additions.json", import.meta.url), "utf8")));
    const existing = delta.filter(({ word }) => word !== "autumn");
    expect(existing).toHaveLength(13);
    const initial = existing.map(incoming => {
      const complete = source.find(({ guid }) => guid === incoming.guid)!;
      const explains = new Set(incoming.explains.map(({ guid }) => guid));
      const examples = new Set(incoming.examples.map(({ guid }) => guid));
      return { ...complete,
        explains: complete.explains.filter(({ guid }) => !explains.has(guid)),
        examples: complete.examples.filter(({ guid }) => !examples.has(guid)),
      };
    });
    expect(existing.reduce((sum, item) => sum + item.explains.length + item.examples.length, 0)).toBe(26);
    expect(await importWordbankEntries(pool, initial)).toEqual({ inserted: 13, existing: 0 });
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 1, existing: 13 });
    for (const incoming of delta) expect(await getWordbankEntry(pool, incoming.guid)).toEqual(source.find(({ guid }) => guid === incoming.guid));
    const firstImport = await listWordbankEntries(pool);
    expect(await importWordbankEntries(pool, delta)).toEqual({ inserted: 0, existing: 14 });
    expect(await listWordbankEntries(pool)).toEqual(firstImport);
    expect(firstImport).toHaveLength(14);
    const countSubitems = (entries: typeof source) => entries.reduce((sum, item) => sum + item.explains.length + item.examples.length, 0);
    expect(countSubitems(firstImport) - countSubitems(initial)).toBe(32); // 26既有詞子項＋autumn的6子項。
    expect(firstImport.find(({ word }) => word === "within")?.level.list).toBe("expert");
    expect(firstImport.find(({ word }) => word === "autumn")?.level).toEqual({ cefr: null, tw_7000: null, list: null });
  });

  it("完整保存原欄位、重匯不加重複資料或覆蓋後補定義", async () => {
    expect(await importWordbankEntries(pool, [first])).toEqual({ inserted: 1, existing: 0 });
    expect(await getWordbankEntry(pool, first.guid)).toEqual(first);
    await pool.query("UPDATE wordbank_entries SET definition = '一個' WHERE guid = $1", [first.guid]);
    expect(await importWordbankEntries(pool, [first])).toEqual({ inserted: 0, existing: 1 });
    expect((await getWordbankEntry(pool, first.guid))?.definition).toBe("一個");
    expect(await listWordbankEntries(pool)).toHaveLength(1);
  });

  it("分級精確匹配，A2 不包含 A1；null 可取未分類", async () => {
    const second = { ...first, id: 2, guid: "64d5d1d1-5838-53c0-967e-9124bcdca6dd", word: "ability", level: { cefr: "A2" as const, tw_7000: 1, list: null }, examples: [] };
    await importWordbankEntries(pool, [first, second]);
    expect((await listWordbankEntries(pool, { scheme: "cefr", value: "A2" })).map((entry) => entry.word)).toEqual(["ability"]);
    expect((await listWordbankEntries(pool, { scheme: "list", value: null })).map((entry) => entry.word)).toEqual(["ability"]);
    expect(await listWordbankEntries(pool, { scheme: "tw_7000", value: 1 })).toHaveLength(2);
  });

  it("與文章單字資料分離，不影響既有 words", async () => {
    const count = await pool.query("SELECT count(*) FROM words");
    await importWordbankEntries(pool, [first]);
    expect((await pool.query("SELECT count(*) FROM words")).rows[0]).toEqual(count.rows[0]);
  });
});

describe("音檔 metadata 匯入", () => {
  const manifest = (): WordbankAudioManifest => ({ version: 1,
    profile: { model: "Qwen3-TTS-0.6B-8bit", voice: "Serena", instruct: "Kind teacher", lang_code: "English", response_format: "mp3" },
    entries: [{ assetGuid: first.guid, entryGuid: first.guid, kind: "word", text: first.word, textHash: wordbankTextHash(first.word), relativePath: `wordbank/test/${first.guid}.mp3`, durationSeconds: 1, bytes: 100, generatedAt: "2026-10-05T01:00:00.000Z" }] });

  it("word、example 與 explanation 的 GUID 都能存入，重匯 metadata 不重複且字庫重匯保留音檔", async () => {
    await importWordbankEntries(pool, [first]);
    const data = manifest();
    const example = first.examples[0];
    data.entries.push({ ...data.entries[0], assetGuid: example.guid, kind: "example", text: example.en, textHash: wordbankTextHash(example.en), relativePath: `wordbank/test/${example.guid}.mp3` });
    const explanation = first.explains[0];
    data.entries.push({ ...data.entries[0], assetGuid: explanation.guid, kind: "explanation", text: explanation.en, textHash: wordbankTextHash(explanation.en), relativePath: `wordbank/test/${explanation.guid}.mp3` });
    expect(await importWordbankAudioManifest(pool, data)).toBe(3);
    data.entries[0].durationSeconds = 2;
    await importWordbankAudioManifest(pool, data);
    await importWordbankEntries(pool, [first]);
    expect((await pool.query("SELECT count(*) FROM wordbank_audio")).rows[0].count).toBe("3");
    expect((await pool.query("SELECT duration_seconds FROM wordbank_audio WHERE asset_guid = $1", [first.guid])).rows[0].duration_seconds).toBe(2);
  });

  it("拒絕文字與 hash 不一致的整批資料，交易不留下部分音檔", async () => {
    await importWordbankEntries(pool, [first]);
    const data = manifest(); data.entries[0].textHash = "0".repeat(64);
    await expect(importWordbankAudioManifest(pool, data)).rejects.toThrow("文字或 textHash");
    expect((await pool.query("SELECT count(*) FROM wordbank_audio")).rows[0].count).toBe("0");
  });

  it("解釋 GUID 若屬於其他字，整批 metadata 都不匯入", async () => {
    const explanation = { guid: "7bc2abec-ce1f-4103-9d9d-4b4fb49d3e99", en: "The power to do something." };
    const second = { ...first, guid: "64d5d1d1-5838-53c0-967e-9124bcdca6dd", id: 2, word: "ability", explains: [explanation], examples: [] };
    await importWordbankEntries(pool, [first, second]);
    const data = manifest();
    data.entries.push({ ...data.entries[0], assetGuid: explanation.guid, kind: "explanation",
      text: explanation.en, textHash: wordbankTextHash(explanation.en), relativePath: `wordbank/test/${explanation.guid}.mp3` });
    await expect(importWordbankAudioManifest(pool, data)).rejects.toThrow("GUID 未對應");
    expect((await pool.query("SELECT count(*) FROM wordbank_audio")).rows[0].count).toBe("0");
  });
});
