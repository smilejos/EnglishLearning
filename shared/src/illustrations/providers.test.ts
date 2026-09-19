import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadImageModelCatalog } from "./catalog";
import {
  OpenAIImageAdapter,
  GeminiImageAdapter,
  GeminiVisualPlanner,
  ImageProviderError,
} from "./providers";
import { apiKeyAuthorizer } from "../llm/auth";
const catalog = loadImageModelCatalog(
  new URL("../../../config/image-models.json", import.meta.url).pathname,
  new URL("../../../config/image-pricing.json", import.meta.url).pathname,
);
const request = {
  purpose: "cover" as const,
  prompt: "A cat",
  references: [],
  idempotencyKey: "test",
};
describe("image adapters use mocked transport only", () => {
  it("retains 400 field diagnostics while redacting credentials and URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      status: "INVALID_ARGUMENT",
      message: "Unsupported responseJsonSchema; credential=my-private-key https://example.com/?key=hidden",
      details: [{ fieldViolations: [{ field: "generationConfig.responseJsonSchema", description: "Unsupported constraint" }] }],
      unrelated: "must-not-be-persisted",
    } }), { status: 400 }));
    try {
      await new GeminiVisualPlanner(apiKeyAuthorizer("my-private-key"), fetcher).plan(catalog.planner, "plan");
      expect.fail("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageProviderError);
      expect(String(error)).toContain("INVALID_ARGUMENT");
      expect(String(error)).toContain("generationConfig.responseJsonSchema");
      expect(String(error)).toContain("Unsupported constraint");
      expect(String(error)).not.toContain("my-private-key");
      expect(String(error)).not.toContain("hidden");
      expect(String(error)).not.toContain("must-not-be-persisted");
      expect((error as ImageProviderError).retryable).toBe(false);
    }
  });
  it.each([401, 403, 429, 500])("keeps HTTP %s even when the error response is HTML", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>upstream error</html>", { status }));
    await expect(new GeminiVisualPlanner(apiKeyAuthorizer("secret"), fetcher).plan(catalog.planner, "plan"))
      .rejects.toThrow(`(${status})`);
  });
  it("preserves usage for malformed planner JSON so validation can retry safely", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "invalid JSON" }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
        ),
      );
    const result = await new GeminiVisualPlanner(
      apiKeyAuthorizer("secret"),
      fetcher,
    ).plan(catalog.planner, "plan");
    expect(result.value).toBeNull();
    expect(result.validationError).toContain("不是有效 JSON");
    const config = JSON.parse(fetcher.mock.calls[0][1].body).generationConfig;
    expect(config.responseJsonSchema.required).toContain("paragraphs");
    expect(config.responseJsonSchema.properties.paragraphs.items.required).toContain("skipReason");
    expect(config.responseJsonSchema.additionalProperties).toBe(false);
    expect(result.usage).toEqual({
      promptTokenCount: 10,
      candidatesTokenCount: 5,
    });
  });
  it.each([
    ["MAX_TOKENS", "{}", "token 上限"],
    ["SAFETY", "", "未回傳文字"],
  ])("reports planner %s without losing billing usage", async (finishReason, text, message) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 12 },
    })));
    const result = await new GeminiVisualPlanner(apiKeyAuthorizer("secret"), fetcher).plan(catalog.planner, "plan");
    expect(result.validationError).toContain(message);
    expect(result.usage).toEqual({ promptTokenCount: 12 });
  });
  it("uses the exact OpenAI snapshot/options and normalizes base64", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] }), {
        headers: { "x-request-id": "req1" },
      }),
    );
    const out = await new OpenAIImageAdapter("secret", fetcher).generate(
      catalog.models[0],
      request,
    );
    expect(out.bytes.toString()).toBe("hello");
    expect(out.providerRequestId).toBe("req1");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      model: "gpt-image-2-2026-04-21",
      size: "1536x1024",
      quality: "medium",
      n: 1,
    });
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty(
      "Idempotency-Key",
    );
  });
  it("uses image edits when a reference is supplied", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] })),
      );
    await new OpenAIImageAdapter("secret", fetcher).generate(
      catalog.models[0],
      {
        ...request,
        references: [{ bytes: Buffer.from("ref"), mimeType: "image/png" }],
      },
    );
    expect(fetcher.mock.calls[0][0]).toMatch(/images\/edits$/);
    expect(fetcher.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });
  it("selects the Gemini image, ignoring thought parts", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "reasoning", thought: true },
                  {
                    inlineData: { data: "aGVsbG8=", mimeType: "image/webp" },
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    const result = await new GeminiImageAdapter(
      apiKeyAuthorizer("secret"),
      fetcher,
    ).generate(catalog.models[1], request);
    expect(result.mimeType).toBe("image/webp");
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.imageConfig
        .imageSize,
    ).toBe("1K");
  });
  it("redacts upstream error bodies and treats network errors as uncertain", async () => {
    const adapter = new OpenAIImageAdapter(
      "secret",
      vi
        .fn()
        .mockResolvedValue(
          new Response("secret private error", { status: 429 }),
        ),
    );
    await expect(adapter.generate(catalog.models[0], request)).rejects.toThrow(
      "429",
    );
    await expect(
      new OpenAIImageAdapter(
        "secret",
        vi.fn().mockRejectedValue(new Error("secret")),
      ).generate(catalog.models[0], request),
    ).rejects.toMatchObject({ uncertain: true });
    expect(new ImageProviderError(400).retryable).toBe(false);
  });
});
