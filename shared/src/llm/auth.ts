// Gemini REST 請求的授權者（移植自 article2speech/builder/src/auth.ts，內容不變）。
import { GoogleAuth } from "google-auth-library";

/** 提供 Gemini REST 請求所需的授權標頭。 */
export interface Authorizer {
  headers(): Promise<Record<string, string>>;
  describe(): string;
}

/** 以 Gemini API key（AI Studio）驗證。 */
export function apiKeyAuthorizer(apiKey: string): Authorizer {
  return {
    headers: async () => ({ "x-goog-api-key": apiKey }),
    describe: () => "API key",
  };
}

// Gemini Developer API 接受帶此 scope 的 service-account OAuth token。
const SCOPE = "https://www.googleapis.com/auth/generative-language";

/**
 * 以 Google service account 透過 Application Default Credentials
 * （GOOGLE_APPLICATION_CREDENTIALS）驗證；library 會快取並更新 token。
 */
export function serviceAccountAuthorizer(): Authorizer {
  const auth = new GoogleAuth({ scopes: [SCOPE] });
  return {
    async headers() {
      const client = await auth.getClient();
      const { token } = await client.getAccessToken();
      if (!token)
        throw new Error("Failed to obtain a service-account access token");
      return { Authorization: `Bearer ${token}` };
    },
    describe: () => "service account",
  };
}
