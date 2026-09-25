import type { Authorizer } from "./llm/auth";
import { GeminiTranslateClient, type TranslateClient } from "./llm/translate";
import { GeminiExplainClient, type ExplainClient } from "./llm/explainWord";
import { GeminiTtsClient, type TtsClient } from "./llm/tts";
import { OpenAITextClient, OpenAITtsClient } from "./llm/openai";
import type { GenerationSettings } from "./generationSettings";

export interface GenerationCredentials {
  googleAuth?: Authorizer;
  openaiApiKey?: string;
}

function googleAuth(credentials: GenerationCredentials): Authorizer {
  if (!credentials.googleAuth) throw new Error("Google Gemini credentials are not configured");
  return credentials.googleAuth;
}

function openaiKey(credentials: GenerationCredentials): string {
  if (!credentials.openaiApiKey) throw new Error("OpenAI API key is not configured");
  return credentials.openaiApiKey;
}

export function createTranslateClient(
  choice: GenerationSettings["text"],
  credentials: GenerationCredentials,
): TranslateClient {
  return choice.provider === "google"
    ? new GeminiTranslateClient({ auth: googleAuth(credentials), model: choice.model })
    : new OpenAITextClient({ apiKey: openaiKey(credentials), model: choice.model, responseFormat: "text" });
}

export function createExplainClient(
  choice: GenerationSettings["text"],
  credentials: GenerationCredentials,
): ExplainClient {
  return choice.provider === "google"
    ? new GeminiExplainClient({ auth: googleAuth(credentials), model: choice.model })
    : new OpenAITextClient({ apiKey: openaiKey(credentials), model: choice.model });
}

export function createTtsClient(
  choice: GenerationSettings["speech"],
  credentials: GenerationCredentials,
): TtsClient {
  return choice.provider === "google"
    ? new GeminiTtsClient({ auth: googleAuth(credentials), model: choice.model })
    : new OpenAITtsClient({ apiKey: openaiKey(credentials), model: choice.model });
}
