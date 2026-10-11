import { createHash } from "node:crypto";
import { lstat, readFile, realpath, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import sharp from "sharp";

export const ScenarioKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
export const SCENARIO_MAX_TARGETS = 25;
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Text = z.string().trim().min(1).max(20000);
export const ScenarioParagraphBreakIdsSchema = z.array(Text).min(1).max(99);
export function validateScenarioParagraphBreaks(story: { sentences: Array<{ id: string }>; paragraphBreakAfterSentenceIds?: string[] }, ctx: z.RefinementCtx): void {
  const breaks = story.paragraphBreakAfterSentenceIds;
  if (!breaks) return;
  const sentenceIds = new Set(story.sentences.map(s => s.id));
  if (new Set(breaks).size !== breaks.length) ctx.addIssue({ code: "custom", message: "故事分段句子 ID 不可重複" });
  if (breaks.some(id => !sentenceIds.has(id))) ctx.addIssue({ code: "custom", message: "故事分段須指定存在的句子 ID" });
  if (breaks.includes(story.sentences.at(-1)?.id ?? "")) ctx.addIssue({ code: "custom", message: "故事最後一句之後不可分段" });
}
const Point = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
export const ScenarioTargetSchema = z.object({
  word: Text, entryGuid: z.string().uuid(), list: z.enum(["basic", "advance"]),
  teachingPos: z.enum(["n", "v", "adj"]), senseZh: Text,
  interaction: z.object({ label: Point, object: Point }).strict(),
}).strict();
const WordLink = z.object({ surface: Text, word: Text, entryGuid: z.string().uuid(), isTarget: z.boolean(),
  start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict();
export const ScenarioContentSchema = z.object({
  schemaVersion: z.literal(1), scenarioKey: ScenarioKeySchema, revision: z.number().int().positive(), titleZh: Text,
  vocabularyFilter: z.object({ system: z.literal("list"), levels: z.array(z.enum(["basic", "advance"])).min(1).max(2) }).strict(),
  targetCount: z.number().int().min(1).max(SCENARIO_MAX_TARGETS), targets: z.array(ScenarioTargetSchema).min(1).max(SCENARIO_MAX_TARGETS),
  story: z.object({ language: z.literal("en"), translationLanguage: z.literal("zh-Hant"), textEn: Text, textZh: Text,
    sentences: z.array(z.object({ id: Text, en: Text, zh: Text, wordLinks: z.array(WordLink).min(1) }).strict()).min(1).max(100),
    paragraphBreakAfterSentenceIds: ScenarioParagraphBreakIdsSchema.optional(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const targets = new Map(value.targets.map(t => [t.entryGuid, t]));
  if (value.targetCount !== value.targets.length) fail("目標數量與詞條數不符");
  if (targets.size !== value.targets.length || new Set(value.targets.map(t => t.word)).size !== value.targets.length) fail("目標單字/GUID 不可重複");
  if (value.targets.some(t => !value.vocabularyFilter.levels.includes(t.list))) fail("目標超出指定級別");
  if (value.story.textEn !== value.story.sentences.map(s => s.en).join(" ") || value.story.textZh !== value.story.sentences.map(s => s.zh).join("")) fail("故事全文與句子不符");
  if (new Set(value.story.sentences.map(s => s.id)).size !== value.story.sentences.length) fail("故事句子 ID 重複");
  validateScenarioParagraphBreaks(value.story, ctx);
  const covered = new Set<string>();
  for (const sentence of value.story.sentences) {
    const tokens = [...sentence.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
    if (tokens.length !== sentence.wordLinks.length) fail("每個英文單字均須對應字庫");
    sentence.wordLinks.forEach((link, i) => {
      const token = tokens[i];
      if (!token || token.index !== link.start || link.end !== link.start + link.surface.length || token[0] !== link.surface) fail("故事字形或索引不符");
      const target = targets.get(link.entryGuid);
      if (link.isTarget !== Boolean(target) || (target && target.word !== link.word)) fail("故事目標詞對應不符");
      if (target) covered.add(link.entryGuid);
    });
  }
  if (covered.size !== targets.size) fail("故事須涵蓋所有目標詞");
});
export type ScenarioContent = z.infer<typeof ScenarioContentSchema>;
export const ScenarioAssetSchema = z.object({ relativePath: z.string().regex(/^scenarios\/[a-z0-9-]+\/[1-9][0-9]*\/[a-f0-9]{64}\.(png|jpg|webp|mp3)$/),
  sha256: Hash, bytes: z.number().int().positive(), contentType: z.enum(["image/png", "image/jpeg", "image/webp", "audio/mpeg"]),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), textSha256: Hash.optional(),
}).strict();
export type ScenarioAsset = z.infer<typeof ScenarioAssetSchema>;
export interface ScenarioMedia { image: ScenarioAsset; audio: ScenarioAsset }
export interface ScenarioRecord { content: ScenarioContent; media: ScenarioMedia; status: "draft" | "published"; contentHash: string }
export interface ScenarioSummary { scenarioKey: string; revision: number; status: "draft" | "published"; titleZh: string; vocabularyFilter: ScenarioContent["vocabularyFilter"]; targetCount: number }
export interface ScenarioDetail extends ScenarioContent { status: "draft" | "published"; image: { url: string; width: number; height: number }; storyAudio: { url: string } }
export const scenarioHash = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
/** 物件 key 順序不構成新的 revision。 */
export function scenarioCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(scenarioCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${scenarioCanonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function scenarioRevisionHash(content: ScenarioContent, media: ScenarioMedia): string { return scenarioHash(scenarioCanonicalJson({ content, media })); }
export function validateScenarioMedia(content: ScenarioContent, input: ScenarioMedia): ScenarioMedia {
  const image = ScenarioAssetSchema.parse(input.image), audio = ScenarioAssetSchema.parse(input.audio);
  const prefix = `scenarios/${content.scenarioKey}/${content.revision}/`;
  for (const asset of [image, audio]) if (!asset.relativePath.startsWith(prefix) || !asset.relativePath.includes(`/${asset.sha256}.`)) throw new Error("情境媒體路徑與版本/hash 不符");
  if (!image.contentType.startsWith("image/") || !image.width || !image.height || !/\.(png|jpg|webp)$/.test(image.relativePath)) throw new Error("圖片 metadata 無效");
  if (audio.contentType !== "audio/mpeg" || !audio.relativePath.endsWith(".mp3") || audio.textSha256 !== scenarioHash(content.story.textEn)) throw new Error("旁白 metadata 與故事不符");
  return { image, audio };
}
/** 每一層均拒絕 symlink；路徑必須留在指定 volume，不能藉實際路徑逃逸。 */
export async function scenarioSafePath(root: string, relative: string): Promise<string> {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some(p => !p || p === "." || p === "..")) throw new Error("媒體路徑不可逃逸");
  const base = await realpath(root);
  let current = base;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("媒體路徑不可使用 symlink");
  }
  if (!(await lstat(current)).isFile()) throw new Error("媒體必須為檔案");
  return current;
}
export async function readScenarioAsset(root: string, asset: ScenarioAsset): Promise<Buffer> {
  const data = await readFile(await scenarioSafePath(root, asset.relativePath));
  if (data.length !== asset.bytes || scenarioHash(data) !== asset.sha256) throw new Error("媒體檔案 hash/bytes 不符");
  return data;
}
export async function verifyScenarioAssets(content: ScenarioContent, media: ScenarioMedia, roots: { imageDir: string; audioDir: string }): Promise<void> {
  validateScenarioMedia(content, media);
  const [image, audio] = await Promise.all([readScenarioAsset(roots.imageDir, media.image), readScenarioAsset(roots.audioDir, media.audio)]);
  const metadata = await sharp(image).metadata();
  const contentTypes: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
  if (metadata.width !== media.image.width || metadata.height !== media.image.height || contentTypes[metadata.format ?? ""] !== media.image.contentType) throw new Error("圖片實際格式/尺寸與 metadata 不符");
  if (!(audio.subarray(0, 3).toString() === "ID3" || (audio[0] === 255 && (audio[1] & 224) === 224))) throw new Error("故事音檔不是 MP3");
}
export function scenarioDetail(row: ScenarioRecord): ScenarioDetail {
  const prefix = `/scenarios/${row.content.scenarioKey}/revisions/${row.content.revision}/media`;
  return { ...row.content, status: row.status, image: { url: `${prefix}/image`, width: row.media.image.width!, height: row.media.image.height! }, storyAudio: { url: `${prefix}/audio` } };
}

/** 只建立不存在的媒體；相同hash重用，既有不同hash/任何symlink均拒絕。 */
export async function copyScenarioAsset(root: string, input: ScenarioAsset, data: Buffer): Promise<(() => Promise<void>) | null> {
  const asset = ScenarioAssetSchema.parse(input);
  if (scenarioHash(data) !== asset.sha256 || data.length !== asset.bytes) throw new Error("來源媒體 hash/bytes 不符");
  const base = await realpath(root);
  const parts = asset.relativePath.split("/");
  let directory = base;
  for (const part of parts.slice(0, -1)) {
    directory = path.join(directory, part);
    try { await mkdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("目標媒體資料夾不可為 symlink");
  }
  const filename = path.join(directory, parts.at(-1)!);
  let handle;
  try { handle = await open(filename, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await readScenarioAsset(base, asset);
    return null;
  }
  const inode = (await handle.stat()).ino;
  try { await handle.writeFile(data); } catch (error) { await handle.close(); await unlink(filename); throw error; }
  await handle.close();
  return async () => {
    // 不清除已被其他程序替換的檔案。
    const current = await lstat(filename).catch(() => null);
    if (current?.ino === inode && !current.isSymbolicLink()) await unlink(filename);
  };
}
