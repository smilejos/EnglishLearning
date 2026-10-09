// 預設離線 dry-run；不讀 .env、不跑 migration、不啟動 worker、不自動發布。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createPool, importScenarioRevision, ScenarioContentSchema, scenarioHash, scenarioSafePath,
  validateScenarioMedia, validateScenarioWordbank, copyScenarioAsset, type ScenarioMedia } from "@el/shared";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultFile = "docs/scenarios/packages/living-room-15-v1/scenario.json";
function options(args: string[]) {
  const result: Record<string, string | boolean> = {};
  const flags = ["--apply", "--dry-run", "--check-database"];
  const values = ["--package", "--image-dir", "--audio-dir", "--confirm-database", "--confirm-server"];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flags.includes(arg)) result[arg] = true;
    else if (values.includes(arg) && args[i + 1] && !args[i + 1].startsWith("--")) result[arg] = args[++i];
    else throw new Error(`未知或缺值參數：${arg}`);
  }
  if (result["--apply"] && (result["--dry-run"] || result["--check-database"])) throw new Error("--apply 不可與 dry-run/check-database 混用");
  return result;
}
async function main() {
  const opts = options(process.argv.slice(2));
  const pkg = JSON.parse(await readFile(path.resolve(repoRoot, String(opts["--package"] ?? defaultFile)), "utf8"));
  const { validateScenarioPackage } = await import("./check-scenario-package.mjs");
  const check = await validateScenarioPackage(pkg, { repoRoot });
  if (!check.valid || !check.publishReady) throw new Error(`情境素材未完整：${[...(check.errors ?? []), ...(check.missing ?? [])].join("；")}`);
  const content = ScenarioContentSchema.parse({ schemaVersion: pkg.schemaVersion, scenarioKey: pkg.scenarioKey,
    revision: pkg.revision, titleZh: pkg.titleZh, vocabularyFilter: pkg.vocabularyFilter,
    targetCount: pkg.targetCount, targets: pkg.targets, story: pkg.story });
  // 正式匯入只採用無文字底圖，參考標籤圖不進 volume。
  const imageBytes = await readFile(await scenarioSafePath(repoRoot, pkg.assets.baseImage.path));
  const audioBytes = await readFile(await scenarioSafePath(repoRoot, pkg.assets.storyAudio.path));
  const metadata = await sharp(imageBytes).metadata();
  const formats = { png: ["png", "image/png"], jpeg: ["jpg", "image/jpeg"], webp: ["webp", "image/webp"] } as const;
  const format = formats[metadata.format as keyof typeof formats];
  if (!format || !metadata.width || !metadata.height) throw new Error("底圖格式或尺寸無效");
  if (!(audioBytes.subarray(0, 3).toString() === "ID3" || (audioBytes[0] === 255 && (audioBytes[1] & 224) === 224))) throw new Error("旁白必須為 MP3");
  const prefix = `scenarios/${content.scenarioKey}/${content.revision}`;
  const imageHash = scenarioHash(imageBytes), audioHash = scenarioHash(audioBytes);
  const media: ScenarioMedia = { image: { relativePath: `${prefix}/${imageHash}.${format[0]}`, sha256: imageHash, bytes: imageBytes.length,
    contentType: format[1], width: metadata.width, height: metadata.height },
    audio: { relativePath: `${prefix}/${audioHash}.mp3`, sha256: audioHash, bytes: audioBytes.length,
      contentType: "audio/mpeg", textSha256: scenarioHash(content.story.textEn) } };
  validateScenarioMedia(content, media);
  console.log(JSON.stringify({ scenarioKey: content.scenarioKey, revision: content.revision, targets: content.targets.length,
    image: media.image, audio: media.audio, importStatus: "draft", mode: opts["--apply"] ? "apply" : opts["--check-database"] ? "check-database" : "dry-run" }, null, 2));
  if (!opts["--apply"] && !opts["--check-database"]) { console.log("離線檢查完成，未連線資料庫、複製媒體或發布。"); return; }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("須明確指定 DATABASE_URL，不會讀取 .env");
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.slice(1)) throw new Error("DATABASE_URL 必須指定 PostgreSQL 資料庫");
  const expected = `${url.hostname}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
  const pool = createPool(databaseUrl);
  try {
    const row = (await pool.query("SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port")).rows[0];
    const actual = `${row.address}:${row.port}/${row.database}`;
    console.log(`連線目標 ${expected}；實際伺服器 ${actual}`);
    if (row.database !== decodeURIComponent(url.pathname.slice(1))) throw new Error("實際資料庫名稱與指定目標不符");
    if (opts["--check-database"]) {
      await validateScenarioWordbank(pool, content);
      const exists = (await pool.query("SELECT to_regclass('scenario_revisions') AS table_name")).rows[0].table_name;
      if (!exists) throw new Error("目標尚未套用情境 migration");
      console.log(`唯讀檢查完成。確認授權後可 --apply --confirm-database '${expected}' --confirm-server '${actual}'，另提供 image/audio volume 目錄。`);
      return;
    }
    if (opts["--confirm-database"] !== expected || opts["--confirm-server"] !== actual) throw new Error("apply 須精確確認 DATABASE_URL 目標與實際伺服器；先執行 --check-database");
    if (!opts["--image-dir"] || !opts["--audio-dir"]) throw new Error("apply 須明確提供 --image-dir 與 --audio-dir，目錄必須存在");
    const roots = { imageDir: path.resolve(String(opts["--image-dir"])), audioDir: path.resolve(String(opts["--audio-dir"])) };
    const result = await importScenarioRevision(pool, content, media, roots, async () => {
      const owned: Array<() => Promise<void>> = [];
      const cleanup = async () => { for (const remove of owned.reverse()) await remove(); };
      try {
        const imageCleanup = await copyScenarioAsset(roots.imageDir, media.image, imageBytes); if (imageCleanup) owned.push(imageCleanup);
        const audioCleanup = await copyScenarioAsset(roots.audioDir, media.audio, audioBytes); if (audioCleanup) owned.push(audioCleanup);
        return cleanup;
      } catch (error) { await cleanup(); throw error; }
    });
    console.log(`匯入完成：${JSON.stringify(result)}；未發布、不呼叫生成服務。`);
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
