import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, importWordbankEntries, importWordbankAudioManifest, WordbankEntrySchema, wordbankTextHash, type WordbankPracticeEntry } from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";
import { buildApp } from "../app";
import type { AuthConfig } from "../auth";

const config: AuthConfig = { cfAccess: null, devAuthBypass: true, devUserEmail: "reader@example.com", adminEmails: [] };
const first = WordbankEntrySchema.parse({ id: 1, guid: "5cf42a19-a752-5940-9e93-25b1e69e21bf", word: "a", parts_of_speech: ["art"], definition: "一個", level: { cefr: "A1", list: "basic", tw_7000: 1 },
  explains: [
    { guid: "19e00b96-25de-5527-ac24-528cef1e33f9", en: "A grammar word for one thing." },
    { guid: "7bc2abec-ce1f-4103-9d9d-4b4fb49d3e99", en: "Used before a singular noun." },
  ],
  examples: [
    { guid: "900e7622-ab9d-5ad4-b8ba-a617fa982ffc", en: "A cat.", zh: "一隻貓。" },
    { guid: "8a847019-ec3f-539e-98ad-bef40c4dc379", en: "A dog.", zh: "一隻狗。" },
    { guid: "8414b6dc-4e2e-56c9-94cf-2cacc9cc8e3b", en: "A rabbit.", zh: "一隻兔子。" },
    { guid: "04b020aa-a4df-5daf-bc0a-4213458f48df", en: "A bird.", zh: "一隻鳥。" },
  ] });
const second = WordbankEntrySchema.parse({ id: 2, guid: "64d5d1d1-5838-53c0-967e-9124bcdca6dd", word: "ability", level: { cefr: "A2", list: "advance", tw_7000: 2 } });
const third = WordbankEntrySchema.parse({ id: 3, guid: "19e00b96-25de-5527-ac24-528cef1e33f9", word: "unknown" });
let pool: ReturnType<typeof createPool>;
let app: ReturnType<typeof buildApp>;
beforeAll(() => { pool = createPool(resolveTestDatabaseUrl()); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => {
  await pool.query("TRUNCATE users, wordbank_entries CASCADE");
  await importWordbankEntries(pool, [first, second, third]);
  app = buildApp({ pool, config });
});
afterEach(async () => { await app.close(); });

describe("單字練習 API", () => {
  it("reader 可讀三套分級數量，包含零筆選項與未分類；不用拿全字庫", async () => {
    const result = await app.inject("/wordbank/options");
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ total: 3, systems: {
      list: [{ value: "all", count: 3 }, { value: "basic", count: 1 }, { value: "advance", count: 1 }, { value: "expert", count: 0 }, { value: "unclassified", count: 1 }],
      cefr: [{ value: "all", count: 3 }, { value: "A1", count: 1 }, { value: "A2", count: 1 }, ...["B1", "B2", "C1", "C2"].map((value) => ({ value, count: 0 })), { value: "unclassified", count: 1 }],
      tw_7000: [{ value: "all", count: 3 }, { value: "1", count: 1 }, { value: "2", count: 1 }, ...["3", "4", "5", "6"].map((value) => ({ value, count: 0 })), { value: "unclassified", count: 1 }],
    } });
  });

  it("整字出題、隨機只取三個完整中英例句，沒有音檔也能用", async () => {
    const result = await app.inject("/wordbank/random?system=list&levels=basic");
    expect(result.statusCode).toBe(200);
    const { poolSize, entry } = result.json<{ poolSize: number; entry: WordbankPracticeEntry }>();
    expect(poolSize).toBe(1);
    expect(entry).toMatchObject({ guid: first.guid, word: "a", partsOfSpeech: ["art"], definition: "一個", explains: first.explains.map((explanation) => ({ ...explanation, audioUrl: null })), level: first.level, wordAudioUrl: null });
    expect(entry.examples).toHaveLength(3);
    expect(new Set(entry.examples.map((example) => example.guid)).size).toBe(3);
    for (const example of entry.examples) expect(example).toEqual({ ...first.examples.find((candidate) => candidate.guid === example.guid), audioUrl: null });
  });

  it("精確 A2 不含 A1，同套多值 OR、unclassified 与 all 可用，缺提示不排除", async () => {
    const a2 = (await app.inject("/wordbank/random?system=cefr&levels=A2")).json();
    expect(a2).toMatchObject({ poolSize: 1, entry: { word: "ability", definition: "", explains: [], examples: [] } });
    expect((await app.inject("/wordbank/random?system=list&levels=basic,advance")).json().poolSize).toBe(2);
    expect((await app.inject("/wordbank/random?system=list&levels=basic,unclassified")).json().poolSize).toBe(2);
    expect((await app.inject("/wordbank/random?system=cefr&levels=unclassified")).json()).toMatchObject({ poolSize: 1, entry: { word: "unknown" } });
    expect((await app.inject("/wordbank/random?system=tw_7000&levels=1,2")).json().poolSize).toBe(2);
    for (const path of ["/wordbank/random", "/wordbank/random?system=all", "/wordbank/random?system=cefr&levels=all"]) expect((await app.inject(path)).json().poolSize).toBe(3);
  });

  it("空池明確回 200/null，非法與混用制度 query 回 400", async () => {
    const empty = await app.inject("/wordbank/random?system=cefr&levels=C2");
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ poolSize: 0, entry: null });
    for (const path of [
      "/wordbank/random?system=invalid", "/wordbank/random?levels=A2", "/wordbank/random?system=cefr&levels=basic",
      "/wordbank/random?system=list&levels=basic,A1", "/wordbank/random?system=list&levels=all,basic", "/wordbank/random?system=list&levels=",
      "/wordbank/random?system=list&levels=basic&system=cefr", "/wordbank/random?system=list&levels=basic&cefr=A1",
      "/wordbank/options?system=list",
    ]) expect((await app.inject(path)).statusCode, path).toBe(400);
  });

  it("MP3 metadata 回既有音訊URL，改過文字的舊音檔不播放", async () => {
    const assets = [{ assetGuid: first.guid, entryGuid: first.guid, kind: "word" as const, text: first.word },
      ...first.explains.map((explanation) => ({ assetGuid: explanation.guid, entryGuid: first.guid, kind: "explanation" as const, text: explanation.en })),
      ...first.examples.map((example) => ({ assetGuid: example.guid, entryGuid: first.guid, kind: "example" as const, text: example.en }))];
    await importWordbankAudioManifest(pool, { version: 1,
      profile: { model: "qwen", voice: "Serena", instruct: "Kind teacher", lang_code: "English", response_format: "mp3" },
      entries: assets.map((asset) => ({ ...asset, textHash: wordbankTextHash(asset.text), relativePath: `wordbank/test/${asset.assetGuid}.mp3`, durationSeconds: 1, bytes: 100, generatedAt: "2026-10-05T01:00:00.000Z" })) });
    const entry = (await app.inject("/wordbank/random?system=list&levels=basic")).json().entry;
    expect(entry.wordAudioUrl).toBe(`/audio/wordbank/test/${first.guid}.mp3`);
    expect(entry.explains).toEqual(first.explains.map((explanation) => ({ ...explanation, audioUrl: `/audio/wordbank/test/${explanation.guid}.mp3` })));
    for (const example of entry.examples) expect(example.audioUrl).toBe(`/audio/wordbank/test/${example.guid}.mp3`);
    await pool.query("UPDATE wordbank_audio SET text_hash = $1", ["0".repeat(64)]);
    const stale = (await app.inject("/wordbank/random?system=list&levels=basic")).json().entry;
    expect(stale.wordAudioUrl).toBeNull();
    expect(stale.explains.every((explanation: { audioUrl: string | null }) => explanation.audioUrl === null)).toBe(true);
    expect(stale.examples.every((example: { audioUrl: string | null }) => example.audioUrl === null)).toBe(true);
  });

  it("解釋改字或 metadata 屬於其他詞條／種類時不回舊音檔", async () => {
    const explanation = first.explains[0];
    await importWordbankAudioManifest(pool, { version: 1,
      profile: { model: "qwen", voice: "Serena", instruct: "Kind teacher", lang_code: "English", response_format: "mp3" },
      entries: [{ assetGuid: explanation.guid, entryGuid: first.guid, kind: "explanation", text: explanation.en,
        textHash: wordbankTextHash(explanation.en), relativePath: `wordbank/test/${explanation.guid}.mp3`, durationSeconds: 1, bytes: 100, generatedAt: "2026-10-05T01:00:00.000Z" }] });
    const getExplanation = async () => (await app.inject("/wordbank/random?system=list&levels=basic")).json().entry.explains[0];
    await pool.query("UPDATE wordbank_audio SET entry_guid = $1 WHERE asset_guid = $2", [second.guid, explanation.guid]);
    expect((await getExplanation()).audioUrl).toBeNull();
    await pool.query("UPDATE wordbank_audio SET entry_guid = $1, kind = 'example' WHERE asset_guid = $2", [first.guid, explanation.guid]);
    expect((await getExplanation()).audioUrl).toBeNull();
    await pool.query("UPDATE wordbank_audio SET kind = 'explanation' WHERE asset_guid = $1", [explanation.guid]);
    await pool.query("UPDATE wordbank_entries SET explains = $1::jsonb WHERE guid = $2", [JSON.stringify([{ ...explanation, en: "Changed explanation." }]), first.guid]);
    expect(await getExplanation()).toEqual({ guid: explanation.guid, en: "Changed explanation.", audioUrl: null });
  });

  it("正常身份驗證保留；抽題不建立文章job、共用單字或收藏", async () => {
    const unauthorized = buildApp({ pool, config: { ...config, devAuthBypass: false } });
    try {
      expect((await unauthorized.inject("/wordbank/options")).statusCode).toBe(403);
      expect((await unauthorized.inject("/wordbank/random")).statusCode).toBe(403);
    } finally { await unauthorized.close(); }
    const counts = async () => (await pool.query("SELECT (SELECT count(*) FROM jobs) jobs, (SELECT count(*) FROM words) words, (SELECT count(*) FROM vocabulary_items) items")).rows[0];
    const before = await counts();
    await app.inject("/wordbank/random");
    expect(await counts()).toEqual(before);
  });
});

it("GUID 查詞回全部例句/解釋，缺詞404與非法GUID400，保留有效音檔/淘汰變更文字音檔", async () => {
  const assets = [{ assetGuid: first.guid, kind: "word" as const, text: first.word },
    ...first.explains.map(x => ({ assetGuid: x.guid, kind: "explanation" as const, text: x.en })),
    ...first.examples.map(x => ({ assetGuid: x.guid, kind: "example" as const, text: x.en }))];
  await importWordbankAudioManifest(pool, { version: 1,
    profile: { model: "qwen", voice: "Serena", instruct: "Kind teacher", lang_code: "English", response_format: "mp3" },
    entries: assets.map(a => ({ ...a, entryGuid: first.guid, textHash: wordbankTextHash(a.text), relativePath: `wordbank/test/${a.assetGuid}.mp3`, durationSeconds: 1, bytes: 100, generatedAt: "2026-10-05T01:00:00.000Z" })) });
  const result = await app.inject(`/wordbank/entries/${first.guid}`);
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ guid: first.guid, word: first.word, wordAudioUrl: `/audio/wordbank/test/${first.guid}.mp3` });
  expect(result.json().examples).toEqual(first.examples.map(x => ({ ...x, audioUrl: `/audio/wordbank/test/${x.guid}.mp3` })));
  expect(result.json().explains).toEqual(first.explains.map(x => ({ ...x, audioUrl: `/audio/wordbank/test/${x.guid}.mp3` })));
  await pool.query("UPDATE wordbank_audio SET text_hash=$1", ["0".repeat(64)]);
  const changed = (await app.inject(`/wordbank/entries/${first.guid}`)).json();
  expect(changed.wordAudioUrl).toBeNull(); expect(changed.explains.every((x: { audioUrl: unknown }) => x.audioUrl === null)).toBe(true);
  expect((await app.inject("/wordbank/entries/not-a-guid")).statusCode).toBe(400);
  expect((await app.inject("/wordbank/entries/00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
});
