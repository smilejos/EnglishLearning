import { describe, it, expect } from "vitest";
import { apiKeyAuthorizer, createVertexAuthorizer, serviceAccountAuthorizer } from "./auth";

describe("apiKeyAuthorizer", () => {
  it("以 x-goog-api-key 標頭帶出 API key", async () => {
    const auth = apiKeyAuthorizer("secret-key");
    expect(await auth.headers()).toEqual({ "x-goog-api-key": "secret-key" });
    expect(auth.describe()).toBe("API key");
  });
});

describe("Vertex AI authorizer", () => {
  const config = {
    project: "my-project",
    location: "global",
    apiKey: "secret-key",
    ttsModel: "gemini-2.5-flash-tts",
    translateModel: "gemini-2.5-flash",
    explainModel: "gemini-2.5-flash",
    voiceEn: "Kore",
    voiceZh: "Kore",
  };

  it("global 與區域端點使用正確主機、project、location、model", () => {
    expect(createVertexAuthorizer(config)?.endpoint("gemini-2.5-flash")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-2.5-flash:generateContent",
    );
    expect(createVertexAuthorizer({ ...config, location: "us-central1" })?.endpoint("gemini-2.5-flash")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
  });

  it("既有 TTS preview 快照映射至 Vertex model ID", () => {
    expect(createVertexAuthorizer(config)?.endpoint("gemini-2.5-flash-preview-tts")).toContain("/models/gemini-2.5-flash-tts:generateContent");
    expect(createVertexAuthorizer(config)?.endpoint("gemini-2.5-pro-preview-tts")).toContain("/models/gemini-2.5-pro-tts:generateContent");
  });

  it("忽略佔位 key；只有提供憑證檔時才宣告 ADC 可用", () => {
    expect(createVertexAuthorizer({ ...config, apiKey: "dev-placeholder" })).toBeUndefined();
    expect(createVertexAuthorizer({ ...config, apiKey: "dev-placeholder", credentialsPath: "/run/google/key.json" })?.describe()).toBe("ADC");
    expect(createVertexAuthorizer({ ...config, project: undefined })).toBeUndefined();
  });

  it("缺少專案時在取得 ADC token 前回報設定錯誤", async () => {
    await expect(serviceAccountAuthorizer().headers()).rejects.toThrow(/GOOGLE_CLOUD_PROJECT/);
  });
});
