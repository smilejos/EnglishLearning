import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { Authorizer } from "../llm/auth";
import { stripFences } from "../llm/json";
import type { GenerationSettings } from "../generationSettings";
import { GeminiImageAdapter, OpenAIImageAdapter, ImageProviderError, type ImageAdapter } from "../illustrations/providers";
import type { ImageModel } from "../illustrations/catalog";
import type { WordbankEntry } from "../wordbank";
import { ScenarioParagraphBreakIdsSchema, validateScenarioParagraphBreaks } from "../scenarios";
import { STUDIO_SERENA } from "./contracts";

/** 與已驗收客廳及字庫產音設定一致，不修改文章的共用 speech 選項。 */
export const SERENA_PROFILE = STUDIO_SERENA;
export const StudioSpeechProfileSchema = z.object({ model: z.string().min(1).max(200), voice: z.string().min(1).max(80),
  instruct: z.string().max(4000), lang_code: z.literal("English"), response_format: z.literal("mp3") }).strict();
export type StudioSpeechProfile = z.infer<typeof StudioSpeechProfileSchema>;
export const IMAGE_BLOCK_KEYS = ["style", "sceneDescription", "objectVisibilityRules", "composition", "charactersActions", "annotationStyle", "textRules", "decoration", "negativeRequirements"] as const;
export interface PromptInput { titleZh: string; targets: Array<{ word: string; teachingPos: string; senseZh: string }>; imageSettings: Partial<Record<typeof IMAGE_BLOCK_KEYS[number], string>> }
export function compileScenarioStoryPrompt(input: PromptInput, entries: Pick<WordbankEntry, "word" | "guid">[]): string {
  return `Write one warm short English story for children about this scene. Include all ${input.targets.length} target words naturally, using each target's teaching part of speech and scene meaning; inflections allowed. Do not force unrelated details into the scene. Provide faithful Traditional Chinese translations. Use roughly 60–180 simple English words and short sentences, with enough space to naturally cover every target. If needed, use two short connected parts, returned as one ordered sentence array without headings. When separating parts, include optional paragraphBreakAfterSentenceIds containing generated IDs such as "sentence-3" (sentences are numbered from 1); omit this field for one paragraph. Never break after the final sentence. Keep the picture description and story consistent.\nScene: ${input.imageSettings.sceneDescription ?? input.titleZh}\nTargets: ${input.targets.map(t => `${t.word} (${t.teachingPos}; ${t.senseZh})`).join(", ")}\nReturn ONLY a JSON object {"sentences":[{"en":"...","zh":"...","links":[{"surface":"exact token","word":"dictionary base word"}]}]}. For EVERY English token matched by /[A-Za-z]+(?:['’][A-Za-z]+)*/g, in order, add one link; no GUIDs. Examples: reads→read, Books→book, is/are→be, sleeps→sleep. Never invent a dictionary word. If a needed word is not in the dictionary, choose a simpler one. Dictionary base words (JSON): ${JSON.stringify(entries.map(e => e.word))}`;
}
const ProposedStorySchema = z.object({ sentences: z.array(z.object({ en: z.string().trim().min(1).max(2000), zh: z.string().trim().min(1).max(2000),
  links: z.array(z.object({ surface: z.string().min(1).max(100), word: z.string().trim().min(1).max(100) }).strict()).min(1).max(200) }).strict()).min(1).max(100), paragraphBreakAfterSentenceIds: ScenarioParagraphBreakIdsSchema.optional() }).strict().superRefine((value, ctx) => validateScenarioParagraphBreaks({ sentences: value.sentences.map((_, i) => ({ id: `sentence-${i + 1}` })), paragraphBreakAfterSentenceIds: value.paragraphBreakAfterSentenceIds }, ctx));
export interface StoryMappingIssue { sentenceId: string; tokenIndex: number; surface: string; word: string; reason: "unknown" | "ambiguous"; candidates: Array<{ entryGuid: string; word: string }> }
/** 模型只提議詞形，GUID 完全從目前字庫取得。未解映射可人工修正，不能發布。 */
export function parseScenarioStory(raw: string, entries: WordbankEntry[], targets: Array<{ entryGuid: string }>) {
  const parsed = ProposedStorySchema.parse(JSON.parse(stripFences(raw)));
  const byWord = new Map<string, WordbankEntry[]>();
  for (const e of entries) { const key = e.word.toLowerCase(); byWord.set(key, [...(byWord.get(key) ?? []), e]); }
  const targetSet = new Set(targets.map(t => t.entryGuid));
  const issues: StoryMappingIssue[] = [];
  const sentences = parsed.sentences.map((s, si) => {
    const id = `sentence-${si + 1}`;
    const tokens = [...s.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
    if (tokens.length !== s.links.length) throw new Error("故事每個英文 token 都必須有詞形對應");
    const wordLinks = tokens.map((token, i) => {
      const link = s.links[i];
      if (link.surface !== token[0]) throw new Error("故事 token 與模型詞形順序不符");
      const choices = byWord.get(link.word.toLowerCase()) ?? [];
      const choice = choices.length === 1 ? choices[0] : undefined;
      if (!choice) issues.push({ sentenceId: id, tokenIndex: i, surface: token[0], word: link.word, reason: choices.length ? "ambiguous" : "unknown", candidates: choices.map(e => ({ entryGuid: e.guid, word: e.word })) });
      return choice ? { surface: token[0], word: choice.word, entryGuid: choice.guid, isTarget: targetSet.has(choice.guid), start: token.index!, end: token.index! + token[0].length } : null;
    });
    return { id, en: s.en, zh: s.zh, baseWords: s.links.map(l => l.word), wordLinks: wordLinks.filter((l): l is NonNullable<typeof l> => l !== null) };
  });
  const covered = new Set(sentences.flatMap(s => s.wordLinks).filter(l => l.isTarget).map(l => l.entryGuid));
  return { story: { language: "en" as const, translationLanguage: "zh-Hant" as const, textEn: sentences.map(s => s.en).join(" "), textZh: sentences.map(s => s.zh).join(""), sentences, ...(parsed.paragraphBreakAfterSentenceIds ? { paragraphBreakAfterSentenceIds: parsed.paragraphBreakAfterSentenceIds } : {}) }, issues,
    missingTargetGuids: [...targetSet].filter(g => !covered.has(g)) };
}

export class StudioProviderError extends Error {
  constructor(message: string, public readonly uncertain: boolean, public readonly status?: number) { super(message); }
}
export interface StudioGeneratedAudio { bytes: Buffer; contentType: "audio/mpeg"; durationSeconds: number; sha256: string }
export interface StudioGeneratedImage { bytes: Buffer; contentType: "image/png"; width: 1600; height: 900; sha256: string; providerRequestId?: string; usage?: Record<string, unknown> }
export interface ScenarioStudioProviders {
  story(choice: GenerationSettings["text"], prompt: string): Promise<string>;
  image(model: ImageModel, prompt: string, idempotencyKey: string): Promise<StudioGeneratedImage>;
  speech(profile: StudioSpeechProfile, text: string): Promise<StudioGeneratedAudio>;
}
export const studioBytesHash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 90_000);
    child.stdout.on("data", d => { stdout += d; if (stdout.length > 1_000_000) child.kill("SIGKILL"); });
    child.stderr.on("data", d => { stderr += d; if (stderr.length > 1_000_000) child.kill("SIGKILL"); });
    child.on("error", error => { clearTimeout(timer); reject(new Error(`${command} 無法執行：${error.message}`)); });
    child.on("close", code => { clearTimeout(timer); code === 0 && !timedOut && !stderr.trim() ? resolve(stdout) : reject(new Error(`${command} 音檔驗證失敗`)); });
  });
}
export async function validateStudioMp3Bytes(bytes: Buffer): Promise<{ durationSeconds: number }> {
  if (!bytes.length || bytes.length > 30_000_000) throw new Error("MP3 大小無效");
  const directory = await mkdtemp(path.join(tmpdir(), "scenario-studio-audio-"));
  try {
    const file = path.join(directory, "audio.mp3");
    await writeFile(file, bytes);
    const info = JSON.parse(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "json", file]));
    const durationSeconds = Number(info.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !info.streams?.some((s: { codec_name?: string }) => s.codec_name === "mp3")) throw new Error("不是有效的 MP3 音訊");
    await run("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]);
    return { durationSeconds };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function normalizeStudioImage(bytes: Buffer): Promise<StudioGeneratedImage> {
  if (!bytes.length || bytes.length > 30_000_000) throw new Error("圖片大小無效");
  const metadata = await sharp(bytes, { limitInputPixels: 30_000_000 }).metadata();
  if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("圖片格式無效");
  // contain 保留 3:2 OpenAI 全幅；padding 不會裁掉教學物件，座標必須對最終圖人工確認。
  const normalized = await sharp(bytes, { limitInputPixels: 30_000_000 }).rotate().resize(1600, 900, { fit: "contain", background: { r: 248, g: 244, b: 237, alpha: 1 } }).png().toBuffer();
  return { bytes: normalized, contentType: "image/png", width: 1600, height: 900, sha256: studioBytesHash(normalized) };
}
export function createScenarioStudioProviders(options: { googleAuth?: Authorizer; openaiApiKey?: string; qwenEndpoint: string;
  fetcher?: typeof fetch; adapters?: Record<string, ImageAdapter>; validateAudio?: typeof validateStudioMp3Bytes }): ScenarioStudioProviders {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = new URL(options.qwenEndpoint);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("本機 TTS endpoint 設定無效");
  const adapters = options.adapters ?? { ...(options.openaiApiKey ? { "openai-images-v1": new OpenAIImageAdapter(options.openaiApiKey, fetcher) } : {}),
    ...(options.googleAuth ? { "gemini-generate-content-v1beta": new GeminiImageAdapter(options.googleAuth, fetcher) } : {}) };
  const request = async (url: string, init: RequestInit) => {
    let response: Response;
    try { response = await fetcher(url, init); } catch { throw new StudioProviderError("供應商回應不明，請人工確認後重試", true); }
    if (!response.ok) throw new StudioProviderError(`供應商拒絕請求（${response.status}）`, false, response.status);
    return response;
  };
  return {
    async story(choice, prompt) {
      let response: Response;
      if (choice.provider === "openai") {
        if (!options.openaiApiKey) throw new StudioProviderError("OpenAI 文字憑證未設定", false);
        response = await request("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${options.openaiApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: choice.model, input: prompt, text: { format: { type: "json_object" } } }), signal: AbortSignal.timeout(180_000) });
      } else {
        if (!options.googleAuth) throw new StudioProviderError("Google 文字憑證未設定", false);
        response = await request(options.googleAuth.endpoint(choice.model), { method: "POST", headers: { ...await options.googleAuth.headers(), "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }), signal: AbortSignal.timeout(180_000) });
      }
      let body: any;
      try { body = await response.json(); } catch { throw new StudioProviderError("文字供應商回應不明", true); }
      const text = choice.provider === "google" ? body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") : body.output?.filter((m: any) => m.type === "message").flatMap((m: any) => m.content ?? []).filter((p: any) => p.type === "output_text").map((p: any) => p.text ?? "").join("");
      if (!text || body.status === "incomplete") throw new StudioProviderError("文字供應商沒有完整故事", false);
      return text;
    },
    async image(model, prompt, idempotencyKey) {
      const adapter = adapters[model.adapter];
      if (!adapter) throw new StudioProviderError("所選圖片供應商憑證未設定", false);
      try {
        const result = await adapter.generate(model, { purpose: "cover", prompt, references: [], idempotencyKey, signal: AbortSignal.timeout(180_000) });
        return { ...await normalizeStudioImage(result.bytes), providerRequestId: result.providerRequestId, usage: result.usage };
      } catch (error) { if (error instanceof ImageProviderError) throw new StudioProviderError(error.message, error.uncertain, error.status); throw error; }
    },
    async speech(profile, text) {
      const checked = StudioSpeechProfileSchema.parse(profile);
      const response = await request(endpoint.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...checked, input: text, stream: false }), signal: AbortSignal.timeout(600_000) });
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (contentType.includes("json") || contentType.startsWith("text/")) throw new StudioProviderError("TTS 回傳文字而非音訊", false);
      let bytes: Buffer;
      try { bytes = Buffer.from(await response.arrayBuffer()); } catch { throw new StudioProviderError("TTS 音訊下載中斷，結果不明", true); }
      const metadata = await (options.validateAudio ?? validateStudioMp3Bytes)(bytes);
      return { bytes, contentType: "audio/mpeg", ...metadata, sha256: studioBytesHash(bytes) };
    },
  };
}
