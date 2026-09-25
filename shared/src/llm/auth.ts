import { GoogleAuth } from "google-auth-library";
import type { GeminiConfig } from "../config";

/** Vertex AI REST 請求的認證與端點。 */
export interface Authorizer {
  headers(): Promise<Record<string, string>>;
  endpoint(model: string): string;
  describe(): string;
}

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash-preview-tts": "gemini-2.5-flash-tts",
  "gemini-2.5-pro-preview-tts": "gemini-2.5-pro-tts",
};

function vertexEndpoint(project: string | undefined, location: string, model: string): string {
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI requests");
  const modelId = MODEL_ALIASES[model] ?? model;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(modelId))
    throw new Error("Invalid Vertex AI model ID");
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;
}

/** 以可呼叫 Vertex AI 的 Google Cloud API key 驗證。 */
export function apiKeyAuthorizer(apiKey: string, project?: string, location = "global"): Authorizer {
  return {
    headers: async () => ({ "x-goog-api-key": apiKey }),
    endpoint: (model) => vertexEndpoint(project, location, model),
    describe: () => "API key",
  };
}

/** 以 Application Default Credentials 取得 OAuth token；library 會快取及更新 token。 */
export function serviceAccountAuthorizer(project?: string, location = "global"): Authorizer {
  const auth = new GoogleAuth({ scopes: [SCOPE] });
  return {
    async headers() {
      if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI requests");
      const client = await auth.getClient();
      const { token } = await client.getAccessToken();
      if (!token) throw new Error("Failed to obtain a Google Cloud access token");
      return { Authorization: `Bearer ${token}` };
    },
    endpoint: (model) => vertexEndpoint(project, location, model),
    describe: () => "ADC",
  };
}

/** 三個後端行程共用的選擇順序：有效 API key 優先，其次 ADC。 */
export function createVertexAuthorizer(config: GeminiConfig): Authorizer | undefined {
  if (!config.project) return undefined;
  if (config.apiKey && config.apiKey !== "dev-placeholder")
    return apiKeyAuthorizer(config.apiKey, config.project, config.location);
  if (config.credentialsPath) return serviceAccountAuthorizer(config.project, config.location);
  return undefined;
}
