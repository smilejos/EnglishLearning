import { describe, it, expect } from "vitest";
import { apiKeyAuthorizer } from "./auth";

describe("apiKeyAuthorizer", () => {
  it("以 x-goog-api-key 標頭帶出 API key", async () => {
    const auth = apiKeyAuthorizer("secret-key");
    expect(await auth.headers()).toEqual({ "x-goog-api-key": "secret-key" });
    expect(auth.describe()).toBe("API key");
  });
});
