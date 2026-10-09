import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readScenarioAsset, scenarioCanonicalJson, scenarioHash, scenarioSafePath, type ScenarioAsset } from "./scenarios";
let directory: string | undefined;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
describe("情境媒體檔案與內容hash", () => {
  it("key順序不影響hash、array順序保留", () => {
    expect(scenarioCanonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(scenarioCanonicalJson({ a: { b: 3, y: 2 }, z: 1 }));
    expect(scenarioCanonicalJson([1, 2])).not.toBe(scenarioCanonicalJson([2, 1]));
    expect(scenarioCanonicalJson({ a: 1, b: undefined })).toBe(scenarioCanonicalJson({ a: 1 }));
  });
  it("拒絕絕對路徑、../、反斜線、檔案與資料夾symlink；以實際bytes/hash讀檔", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "scenario-path-"));
    await mkdir(path.join(directory, "root")); await mkdir(path.join(directory, "root", "inside"));
    await writeFile(path.join(directory, "root", "inside", "audio.mp3"), "ID3test");
    await writeFile(path.join(directory, "outside.mp3"), "ID3test");
    const root = path.join(directory, "root");
    for (const relative of ["../outside.mp3", "/outside.mp3", "inside\\audio.mp3", "inside/../inside/audio.mp3", "inside//audio.mp3"]) await expect(scenarioSafePath(root, relative)).rejects.toThrow("逃逸");
    await symlink(path.join(directory, "outside.mp3"), path.join(root, "linked.mp3"));
    await symlink(path.join(root, "inside"), path.join(root, "linked-directory"));
    for (const relative of ["linked.mp3", "linked-directory/audio.mp3"]) await expect(scenarioSafePath(root, relative)).rejects.toThrow("symlink");
    const asset: ScenarioAsset = { relativePath: "inside/audio.mp3", sha256: scenarioHash("ID3test"), bytes: 7, contentType: "audio/mpeg" };
    expect((await readScenarioAsset(root, asset)).toString()).toBe("ID3test");
    await expect(readScenarioAsset(root, { ...asset, bytes: 8 })).rejects.toThrow("hash/bytes");
    await expect(readScenarioAsset(root, { ...asset, sha256: "0".repeat(64) })).rejects.toThrow("hash/bytes");
  });
});

it("媒體copy只建立新檔，重用同hash、不覆寫不同內容，失敗清理只移除自己的新增檔", async () => {
  const { copyScenarioAsset } = await import("./scenarios");
  directory = await mkdtemp(path.join(os.tmpdir(), "scenario-copy-"));
  const data = Buffer.from("ID3test");
  const asset: ScenarioAsset = { relativePath: `scenarios/living-room/1/${scenarioHash(data)}.mp3`, sha256: scenarioHash(data), bytes: data.length, contentType: "audio/mpeg" };
  const cleanup = await copyScenarioAsset(directory, asset, data);
  expect(cleanup).toBeTypeOf("function");
  expect(await copyScenarioAsset(directory, asset, data)).toBeNull();
  await writeFile(path.join(directory, asset.relativePath), "bad-existing-file");
  await expect(copyScenarioAsset(directory, asset, data)).rejects.toThrow("hash/bytes");
  await cleanup!();
  await expect(readScenarioAsset(directory, asset)).rejects.toThrow();
  await rm(path.join(directory, "scenarios"), { recursive: true });
  await mkdir(path.join(directory, "outside")); await symlink(path.join(directory, "outside"), path.join(directory, "scenarios"));
  await expect(copyScenarioAsset(directory, asset, data)).rejects.toThrow("symlink");
});
