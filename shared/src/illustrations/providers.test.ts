import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadImageModelCatalog } from "./catalog";
import {
  OpenAIImageAdapter,
  GeminiImageAdapter,
  GeminiVisualPlanner,
  OpenAIVisualPlanner,
  ImageProviderError,
  stagedPlannerPrompt,
} from "./providers";
import type { Authorizer } from "../llm/auth";
import { examplePlan, exampleSource } from "./testFixtures";
import { visualPlanJsonSchema } from "./plan-schema";
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
const vertexEndpoint = (model: string) =>
  `https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/${model}:generateContent`;
const vertexAuthForKey = (key: string): Authorizer => ({
  endpoint: vertexEndpoint,
  headers: async () => ({ "x-goog-api-key": key }),
  describe: () => "test key",
});
describe("staged visual planning guidance", () => {
  const source = {
    ...exampleSource,
    title: "Mia, Leo and the lighthouse",
    paragraphs: [
      { id: 1, idx: 0, text: "Mia and Leo walk to the old lighthouse with their spotted dog." },
      { id: 2, idx: 1, text: "The dog waits beside the lighthouse while Mia looks at the bay." },
    ],
  };

  it("asks for separate stable traits of every relevant subject type in one reference sheet", () => {
    const prompt = stagedPlannerPrompt(source, "reference", null);
    expect(prompt).toContain("several people, animals, buildings, places, or a mixture");
    expect(prompt).toContain("Do not invent subjects");
    expect(prompt).toContain("hair color, skin tone");
    expect(prompt).toContain("coat or surface color, markings");
    expect(prompt).toContain("roof, windows, entrance");
    expect(prompt).toContain("layout, fixed landmarks");
    expect(prompt).toContain("clearly separated neutral studies");
    expect(prompt).toContain("Mia and Leo walk to the old lighthouse");
  });

  it("uses each scene's subjects and actions while preserving matching identities", () => {
    const prompt = stagedPlannerPrompt(source, "paragraph", "Mia: red coat; Leo: blue coat; lighthouse: stone tower", 2);
    expect(prompt).toContain("Match every recurring subject to its own identity and traits");
    expect(prompt).toContain("include only subjects present in the requested scene");
    expect(prompt).toContain("The dog waits beside the lighthouse");
    expect(prompt).toContain("Mia: red coat; Leo: blue coat; lighthouse: stone tower");
    expect(prompt).toContain("Set visualBible to an empty string");
  });
});
describe("image adapters use mocked transport only", () => {
  it("uses OpenAI structured Responses and preserves planner usage", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(examplePlan) }] }],
      usage: { input_tokens: 42, output_tokens: 28, total_tokens: 70 },
    })));
    const result = await new OpenAIVisualPlanner("secret", fetcher).plan(catalog.planner, "plan");
    expect(result.value).toEqual(examplePlan);
    expect(result.usage).toMatchObject({
      input_tokens: 42, output_tokens: 28,
      promptTokenCount: 42, candidatesTokenCount: 28, thoughtsTokenCount: 0,
    });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const init = fetcher.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: catalog.planner.apiModel,
      input: "plan",
      max_output_tokens: catalog.planner.maxOutputTokens,
      text: { format: { type: "json_schema", name: "visual_plan", strict: true } },
    });
    expect(body.text.format.schema).toEqual(visualPlanJsonSchema);
  });

  it("returns validation error with usage for incomplete or malformed OpenAI plans", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }],
      usage: { input_tokens: 12, output_tokens: 34 },
    })));
    const result = await new OpenAIVisualPlanner("secret", fetcher).plan(catalog.planner, "plan");
    expect(result.value).toBeNull();
    expect(result.validationError).toContain("token 上限");
    expect(result.usage).toMatchObject({ promptTokenCount: 12, candidatesTokenCount: 34 });
  });

  it("keeps OpenAI planner HTTP errors in the existing provider error contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "bad schema with sk-secret and https://example.com/internal" },
    }), { status: 400 }));
    await expect(new OpenAIVisualPlanner("sk-secret", fetcher).plan(catalog.planner, "plan"))
      .rejects.toMatchObject({ status: 400, retryable: false });
  });

  it("sends a structural planner schema without nested count or numeric bounds", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(examplePlan) }] } }],
    })));
    const result = await new GeminiVisualPlanner(vertexAuthForKey("secret"), fetcher)
      .plan(catalog.planner, "plan");
    expect(result.value).toEqual(examplePlan);
    expect(fetcher.mock.calls[0][0]).toBe(vertexEndpoint(catalog.planner.apiModel));
    expect(fetcher.mock.calls[0][0]).not.toContain("generativelanguage.googleapis.com");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "plan" }] }]);
    const config = body.generationConfig;
    expect(config.responseMimeType).toBe("application/json");
    const schema = config.responseJsonSchema;
    const assertStructural = (node: any): void => {
      for (const key of ["minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength"])
        expect(node).not.toHaveProperty(key);
      if (node.type === "object") {
        expect(node.required).toEqual(Object.keys(node.properties));
        expect(node.additionalProperties).toBe(false);
        Object.values(node.properties).forEach(assertStructural);
      } else if (node.type === "array") {
        expect(node.items).toBeDefined();
        assertStructural(node.items);
      }
      node.anyOf?.forEach(assertStructural);
    };
    assertStructural(schema);
    expect(schema.properties.paragraphs.items.properties).toMatchObject({
      paragraphId: { type: "integer" }, idx: { type: "integer" },
      required: { type: "boolean" },
      scene: { anyOf: [{ type: "object" }, { type: "null" }] },
      teachingTargets: { type: "array", items: { type: "object" } },
    });
  });
  it("Gemini 3.8 Flash planning uses thinkingLevel on the Vertex endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(examplePlan) }] } }],
    })));
    const profile = catalog.plannerProfiles?.find((item) => item.apiModel === "gemini-3.8-flash");
    expect(profile).toBeDefined();
    await new GeminiVisualPlanner(vertexAuthForKey("secret"), fetcher).plan(profile!, "plan");
    expect(fetcher.mock.calls[0][0]).toBe(vertexEndpoint("gemini-3.8-flash"));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });
  it("retains 400 field diagnostics while redacting credentials and URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      status: "INVALID_ARGUMENT",
      message: "Unsupported responseJsonSchema; credential=my-private-key https://example.com/?key=hidden",
      details: [{ fieldViolations: [{ field: "generationConfig.responseJsonSchema", description: "Unsupported constraint" }] }],
      unrelated: "must-not-be-persisted",
    } }), { status: 400 }));
    try {
      await new GeminiVisualPlanner(vertexAuthForKey("my-private-key"), fetcher).plan(catalog.planner, "plan");
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
    await expect(new GeminiVisualPlanner(vertexAuthForKey("secret"), fetcher).plan(catalog.planner, "plan"))
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
      vertexAuthForKey("secret"),
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
    const result = await new GeminiVisualPlanner(vertexAuthForKey("secret"), fetcher).plan(catalog.planner, "plan");
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
      vertexAuthForKey("secret"),
      fetcher,
    ).generate(catalog.models[1], request);
    expect(result.mimeType).toBe("image/webp");
    expect(fetcher.mock.calls[0][0]).toBe(vertexEndpoint(catalog.models[1].apiModel));
    expect(fetcher.mock.calls[0][0]).not.toContain("generativelanguage.googleapis.com");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).contents).toEqual([
      { role: "user", parts: [{ text: request.prompt }] },
    ]);
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
