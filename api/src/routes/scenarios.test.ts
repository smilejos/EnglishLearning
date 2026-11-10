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
  await pool.query("TRUNCATE learning_scenarios, tags, users, wordbank_entries CASCADE");
  await pool.query("UPDATE scenario_tag_settings SET kind='情境' WHERE singleton");
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
afterEach(async () => { await reader.close(); await admin.close(); await pool.query("UPDATE scenario_tag_settings SET kind='情境' WHERE singleton"); await rm(directory, { recursive: true, force: true }); });
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
  it("清單依本版教學詞性計數並含零值；admin 最新草稿與 reader 發布版縮圖各自對應固定 revision", async () => {
    // 字庫可有多詞性；每個目標只按本篇選定的教學詞性計一次。
    await pool.query("UPDATE wordbank_entries SET parts_of_speech=ARRAY['n','adj','v'] WHERE guid=ANY($1::uuid[])", [content.targets.map(target => target.entryGuid)]);
    const nounContent: ScenarioContent = { ...content, targets: content.targets.map(target => ({ ...target, teachingPos: "n" })) };
    await importScenarioRevision(pool, nounContent, media, roots);
    expect((await publish()).statusCode).toBe(200);
    const next = structuredClone(nounContent); next.revision++;
    next.targets[0].teachingPos = "adj"; next.targets[1].teachingPos = "v";
    const nextImage = await sharp({ create: { width: 20, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
    const nextMedia = structuredClone(media);
    nextMedia.image = { ...nextMedia.image, relativePath: `scenarios/${next.scenarioKey}/${next.revision}/${scenarioHash(nextImage)}.png`,
      sha256: scenarioHash(nextImage), bytes: nextImage.length, width: 20, height: 10 };
    nextMedia.audio.relativePath = nextMedia.audio.relativePath.replace(`/${content.revision}/`, `/${next.revision}/`);
    for (const [asset, data, root] of [[nextMedia.image, nextImage, roots.imageDir], [nextMedia.audio, audioData, roots.audioDir]] as const) {
      const destination = path.join(root, asset.relativePath);
      await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, data);
    }
    await importScenarioRevision(pool, next, nextMedia, roots);
    const published = (await reader.inject("/scenarios")).json().scenarios[0];
    const draft = (await admin.inject("/scenarios?includeDrafts=true")).json().scenarios[0];
    expect(published).toMatchObject({ revision: content.revision, status: "published", targetCounts: { n: 15, adj: 0, v: 0 }, image: { url: mediaUrl("image"), width: 16, height: 9 } });
    expect(draft).toMatchObject({ revision: next.revision, status: "draft", targetCounts: { n: 13, adj: 1, v: 1 },
      image: { url: `/scenarios/${next.scenarioKey}/revisions/${next.revision}/media/image`, width: 20, height: 10 } });
    expect(published.targetCounts).toEqual({ n: 15, adj: 0, v: 0 });
    expect(draft.targetCounts).toEqual({ n: 13, adj: 1, v: 1 });
    expect(published).not.toHaveProperty("learningMode");
    for (const summary of [published, draft]) expect(Object.values(summary.targetCounts).reduce((sum: number, count) => sum + Number(count), 0)).toBe(summary.targetCount);
    expect((await reader.inject(published.image.url)).rawPayload).toEqual(imageData);
    expect((await admin.inject(draft.image.url)).rawPayload).toEqual(nextImage);
    expect((await reader.inject(draft.image.url)).statusCode).toBe(404);
    expect((await admin.inject(`/scenarios/${next.scenarioKey}/revisions/${next.revision}`)).json().image).toEqual(draft.image);
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

describe("情境分類與既有標籤維度", () => {
  const makeTag = async (kind: string, label: string) => (await admin.inject({ method: "POST", url: "/tags", payload: { kind, label } })).json().tag;
  const setTags = (tagIds: number[]) => admin.inject({ method: "PUT", url: `/scenarios/${content.scenarioKey}/tags`, payload: { tagIds } });
  const summaries = async () => (await admin.inject("/scenarios?includeDrafts=true")).json().scenarios;

  it("admin 可分類既有草稿／發布教材，多選去重與清除不改內容 hash；reader 不能修改", async () => {
    await importScenarioRevision(pool, content, media, roots);
    const before = (await pool.query("SELECT content_hash, content, media, status FROM scenario_revisions")).rows[0];
    const home = await makeTag("情境", "家庭"), school = await makeTag("情境", "校園");
    expect((await reader.inject("/scenarios/taxonomy/tag-kind")).json()).toEqual({ kind: "情境" });
    expect((await reader.inject({ method: "PUT", url: `/scenarios/${content.scenarioKey}/tags`, payload: { tagIds: [home.id] } })).statusCode).toBe(403);
    expect((await setTags([home.id, school.id, home.id])).json().tags).toHaveLength(2);
    expect((await summaries())[0].tags).toEqual(expect.arrayContaining([home, school]));
    expect((await reader.inject("/scenarios")).json().scenarios).toEqual([]);
    expect((await pool.query("SELECT content_hash, content, media, status FROM scenario_revisions")).rows[0]).toEqual(before);
    expect((await publish()).statusCode).toBe(200);
    expect((await reader.inject("/scenarios")).json().scenarios[0].tags).toEqual(expect.arrayContaining([home, school]));
    expect((await setTags([])).json()).toEqual({ tags: [] });
    expect((await summaries())[0].tags).toEqual([]);
    expect((await pool.query("SELECT content_hash FROM scenario_revisions")).rows[0].content_hash).toBe(before.content_hash);
  });

  it("拒絕其他維度、未知 id 與 malformed body，失敗保留原分類；未知情境 404", async () => {
    await importScenarioRevision(pool, content, media, roots);
    const home = await makeTag("情境", "家庭"), topic = await makeTag("題材", "文化");
    await setTags([home.id]);
    for (const ids of [[home.id, topic.id], [home.id, 999999]]) expect((await setTags(ids)).statusCode).toBe(400);
    for (const payload of [{ tagIds: [-1] }, { tagIds: [1.5] }, { tagIds: ["1"] }, { tagIds: [], extra: true }, {}]) {
      expect((await admin.inject({ method: "PUT", url: `/scenarios/${content.scenarioKey}/tags`, payload })).statusCode).toBe(400);
    }
    expect((await summaries())[0].tags).toEqual([home]);
    expect((await admin.inject({ method: "PUT", url: "/scenarios/nonexistent/tags", payload: { tagIds: [] } })).statusCode).toBe(404);
  });

  it("維度與標籤改名保持分類 id；改名後仍能設定，搬離維度或刪除只移除分類", async () => {
    await importScenarioRevision(pool, content, media, roots);
    const home = await makeTag("情境", "家庭"), school = await makeTag("情境", "校園");
    await setTags([home.id, school.id]);
    expect((await admin.inject({ method: "POST", url: "/tag-kinds/rename", payload: { from: "情境", to: "生活場景" } })).json().updated).toBe(2);
    expect((await reader.inject("/scenarios/taxonomy/tag-kind")).json()).toEqual({ kind: "生活場景" });
    expect((await summaries())[0].tags).toEqual(expect.arrayContaining([{ ...home, kind: "生活場景" }, { ...school, kind: "生活場景" }]));
    expect((await setTags([home.id, school.id])).statusCode).toBe(200);
    await admin.inject({ method: "PATCH", url: `/tags/${home.id}`, payload: { label: "居家" } });
    expect((await summaries())[0].tags).toContainEqual({ ...home, kind: "生活場景", label: "居家" });
    await admin.inject({ method: "PATCH", url: `/tags/${school.id}`, payload: { kind: "題材" } });
    expect((await summaries())[0].tags).toHaveLength(1);
    expect((await setTags([school.id])).statusCode).toBe(400);
    await admin.inject({ method: "DELETE", url: `/tags/${home.id}` });
    expect((await summaries())[0].tags).toEqual([]);
    expect((await pool.query("SELECT count(*)::int n FROM scenario_revisions")).rows[0].n).toBe(1);
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


it("圖解模式由正式匯入 API 保留 prep／mode，清單計數及故事音訊可讀", async () => {
  const guide = structuredClone(content);
  guide.learningMode = "illustrated-guide";
  const at = guide.story.sentences.flatMap(sentence => sentence.wordLinks).find(link => link.word === "at")!;
  expect(at).toBeTruthy();
  guide.targets = [{ ...guide.targets[0], word: "at", entryGuid: at.entryGuid, teachingPos: "prep", senseZh: "在指定時間點", list: "basic" }];
  guide.targetCount = 1;
  guide.story.sentences.forEach(sentence => sentence.wordLinks.forEach(link => { link.isTarget = link.entryGuid === at.entryGuid; }));
  const oldMode = { ...guide, learningMode: undefined };
  expect((await admin.inject({ method: "POST", url: "/scenarios/import", payload: { content: oldMode, media } })).statusCode).toBe(400);
  await pool.query("UPDATE wordbank_entries SET parts_of_speech=ARRAY['n'] WHERE guid=$1", [at.entryGuid]);
  expect((await admin.inject({ method: "POST", url: "/scenarios/import", payload: { content: guide, media } })).statusCode).toBe(400);
  await pool.query("UPDATE wordbank_entries SET parts_of_speech=ARRAY['prep'] WHERE guid=$1", [at.entryGuid]);
  expect((await admin.inject({ method: "POST", url: "/scenarios/import", payload: { content: guide, media } })).statusCode).toBe(200);
  expect((await admin.inject(revisionUrl())).json()).toMatchObject({ learningMode: "illustrated-guide", targets: guide.targets });
  expect((await publish()).statusCode).toBe(200);
  expect((await reader.inject("/scenarios")).json().scenarios[0]).toMatchObject({ learningMode: "illustrated-guide", targetCounts: { n: 0, adj: 0, v: 0, prep: 1 } });
  expect((await reader.inject(`/scenarios/${content.scenarioKey}`)).json()).toMatchObject({ learningMode: "illustrated-guide", storyAudio: { url: mediaUrl("audio") } });
  expect((await reader.inject(mediaUrl("audio"))).rawPayload).toEqual(audioData);
});
