import { createHash } from "node:crypto";
import { z } from "zod";

/** 所有匯入的共用錄音採相同 profile／GUID 命名；檔案只存在 AUDIO_DIR。 */
export const AudioAssetProfileSchema = z.object({
  model: z.string().min(1),
  voice: z.string().min(1),
  instruct: z.string(),
  lang_code: z.string().min(1),
  response_format: z.literal("mp3"),
}).strict();
export type AudioAssetProfile = z.infer<typeof AudioAssetProfileSchema>;

export const audioAssetProfileHash = (input: AudioAssetProfile): string =>
  createHash("sha256").update(JSON.stringify(AudioAssetProfileSchema.parse(input))).digest("hex").slice(0, 16);
export const audioAssetTextHash = (text: string): string =>
  createHash("sha256").update(text.trim(), "utf8").digest("hex");

export const AudioAssetScopeSchema = z.enum(["phonics", "scenario-preview"]);
export const AudioAssetKeySchema = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/);
export const AudioAssetBindingKeySchema = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/);
export const AudioAssetKindSchema = z.enum(["word", "sentence", "support", "narration", "example", "explanation"]);
export const AudioAssetManifestEntrySchema = z.object({
  scope: AudioAssetScopeSchema,
  lessonId: AudioAssetKeySchema,
  key: AudioAssetBindingKeySchema,
  assetGuid: z.string().uuid(),
  profileHash: z.string().regex(/^[a-f0-9]{16}$/),
  profile: AudioAssetProfileSchema,
  kind: AudioAssetKindSchema,
  text: z.string().min(1).refine((text) => text === text.trim(), "音訊文字不可含前後空白"),
  textHash: z.string().regex(/^[a-f0-9]{64}$/),
  relativePath: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  durationSeconds: z.number().finite().positive(),
  generatedAt: z.string().datetime(),
}).strict().superRefine((entry, ctx) => {
  if (entry.profileHash !== audioAssetProfileHash(entry.profile))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileHash"], message: "生成設定與 profileHash 不符" });
  if (entry.textHash !== audioAssetTextHash(entry.text))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["textHash"], message: "音訊文字與 textHash 不符" });
  if (!["wordbank", "assets"].some((root) => entry.relativePath === `${root}/${entry.profileHash}/${entry.assetGuid}.mp3`))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relativePath"], message: "音檔必須使用共用 profileHash／GUID 路徑" });
});
export type AudioAssetManifestEntry = z.infer<typeof AudioAssetManifestEntrySchema>;

export const AudioAssetsManifestSchema = z.object({
  version: z.literal(1),
  entries: z.array(AudioAssetManifestEntrySchema),
}).strict();
export type AudioAssetsManifest = z.infer<typeof AudioAssetsManifestSchema>;

export interface AudioAssetPlayback {
  url: string;
  text: string;
  assetGuid: string;
}
export interface AudioAssetsResponse { assets: Record<string, AudioAssetPlayback> }
