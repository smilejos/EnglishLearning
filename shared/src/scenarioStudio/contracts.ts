import { z } from "zod";
import { ScenarioKeySchema, SCENARIO_MAX_TARGETS, ScenarioParagraphBreakIdsSchema, validateScenarioParagraphBreaks, scenarioCanonicalJson, scenarioHash } from "../scenarios";

export const STUDIO_BLOCKS = ["style", "sceneDescription", "targetVocabulary", "objectVisibilityRules", "composition", "charactersActions", "annotationStyle", "textRules", "decoration", "negativeRequirements"] as const;
export const STUDIO_PRESETS = [{ id: "cute-3d", label: "溫暖 3D 卡通", style: "Cute polished 3D animated cartoon, rounded shapes, soft materials, pastel colors, warm natural lighting." }, { id: "storybook", label: "繪本插畫", style: "Warm colorful children's storybook illustration, clear recognizable objects, gentle lighting." }, { id: "custom", label: "自訂風格", style: "" }];
export const STUDIO_SERENA = { model: "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit", voice: "Serena", instruct: "Speak warmly and clearly, like a kindergarten English teacher. Use a gentle, encouraging tone and careful pronunciation.", lang_code: "English", response_format: "mp3" };
const text = z.string().trim().max(20000);
export const StudioPointSchema = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
export const StudioTargetSchema = z.object({ word: text.min(1), entryGuid: z.string().uuid(), list: z.enum(["basic", "advance"]), teachingPos: z.enum(["n", "v", "adj"]), senseZh: text,
  interaction: z.object({ label: StudioPointSchema.nullable(), object: StudioPointSchema.nullable() }).strict() }).strict();
export const StudioWordLinkSchema = z.object({ surface: text.min(1), word: text.min(1), entryGuid: z.string().uuid(), isTarget: z.boolean(), start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict();
export const StudioSentenceSchema = z.object({ id: text.min(1), en: text, zh: text, baseWords: z.array(text).optional(), wordLinks: z.array(StudioWordLinkSchema).default([]) }).strict();
export const StudioStorySchema = z.object({ language: z.literal("en").default("en"), translationLanguage: z.literal("zh-Hant").default("zh-Hant"), textEn: text, textZh: text, sentences: z.array(StudioSentenceSchema).max(100), paragraphBreakAfterSentenceIds: ScenarioParagraphBreakIdsSchema.optional() }).strict().superRefine(validateScenarioParagraphBreaks);
export const StudioEditableSchema = z.object({ scenarioKey: ScenarioKeySchema, titleZh: text.max(200), vocabularyFilter: z.object({ system: z.literal("list"), levels: z.array(z.enum(["basic", "advance"])).min(1).max(2) }).strict(),
  targets: z.array(StudioTargetSchema).max(SCENARIO_MAX_TARGETS), sceneDescription: text,
  promptSettings: z.object({ stylePreset: z.enum(["cute-3d", "storybook", "custom"]), blocks: z.object(Object.fromEntries(STUDIO_BLOCKS.map(key => [key, text])) as Record<typeof STUDIO_BLOCKS[number], typeof text>).strict(), imageModelKey: z.string().max(100) }).strict(),
  story: StudioStorySchema.nullable(), selectedImageId: z.string().uuid().nullable(), selectedAudioId: z.string().uuid().nullable(), review: z.object({ story: z.boolean(), image: z.boolean(), coordinates: z.boolean(), audio: z.boolean() }).strict() }).strict();
export type StudioEditable = z.infer<typeof StudioEditableSchema>;
export interface StudioDraft extends StudioEditable { id: string; version: number; createdAt: string; updatedAt: string; materializedRevision: number | null }
export const StudioJobKindSchema = z.enum(["story", "image", "story-audio", "wordbank-audio", "finalize"]);
export type StudioJobKind = z.infer<typeof StudioJobKindSchema>;
export type StudioJobStatus = "queued" | "processing" | "done" | "failed" | "uncertain" | "cancelled";
export interface StudioJob { id: string; draftId: string; kind: StudioJobKind; status: StudioJobStatus; requiresUncertainAcknowledgement?: boolean; inputVersion: number; inputHash: string; input: { draft: StudioDraft; settings?: unknown; imageModel?: unknown; quote?: unknown; storyPrompt?: string; missingAudioPlan?: StudioAudioClip[] }; output: unknown; error: string | null; createdAt: string; updatedAt: string; leaseToken: string | null }
export interface StudioAsset { id: string; draftId: string; kind: "image" | "story-audio"; relativePath: string; sha256: string; bytes: number; contentType: "image/png" | "image/jpeg" | "image/webp" | "audio/mpeg"; width?: number; height?: number; durationSeconds?: number; textSha256?: string; inputHash: string; metadata: Record<string, unknown>; createdAt: string; url?: string }
export interface StudioAudioClip { assetGuid: string; entryGuid: string; kind: "word" | "example" | "explanation"; text: string; textHash: string }
export interface StudioCheck { code: string; message: string; blocking: boolean; sentenceId?: string; tokenIndex?: number; surface?: string }
export interface StudioClaim { job: StudioJob; draft: StudioDraft; leaseToken: string }
export const studioInputHash = (draft: StudioEditable, kind: StudioJobKind, settings?: unknown, imageModel?: unknown): string => scenarioHash(scenarioCanonicalJson({ draft, kind, settings, imageModel }));
export function studioCompiledPrompt(draft: StudioEditable): string {
  const blocks = draft.promptSettings.blocks;
  const preset = STUDIO_PRESETS.find(p => p.id === draft.promptSettings.stylePreset)!;
  return [`[STYLE]\n${blocks.style || preset.style}`, `[SCENE DESCRIPTION]\n${draft.sceneDescription}\n${blocks.sceneDescription}`, `[TARGET VOCABULARY]\n${draft.targets.map(t => `${t.word} (${t.teachingPos}): ${t.senseZh}`).join("\n")}`, `[OBJECT VISIBILITY RULES]\nEvery target must be visually recognizable, fully visible, spacious and not obscured. ${blocks.objectVisibilityRules}`, `[COMPOSITION]\nWide 16:9 composition. Preserve every target without cropping. ${blocks.composition}`, `[CHARACTERS / ACTIONS]\n${blocks.charactersActions}`, `[ANNOTATION STYLE]\nNo rendered annotations. Labels and arrows will be added by the website.`, `[TEXT RULES]\nNo words, lettering, vocabulary labels, captions, logos, signage or watermarks.`, `[DECORATION]\n${blocks.decoration}`, `[NEGATIVE REQUIREMENTS]\nNo hidden targets, clutter, tiny objects, illegible objects, dramatic dark lighting. ${blocks.negativeRequirements}`].join("\n\n");
}
export function emptyStudioDraft(scenarioKey: string, imageModelKey = ""): StudioEditable { return { scenarioKey, titleZh: "", vocabularyFilter: { system: "list", levels: ["basic", "advance"] }, targets: [], sceneDescription: "", promptSettings: { stylePreset: "cute-3d", blocks: Object.fromEntries(STUDIO_BLOCKS.map(key => [key, ""])) as StudioEditable["promptSettings"]["blocks"], imageModelKey }, story: null, selectedImageId: null, selectedAudioId: null, review: { story: false, image: false, coordinates: false, audio: false } }; }
