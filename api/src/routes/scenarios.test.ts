import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createPool, importWordbankEntries, parseWordbankDocument, importScenarioRevision, ScenarioContentSchema, scenarioHash,
  type ScenarioContent, type ScenarioMedia } from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";
import { buildApp } from "../app";

const readerConfig = { cfAccess: null, devAuthBypass: true, devUserEmail: "reader@example.com", adminEmails: [] };
let pool: ReturnType<typeof createPool>;
let reader: ReturnType<typeof buildApp>, admin: ReturnType<typeof buildApp>;
let directory: string;
let roots: { imageDir: string; audioDir: string };
let content: ScenarioContent;
let media: ScenarioMedia;
let imageData: Buffer;
const audioData = Buffer.from("ID3mock-mp3-for-test");
async function saveMedia() {
  for (const [kind, data] of [["image", imageData], ["audio", audioData]] as const) {
    const destination = path.join(kind === "image" ? roots.imageDir : roots.audioDir, media[kind].relativePath);
    await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, data);
  }
}
beforeAll(async () => {
  pool = createPool(resolveTestDatabaseUrl());
  const pkg = JSON.parse(await readFile(new URL("../../../docs/scenarios/packages/living-room-15-v1/scenario.json", import.meta.url), "utf8"));
  content = ScenarioContentSchema.parse({ schemaVersion: pkg.schemaVersion, scenarioKey: pkg.scenarioKey, revision: pkg.revision,
    titleZh: pkg.titleZh, vocabularyFilter: pkg.vocabularyFilter, targetCount: pkg.targetCount, targets: pkg.targets, story: pkg.story });
  imageData = await sharp({ create: { width: 16, height: 9, channels: 3, background: "white" } }).png().toBuffer();
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => {
  await pool.query("TRUNCATE learning_scenarios, users, wordbank_entries CASCADE");
  const refs = new Set([...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)].map(t => t.entryGuid));
  const entries = parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8"))).filter(e => refs.has(e.guid));
  await importWordbankEntries(pool, entries);
  directory = await mkdtemp(path.join(os.tmpdir(), "scenario-api-"));
  roots = { imageDir: path.join(directory, "images"), audioDir: path.join(directory, "audio") };
  await mkdir(roots.imageDir); await mkdir(roots.audioDir);
  const prefix = `scenarios/${content.scenarioKey}/${content.revision}`;
  media = { image: { relativePath: `${prefix}/${scenarioHash(imageData)}.png`, sha256: scenarioHash(imageData), bytes: imageData.length,
    contentType: "image/png", width: 16, height: 9 }, audio: { relativePath: `${prefix}/${scenarioHash(audioData)}.mp3`, sha256: scenarioHash(audioData), bytes: audioData.length, contentType: "audio/mpeg", textSha256: scenarioHash(content.story.textEn) } };
  await saveMedia();
  reader = buildApp({ pool, config: readerConfig, scenarios: roots, audioDir: roots.audioDir });
  admin = buildApp({ pool, config: { ...readerConfig, devUserEmail: "admin@example.com", adminEmails: ["admin@example.com"] }, scenarios: roots, audioDir: roots.audioDir });
});
afterEach(async () => { await reader.close(); await admin.close(); await rm(directory, { recursive: true, force: true }); });
const mediaUrl = (kind: string) => `/scenarios/${content.scenarioKey}/revisions/${content.revision}/media/${kind}`;
const revisionUrl = () => `/scenarios/${content.scenarioKey}/revisions/${content.revision}`;
const publish = () => admin.inject({ method: "POST", url: `${revisionUrl()}/publish`, payload: {} });

describe("正式情境 revision、權限與媒體", () => {
  it("匯入只建立 draft；reader清單/內容/媒體不能讀草稿，admin指定版本可讀，首頁仍published", async () => {
    expect(await importScenarioRevision(pool, content, media, roots)).toMatchObject({ inserted: true, status: "draft" });
    expect((await reader.inject("/scenarios")).json()).toEqual({ scenarios: [] });
    for (const url of [revisionUrl(), `/scenarios/${content.scenarioKey}`, mediaUrl("image"), mediaUrl("audio")]) expect((await reader.inject(url)).statusCode).toBe(404);
    expect((await admin.inject(revisionUrl())).json()).toMatchObject({ titleZh: content.titleZh, status: "draft", image: { width: 16, height: 9, url: mediaUrl("image") }, storyAudio: { url: mediaUrl("audio") } });
    expect((await admin.inject(`/scenarios/${content.scenarioKey}`)).statusCode).toBe(404);
    expect((await admin.inject("/scenarios?includeDrafts=true")).json().scenarios).toHaveLength(1);
    expect((await reader.inject("/scenarios?includeDrafts=true")).statusCode).toBe(403);
  });
  it("發布僅admin；可冪等發布，reader讀已發布版本/圖/旁白/range，但公開audio不能繞過", async () => {
    await importScenarioRevision(pool, content, media, roots);
    expect((await reader.inject({ method: "POST", url: `${revisionUrl()}/publish` })).statusCode).toBe(403);
    expect((await publish()).statusCode).toBe(200); expect((await publish()).statusCode).toBe(200);
    expect((await reader.inject("/scenarios")).json().scenarios[0]).toMatchObject({ scenarioKey: content.scenarioKey, targetCount: 15, status: "published" });
    expect((await reader.inject(`/scenarios/${content.scenarioKey}`)).json()).toMatchObject({ targets: content.targets, story: content.story });
    const image = await reader.inject(mediaUrl("image")); expect(image.statusCode).toBe(200); expect(image.rawPayload).toEqual(imageData);
    expect(image.headers["cache-control"]).toBe("private, no-store");
    const range = await reader.inject({ url: mediaUrl("audio"), headers: { range: "bytes=0-2" } }); expect(range.statusCode).toBe(206); expect(range.body).toBe("ID3");
    expect((await reader.inject({ url: mediaUrl("audio"), headers: { range: "bytes=999-" } })).statusCode).toBe(416);
    expect((await reader.inject(`/audio/${media.audio.relativePath}`)).statusCode).toBe(404);
    expect((await reader.inject(`/audio/${media.audio.relativePath.replace("scenarios", "%73cenarios")}`)).statusCode).toBe(404);
    const unauth = buildApp({ pool, config: { ...readerConfig, devAuthBypass: false }, scenarios: roots });
    try { expect((await unauth.inject(mediaUrl("image"))).statusCode).toBe(403); } finally { await unauth.close(); }
  });
  it("同key/revision冪等；內容不同拒絕、DB trigger不可覆寫、未產生文章或job", async () => {
    await importScenarioRevision(pool, content, media, roots);
    expect(await importScenarioRevision(pool, content, media, roots)).toMatchObject({ inserted: false });
    await expect(importScenarioRevision(pool, { ...content, titleZh: "其他標題" }, media, roots)).rejects.toThrow("不同內容");
    expect((await pool.query("SELECT count(*)::int n FROM scenario_revisions")).rows[0].n).toBe(1);
    await expect(pool.query("UPDATE scenario_revisions SET content=content || '{\"titleZh\":\"changed\"}'::jsonb")).rejects.toThrow("不可覆");
    expect((await pool.query("SELECT (SELECT count(*)::int FROM articles) articles,(SELECT count(*)::int FROM jobs) jobs")).rows[0]).toEqual({ articles: 0, jobs: 0 });
  });
  it("故事/目標GUID與字庫詞性分級校驗、15詞覆蓋與字形索引不符即拒絕，無部分DB寫入", async () => {
    const wrong = structuredClone(content); wrong.targets[0].word = "wrong";
    await expect(importScenarioRevision(pool, wrong, media, roots)).rejects.toThrow();
    await pool.query("UPDATE wordbank_entries SET level='{}' WHERE guid=$1", [content.targets[0].entryGuid]);
    await expect(importScenarioRevision(pool, content, media, roots)).rejects.toThrow("字庫分級");
    expect((await pool.query("SELECT count(*)::int n FROM learning_scenarios")).rows[0].n).toBe(0);
    const offset = structuredClone(content); offset.story.sentences[0].wordLinks[0].start++;
    expect(() => ScenarioContentSchema.parse(offset)).toThrow("索引");
  });
  it("檔案hash損毀/實際尺寸/旁白文字hash/symlink拒絕匯入與發布，reader不獲損毀媒體", async () => {
    const wrongSize = structuredClone(media); wrongSize.image.width = 999;
    await expect(importScenarioRevision(pool, content, wrongSize, roots)).rejects.toThrow("尺寸");
    const wrongText = structuredClone(media); wrongText.audio.textSha256 = "0".repeat(64);
    await expect(importScenarioRevision(pool, content, wrongText, roots)).rejects.toThrow("旁白");
    await importScenarioRevision(pool, content, media, roots);
    await writeFile(path.join(roots.audioDir, media.audio.relativePath), "corrupt");
    expect((await publish()).statusCode).toBe(409);
    await saveMedia(); expect((await publish()).statusCode).toBe(200);
    const image = path.join(roots.imageDir, media.image.relativePath); await rm(image); await writeFile(path.join(directory, "outside.png"), imageData); await symlink(path.join(directory, "outside.png"), image);
    expect((await reader.inject(mediaUrl("image"))).statusCode).toBe(404);
  });
  it("交易中媒體準備後若校驗失敗呼叫清理；DB不留情境與revision", async () => {
    const marker = path.join(directory, "new-copy");
    await expect(importScenarioRevision(pool, content, media, roots, async () => {
      await writeFile(marker, "temporary"); await writeFile(path.join(roots.audioDir, media.audio.relativePath), "broken");
      return async () => { await rm(marker); };
    })).rejects.toThrow("hash");
    await expect(readFile(marker)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int n FROM learning_scenarios")).rows[0].n).toBe(0);
  });
});

it("API admin匯入同key/revision冪等且只draft，不同內容409與reader403", async () => {
  const payload = { content, media };
  expect((await reader.inject({ method: "POST", url: "/scenarios/import", payload })).statusCode).toBe(403);
  const first = await admin.inject({ method: "POST", url: "/scenarios/import", payload });
  expect(first.statusCode).toBe(200); expect(first.json()).toMatchObject({ inserted: true, status: "draft" });
  expect((await admin.inject({ method: "POST", url: "/scenarios/import", payload })).json()).toMatchObject({ inserted: false });
  expect((await admin.inject({ method: "POST", url: "/scenarios/import", payload: { content: { ...content, titleZh: "不同內容" }, media } })).statusCode).toBe(409);
  expect((await reader.inject("/scenarios")).json().scenarios).toEqual([]);
});

it("DB寫入途中失敗會回滾revision/word links並清理本次媒體副本", async () => {
  const marker = path.join(directory, "new-copy");
  await pool.query("ALTER TABLE scenario_word_links ADD CONSTRAINT scenario_test_fail CHECK (word <> 'sofa') NOT VALID");
  try {
    await expect(importScenarioRevision(pool, content, media, roots, async () => {
      await writeFile(marker, "copy"); return async () => { await rm(marker); };
    })).rejects.toThrow("scenario_test_fail");
    expect((await pool.query("SELECT (SELECT count(*)::int FROM learning_scenarios) scenarios,(SELECT count(*)::int FROM scenario_revisions) revisions,(SELECT count(*)::int FROM scenario_word_links) links")).rows[0]).toEqual({ scenarios: 0, revisions: 0, links: 0 });
    await expect(readFile(marker)).rejects.toThrow();
  } finally { await pool.query("ALTER TABLE scenario_word_links DROP CONSTRAINT scenario_test_fail"); }
});
