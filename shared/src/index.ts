// @el/shared — 共用契約與工具。
// db pool、repositories 於 Phase 2+ 陸續加入。

export { normalizeWord } from "./normalizeWord";
export * from "./illustrations/contracts";
export * from "./illustrations/catalog";
export * from "./illustrations/providers";
export * from "./illustrations/repository";
export * from "./illustrations/storage";
export * from "./illustrations/processor";
export { extractVocabWords } from "./tokenizeWords";

export { createPool, ping, withTransaction } from "./db";
export type { DbPool } from "./db";

export { writeAudio, removeAudioDir, writeAudioEncoded } from "./audioFiles";
export type { AudioFormat, WriteEncodedOpts } from "./audioFiles";
export { ffmpegAvailable, encodeWavToM4aFile } from "./audioEncode";

export * from "./repo";
export * from "./generationSettings";
export * from "./repo/generationSettings";
export * from "./generationClients";

export { generateContent, firstText } from "./llm/genai";
export type {
  GenRequest,
  GenResponse,
  GenPart,
  GenCandidate,
} from "./llm/genai";
export {
  apiKeyAuthorizer,
  serviceAccountAuthorizer,
  createVertexAuthorizer,
} from "./llm/auth";
export type { Authorizer } from "./llm/auth";
export { pcmToWav, pcmDurationSec, TTS_FORMAT } from "./llm/wav";
export type { WavFormat } from "./llm/wav";
export {
  GeminiTtsClient,
  withRetry,
  isQuotaError,
} from "./llm/tts";
export type {
  TtsClient,
  TtsResult,
  GeminiTtsOptions,
  RetryOpts,
} from "./llm/tts";
export {
  GeminiTranslateClient,
  generateTranslations,
  translateParagraph,
} from "./llm/translate";
export type {
  TranslateClient,
  TranslateOpts,
  GeminiTranslateOptions,
} from "./llm/translate";
export { stripFences } from "./llm/json";
export {
  explainWord,
  GeminiExplainClient,
  WordExplanationContentSchema,
} from "./llm/explainWord";
export type {
  ExplainClient,
  ExplainOpts,
  GeminiExplainOptions,
  WordExplanationContent,
} from "./llm/explainWord";

export { loadConfig } from "./config";
export type {
  Config,
  GeminiConfig,
  CfAccessConfig,
} from "./config";

export {
  StatusSchema,
  MaterialTypeSchema,
  UserRoleSchema,
  ManageableRoleSchema,
  SetUserRoleRequestSchema,
  PreprovisionUserRequestSchema,
  ArticleSchema,
  ParagraphSchema,
  WordSchema,
  WordExplanationSchema,
  WordExplanationWithSourceSchema,
  WordLookupRequestSchema,
  WordLookupResponseSchema,
} from "./schemas";
export type {
  Status,
  MaterialType,
  UserRole,
  ManageableRole,
  Article,
  Paragraph,
  Word,
  WordExplanation,
  WordExplanationWithSource,
  WordLookupRequest,
  WordLookupResponse,
} from "./schemas";

export * from "./repo/vocabulary";
export * from "./wordbank";
export * from "./wordbankAudio";
export * from "./scenarios";
export * from "./scenarioStudio/contracts";
export * from "./scenarioStudio/repository";
export * from "./scenarioStudio/story";
export * from "./scenarioStudio/storage";
export * from "./scenarioStudio/providers";
export * from "./scenarioStudio/processor";
