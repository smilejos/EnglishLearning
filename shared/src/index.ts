// @el/shared — 共用契約與工具。
// db pool、repositories 於 Phase 2+ 陸續加入。

export { normalizeWord } from "./normalizeWord";

export { createPool, ping } from "./db";

export * from "./repo";

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
} from "./llm/auth";
export type { Authorizer } from "./llm/auth";
export { pcmToWav, pcmDurationSec, TTS_FORMAT } from "./llm/wav";
export type { WavFormat } from "./llm/wav";

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
  Article,
  Paragraph,
  Word,
  WordExplanation,
  WordExplanationWithSource,
  WordLookupRequest,
  WordLookupResponse,
} from "./schemas";
