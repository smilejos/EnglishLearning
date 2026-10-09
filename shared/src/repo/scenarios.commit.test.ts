import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { ScenarioContentSchema, scenarioHash, scenarioRevisionHash, type ScenarioContent, type ScenarioMedia } from "../scenarios";
import type { DbPool } from "../db";
import { importScenarioRevision, ScenarioCommitRecoveryError } from "./scenarios";
let directory: string;
let content: ScenarioContent;
let media: ScenarioMedia;
let entries: unknown[];
beforeEach(async () => {
  const pkg = JSON.parse(await readFile(new URL("../../../docs/scenarios/packages/living-room-15-v1/scenario.json", import.meta.url), "utf8"));
  content = ScenarioContentSchema.parse({ schemaVersion: pkg.schemaVersion, scenarioKey: pkg.scenarioKey, revision: pkg.revision,
    titleZh: pkg.titleZh, vocabularyFilter: pkg.vocabularyFilter, targetCount: pkg.targetCount, targets: pkg.targets, story: pkg.story });
  entries = JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json", import.meta.url), "utf8")).entries;
  directory = await mkdtemp(path.join(os.tmpdir(), "scenario-commit-"));
  const image = await sharp({ create: { width: 16, height: 9, channels: 3, background: "white" } }).png().toBuffer();
  const audio = Buffer.from("ID3test");
  const prefix = `scenarios/${content.scenarioKey}/${content.revision}`;
  await mkdir(path.join(directory, prefix), { recursive: true });
  media = { image: { relativePath: `${prefix}/${scenarioHash(image)}.png`, sha256: scenarioHash(image), bytes: image.length, contentType: "image/png", width: 16, height: 9 },
    audio: { relativePath: `${prefix}/${scenarioHash(audio)}.mp3`, sha256: scenarioHash(audio), bytes: audio.length, contentType: "audio/mpeg", textSha256: scenarioHash(content.story.textEn) } };
  await writeFile(path.join(directory, media.image.relativePath), image); await writeFile(path.join(directory, media.audio.relativePath), audio);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
function faultPool(mode: "rollback" | "committed" | "unknown") {
  let persisted = false, connections = 0;
  const calls: string[] = [];
  const pool = { connect: async () => {
    const number = ++connections;
    if (number > 1 && mode === "unknown") throw new Error("connection unavailable");
    return { release: vi.fn(), query: async (sql: string) => {
      calls.push(sql);
      if (sql === "COMMIT" && number === 1) {
        if (mode === "committed") persisted = true;
        throw new Error(mode === "rollback" ? "deferred constraint commit failed" : "connection lost after COMMIT");
      }
      if (sql.startsWith("SELECT guid, word")) return { rows: entries };
      if (sql.startsWith("SELECT r.content")) return { rows: persisted ? [{ content, media, status: "draft", content_hash: scenarioRevisionHash(content, media) }] : [] };
      return { rows: [] };
    } };
  } } as unknown as DbPool;
  return { pool, calls };
}
async function prepare() {
  const marker = path.join(directory, "copied-media"); await writeFile(marker, "new media");
  return () => rm(marker);
}
describe("情境匯入 COMMIT 故障恢復（不連DB）", () => {
  it("callback成功但COMMIT失敗且重查沒有版本，於同key鎖內清理新媒體", async () => {
    const { pool, calls } = faultPool("rollback");
    await expect(importScenarioRevision(pool, content, media, { imageDir: directory, audioDir: directory }, prepare)).rejects.toMatchObject({ mediaDisposition: "cleaned" });
    await expect(readFile(path.join(directory, "copied-media"))).rejects.toThrow();
    expect(calls.filter(sql => sql === "COMMIT")).toHaveLength(2);
    expect(calls).toContain("ROLLBACK");
    expect(calls.filter(sql => sql.includes("pg_advisory_xact_lock"))).toHaveLength(2);
  });
  it("實際已COMMIT但回應中斷，重查版本存在則保留媒體", async () => {
    const { pool } = faultPool("committed");
    await expect(importScenarioRevision(pool, content, media, { imageDir: directory, audioDir: directory }, prepare)).rejects.toMatchObject({ mediaDisposition: "retained" });
    expect((await readFile(path.join(directory, "copied-media"))).toString()).toBe("new media");
  });
  it("重查連線失敗表示結果未知，保留媒體並回報可安全冪等重跑", async () => {
    const { pool } = faultPool("unknown");
    try { await importScenarioRevision(pool, content, media, { imageDir: directory, audioDir: directory }, prepare); throw new Error("must throw"); }
    catch (error) { expect(error).toBeInstanceOf(ScenarioCommitRecoveryError); expect(error).toMatchObject({ mediaDisposition: "unknown" }); expect((error as Error).message).toContain("保留新增媒體"); }
    expect((await readFile(path.join(directory, "copied-media"))).toString()).toBe("new media");
  });
});
