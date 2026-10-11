// 後台的輕量 DTO；對應 shared/src/scenarioStudio/contracts.ts，不引用伺服器模組。
export type StudioLevel = "basic" | "advance";
export type StudioPos = "n" | "v" | "adj";
export type StudioKind = "story" | "image" | "story-audio" | "wordbank-audio" | "finalize";
export type StudioStatus = "queued" | "processing" | "done" | "failed" | "uncertain" | "cancelled";
export type StudioPoint = { x: number; y: number };
export const STUDIO_BLOCKS = ["style", "sceneDescription", "targetVocabulary", "objectVisibilityRules", "composition", "charactersActions", "annotationStyle", "textRules", "decoration", "negativeRequirements"] as const;
export type StudioBlock = typeof STUDIO_BLOCKS[number];
export interface StudioTarget {
  word: string; entryGuid: string; list: StudioLevel; teachingPos: StudioPos; senseZh: string;
  interaction: { label: StudioPoint | null; object: StudioPoint | null };
}
export interface StudioWordLink { surface: string; word: string; entryGuid: string; isTarget: boolean; start: number; end: number }
export interface StudioSentence { id: string; en: string; zh: string; baseWords?: string[]; wordLinks: StudioWordLink[] }
export interface StudioStory { language: "en"; translationLanguage: "zh-Hant"; textEn: string; textZh: string; sentences: StudioSentence[]; paragraphBreakAfterSentenceIds?: string[] }
export interface StudioEditable {
  scenarioKey: string; titleZh: string; vocabularyFilter: { system: "list"; levels: StudioLevel[] }; targets: StudioTarget[];
  sceneDescription: string; promptSettings: { stylePreset: "cute-3d" | "storybook" | "custom"; blocks: Record<StudioBlock, string>; imageModelKey: string };
  story: StudioStory | null; selectedImageId: string | null; selectedAudioId: string | null;
  review: { story: boolean; image: boolean; coordinates: boolean; audio: boolean };
}
export interface StudioDraft extends StudioEditable { id: string; version: number; createdAt: string; updatedAt: string; materializedRevision: number | null }
export interface StudioJob { id: string; draftId: string; kind: StudioKind; status: StudioStatus; requiresUncertainAcknowledgement?: boolean; inputVersion: number; inputHash: string; output: unknown; error: string | null; createdAt: string; updatedAt: string }
export interface StudioAsset { id: string; kind: "image" | "story-audio"; sha256: string; bytes: number; contentType: string; width?: number; height?: number; durationSeconds?: number; textSha256?: string; inputHash: string; metadata: Record<string, unknown>; createdAt: string; url?: string }
export interface StudioAudioClip { assetGuid: string; entryGuid: string; kind: "word" | "example" | "explanation"; text: string; textHash: string }
export interface StudioCheck { code: string; message: string; blocking: boolean; sentenceId?: string; tokenIndex?: number; surface?: string }
export interface StudioDetail { draft: StudioDraft; assets: StudioAsset[]; jobs: StudioJob[]; checks: StudioCheck[]; compiledPrompt: string; missingAudioPlan: StudioAudioClip[]; publishedRevision: number | null }
export interface StudioRevisionSummary { scenarioKey: string; revision: number; status: "draft" | "published"; titleZh: string; targetCount: number }
export interface StudioWord { guid: string; word: string; partsOfSpeech: string[]; definition: string; level: { list: string | null; [key: string]: string | null } }
export interface StudioResolveResult { input: string; status: "matched" | "ambiguous" | "unknown" | "out-of-level" | "duplicate"; entries: StudioWord[] }
export interface StudioQuote { kind: StudioKind; version: number; inputHash: string; estimatedCostUsdMicros: number | null; localCompute: boolean; expiresAt: string; modelLabel: string; quoteHash: string }
export interface StudioOptions {
  presets: { id: StudioEditable["promptSettings"]["stylePreset"]; label: string; style: string }[];
  blocks: StudioBlock[];
  imageModels: { id: string; label: string; provider: string; available: boolean }[];
  text: { provider: string; model: string; available: boolean };
  speech: { provider: "local-qwen"; model: string; voice: string; available: boolean };
  workers: { id: string; capabilities: unknown; updatedAt: string }[];
  workerOnline: boolean;
  defaultImageModelKey: string;
}
export function studioEditable(draft: StudioDraft): StudioEditable {
  const { scenarioKey, titleZh, vocabularyFilter, targets, sceneDescription, promptSettings, story, selectedImageId, selectedAudioId, review } = draft;
  return { scenarioKey, titleZh, vocabularyFilter, targets, sceneDescription, promptSettings, story, selectedImageId, selectedAudioId, review };
}
