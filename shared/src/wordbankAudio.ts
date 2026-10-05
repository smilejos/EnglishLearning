import { createHash } from "node:crypto";
import { z } from "zod";
import type { WordbankEntry } from "./wordbank";

const ManifestEntry = z.object({
  assetGuid: z.string().uuid(),
  entryGuid: z.string().uuid(),
  kind: z.enum(["word", "example"]),
  text: z.string().min(1),
  textHash: z.string().regex(/^[a-f0-9]{64}$/),
  relativePath: z.string().refine((path) => /^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(path), "音檔路徑必須在 wordbank 子目錄中"),
  durationSeconds: z.number().finite().positive(),
  bytes: z.number().int().positive(),
  generatedAt: z.string().datetime(),
});
export const WordbankAudioManifestSchema = z.object({
  version: z.literal(1),
  profile: z.object({ model: z.string().min(1), voice: z.string().min(1), instruct: z.string(), lang_code: z.string().min(1), response_format: z.literal("mp3") }),
  entries: z.array(ManifestEntry),
});
export type WordbankAudioManifest = z.infer<typeof WordbankAudioManifestSchema>;

export const wordbankTextHash = (text: string): string => createHash("sha256").update(text.trim(), "utf8").digest("hex");

/** 防止將舊文字音檔或其他單字的例句接錯；單字大小寫與標點均必須一致。 */
export function validateWordbankAudioManifest(manifest: WordbankAudioManifest, entries: WordbankEntry[]): void {
  const byGuid = new Map(entries.map((entry) => [entry.guid, entry]));
  const assets = new Set<string>();
  for (const asset of manifest.entries) {
    if (assets.has(asset.assetGuid)) throw new Error(`音檔 GUID 重複：${asset.assetGuid}`);
    assets.add(asset.assetGuid);
    const entry = byGuid.get(asset.entryGuid);
    if (!entry) throw new Error(`音檔對應的字庫不存在：${asset.entryGuid}`);
    const expected = asset.kind === "word"
      ? (asset.assetGuid === entry.guid ? entry.word : undefined)
      : entry.examples.find((example) => example.guid === asset.assetGuid)?.en;
    if (expected === undefined) throw new Error(`音檔 GUID 未對應指定單字或例句：${asset.assetGuid}`);
    if (asset.text !== expected.trim() || asset.textHash !== wordbankTextHash(expected)) throw new Error(`音檔文字或 textHash 與字庫不一致：${asset.assetGuid}`);
    if (!asset.relativePath.endsWith(`/${asset.assetGuid}.mp3`)) throw new Error(`音檔檔名與 GUID 不一致：${asset.assetGuid}`);
  }
}
