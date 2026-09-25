import { describe, expect, it, vi } from "vitest";
import { OpenAITextClient, OpenAITtsClient } from "./openai";
import type { ExplainClient } from "./explainWord";
import type { TranslateClient } from "./translate";
import type { TtsClient } from "./tts";

describe("OpenAI clients (mocked transport)", () => {
  it("completes JSON text for both translation and explanation contracts", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      output: [
        { type: "reasoning", content: [] },
        { type: "message", content: [{ type: "output_text", text: '{"value":' }, { type: "output_text", text: '"好"}' }] },
      ],
    })));
    const client: TranslateClient & ExplainClient = new OpenAITextClient({
      apiKey: "test-secret", model: "gpt-5-mini", fetcher,
    });
    expect(await client.complete("Return JSON")).toBe('{"value":"好"}');
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer test-secret");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      model: "gpt-5-mini", input: "Return JSON", text: { format: { type: "json_object" } },
    });
  });

  it("translation permits a JSON array response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '["你好"]' }] }],
    })));
    const client = new OpenAITextClient({ apiKey: "x", model: "gpt-4.1-mini", responseFormat: "text", fetcher });
    expect(await client.complete("Return a JSON array")).toBe('["你好"]');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      model: "gpt-4.1-mini", input: "Return a JSON array",
    });
  });

  it("preserves HTTP status for quota handling without exposing upstream text", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("test-secret private prompt", { status: 429 }));
    const client = new OpenAITextClient({ apiKey: "test-secret", model: "gpt-5-mini", fetcher });
    await expect(client.complete("prompt")).rejects.toMatchObject({ status: 429 });
    await expect(client.complete("prompt")).rejects.toThrow("OpenAI request failed (429)");
  });

  it("rejects incomplete and empty text responses", async () => {
    const incomplete = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
    })));
    await expect(new OpenAITextClient({ apiKey: "x", model: "m", fetcher: incomplete }).complete("p"))
      .rejects.toThrow("incomplete");
    const empty = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [] })));
    await expect(new OpenAITextClient({ apiKey: "x", model: "m", fetcher: empty }).complete("p"))
      .rejects.toThrow("no text");
  });

  it("wraps speech PCM in the project's 24 kHz WAV format", async () => {
    const pcm = Buffer.from([0, 0, 1, 0, 255, 127]);
    const fetcher = vi.fn().mockResolvedValue(new Response(pcm));
    const client: TtsClient = new OpenAITtsClient({ apiKey: "test-secret", model: "gpt-4o-mini-tts", fetcher });
    const result = await client.synthesize("Hello", "alloy");
    expect(result.pcm).toEqual(pcm);
    expect(result.wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(result.wav.readUInt32LE(24)).toBe(24000);
    expect(result.wav.subarray(44)).toEqual(pcm);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/audio/speech");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      model: "gpt-4o-mini-tts", input: "Hello", voice: "alloy", response_format: "pcm",
    });
  });

  it("rejects empty or misaligned PCM", async () => {
    for (const bytes of [Buffer.alloc(0), Buffer.from([1])]) {
      const fetcher = vi.fn().mockResolvedValue(new Response(bytes));
      await expect(new OpenAITtsClient({ apiKey: "x", model: "m", fetcher }).synthesize("x", "alloy"))
        .rejects.toThrow("invalid PCM");
    }
  });
});
