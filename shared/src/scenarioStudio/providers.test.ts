import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { WordbankEntrySchema } from "../wordbank";
import { ImageModelSchema, type ImageModel } from "../illustrations/catalog";
import type { ImageRequest } from "../illustrations/providers";
import { SERENA_PROFILE, compileScenarioStoryPrompt, parseScenarioStory, createScenarioStudioProviders, normalizeStudioImage, validateStudioMp3Bytes } from "./providers";
import { emptyStudioDraft, studioCompiledPrompt } from "./contracts";
const e = (word: string) => WordbankEntrySchema.parse({ id: 1, guid: randomUUID(), word });
const promptInput = { titleZh: "午後客廳", targets: [{ word: "read", teachingPos: "v", senseZh: "閱讀" }], imageSettings: { style: "3D cozy", annotationStyle: "write read", textRules: "print vocabulary" } };
const model = ImageModelSchema.parse({ id: "test", label: "test", enabled: true, apiModel: "test", provider: "openai", adapter: "openai-images-v1", pricingProfileId: "test",
  profiles: Object.fromEntries(["cover", "reference", "paragraph"].map(k => [k, { deliveryAspectRatio: "16:9", providerOptions: { size: "1536x1024", quality: "low" } }])) });
describe("情境 studio 供應商與文字解析（完全使用假 client）", () => {
  it("十段提示詞中 target由GUID選詞建立，文字要求不能覆寫無標籤底圖", () => {
    const draft = emptyStudioDraft("living-room");
    draft.targets = [{ ...promptInput.targets[0], teachingPos: "v", entryGuid: randomUUID(), list: "basic", interaction: { label: null, object: null } }];
    draft.promptSettings.blocks.annotationStyle = "write read";
    draft.promptSettings.blocks.textRules = "print vocabulary";
    const prompt = studioCompiledPrompt(draft);
    expect(prompt.match(/^\[/gm)).toHaveLength(10);
    expect(prompt).toContain("read (v): 閱讀");
    expect(prompt).not.toContain("print vocabulary");
    expect(prompt).not.toContain("write read");
    expect(prompt).toContain("No words, lettering");
    expect(compileScenarioStoryPrompt(promptInput, [e("read")])).toContain("For EVERY English token");
  });
  it("詞形提議只連接DB真GUID，unknown/歧義保留baseWords待人工修", () => {
    const read = e("read"), book = e("book"), a1 = e("a"), a2 = e("a");
    const result = parseScenarioStory(JSON.stringify({ sentences: [{ en: "Reads a book.", zh: "讀一本書。", links: [{ surface: "Reads", word: "read" }, { surface: "a", word: "a" }, { surface: "book", word: "book" }] },
      { en: "Mystery.", zh: "神秘。", links: [{ surface: "Mystery", word: "missing" }] }] }), [read, book, a1, a2], [{ entryGuid: read.guid }, { entryGuid: a1.guid }]);
    expect(result.story.sentences[0].wordLinks).toEqual([{ surface: "Reads", word: "read", entryGuid: read.guid, isTarget: true, start: 0, end: 5 }, { surface: "book", word: "book", entryGuid: book.guid, isTarget: false, start: 8, end: 12 }]);
    expect(result.story.sentences[0].baseWords).toEqual(["read", "a", "book"]);
    expect(result.issues.map(i => i.reason)).toEqual(["ambiguous", "unknown"]);
    expect(result.missingTargetGuids).toEqual([a1.guid]);
  });
  it("故事提示使用實際詞數與教學詞性，要求自然融入並允許連貫小段", () => {
    const targets = Array.from({ length: 25 }, (_, i) => ({ word: `word${i}`, teachingPos: i < 15 ? "n" : i < 20 ? "adj" : "v", senseZh: "情境詞義" }));
    const prompt = compileScenarioStoryPrompt({ ...promptInput, targets }, []);
    expect(prompt).toContain("all 25 target words naturally");
    expect(prompt).toContain("word24 (v; 情境詞義)");
    expect(prompt).toContain("two short connected parts");
    expect(prompt).not.toContain("all 15 target words");
    expect(compileScenarioStoryPrompt(promptInput, [])).toContain("all 1 target words naturally");
  });
  it("拒絕省略token或順序錯配，收英文收繁中逐句建立全文", () => {
    const read = e("read");
    expect(() => parseScenarioStory('{"sentences":[{"en":"Reads books.","zh":"讀書。","links":[{"surface":"Reads","word":"read"}]}]}', [read], [])).toThrow("每個英文");
    expect(() => parseScenarioStory('{"sentences":[{"en":"Reads.","zh":"讀書。","links":[{"surface":"Read","word":"read"}]}]}', [read], [])).toThrow("順序");
    const result = parseScenarioStory('```json\n{"sentences":[{"en":"Reads.","zh":"讀書。","links":[{"surface":"Reads","word":"read"}]}]}\n```', [read], []);
    expect(result.story.textEn).toBe("Reads."); expect(result.story.textZh).toBe("讀書。");
  });
  it("故事可提供分段ID且不改全文，錯誤分段不接受；省略時不新增預設欄位", () => {
    const read = e("read");
    const sentences = ["閱讀。", "再讀一次。"].map(zh => ({ en: "Reads.", zh, links: [{ surface: "Reads", word: "read" }] }));
    const result = parseScenarioStory(JSON.stringify({ sentences, paragraphBreakAfterSentenceIds: ["sentence-1"] }), [read], []);
    expect(result.story.paragraphBreakAfterSentenceIds).toEqual(["sentence-1"]);
    expect(result.story.textEn).toBe("Reads. Reads.");
    expect(result.story.textZh).toBe("閱讀。再讀一次。");
    expect(parseScenarioStory(JSON.stringify({ sentences }), [read], []).story).not.toHaveProperty("paragraphBreakAfterSentenceIds");
    for (const ids of [["sentence-2"], ["wrong"], ["sentence-1", "sentence-1"]]) expect(() => parseScenarioStory(JSON.stringify({ sentences, paragraphBreakAfterSentenceIds: ids }), [read], [])).toThrow("分段");
  });
  it("OpenAI故事使用selected model而非fallback模型，單次請求不internalretry", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"sentences":[]}' }] }] }), { status: 200 }));
    const client = createScenarioStudioProviders({ openaiApiKey: "fake-key", qwenEndpoint: "http://localhost:8000/v1/audio/speech", fetcher });
    expect(await client.story({ provider: "openai", model: "selected" }, "prompt")).toBe('{"sentences":[]}');
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("selected"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("Google故事使用authorizer，網路失敗標uncertain且不洩漏憑證", async () => {
    const fetcher = vi.fn(async () => { throw new Error("secret-key"); });
    const client = createScenarioStudioProviders({ googleAuth: { headers: async () => ({ "x-goog-api-key": "secret-key" }), endpoint: () => "http://mock-google", describe: () => "fake" }, qwenEndpoint: "http://localhost:8000", fetcher });
    await expect(client.story({ provider: "google", model: "selected" }, "prompt")).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.story({ provider: "google", model: "selected" }, "prompt")).rejects.not.toThrow("secret-key");
  });
  it("Serena整段MP3使用固定endpoint與精確profile/text，沒有拼接或重試", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([73, 68, 51, 1]), { headers: { "content-type": "audio/mpeg" } }));
    const validateAudio = vi.fn(async () => ({ durationSeconds: 31.9 }));
    const client = createScenarioStudioProviders({ qwenEndpoint: "http://localhost:8000/v1/audio/speech", fetcher, validateAudio });
    const result = await client.speech({ ...SERENA_PROFILE, lang_code: "English", response_format: "mp3" }, "The whole story.");
    expect(result.durationSeconds).toBe(31.9); expect(result.bytes.length).toBe(4);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ ...SERENA_PROFILE, input: "The whole story.", stream: false });
    expect(fetcher.mock.calls[0][0]).toBe("http://localhost:8000/v1/audio/speech"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("TTS錯誤JSON/下載失敗與MP3無效不偽裝成功", async () => {
    const validateAudio = vi.fn(async () => { throw new Error("bad MP3"); });
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    const client = createScenarioStudioProviders({ qwenEndpoint: "http://localhost:8000", fetcher, validateAudio });
    await expect(client.speech({ ...SERENA_PROFILE, lang_code: "English", response_format: "mp3" }, "story")).rejects.toThrow("文字而非音訊");
    expect(validateAudio).not.toHaveBeenCalled();
    await expect(validateStudioMp3Bytes(Buffer.from("bad"))).rejects.toThrow();
  });
  it("3:2來源contain成16:9保留整幅，adapter使用cover無article planner", async () => {
    const source = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const generate = vi.fn(async (_model: ImageModel, _request: ImageRequest) => ({ bytes: source, mimeType: "image/png" as const, providerRequestId: "request", usage: { tokens: 10 } }));
    const client = createScenarioStudioProviders({ qwenEndpoint: "http://localhost:8000", adapters: { "openai-images-v1": { generate } } });
    const result = await client.image(model, "prompt", "local-idempotency");
    expect(result.width).toBe(1600); expect(result.height).toBe(900); expect(result.providerRequestId).toBe("request");
    expect(generate.mock.calls[0][1]).toMatchObject({ purpose: "cover", prompt: "prompt", references: [], idempotencyKey: "local-idempotency" });
    const { data, info } = await sharp(result.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)]).toEqual([248, 244, 237]);
    const center = (450 * info.width + 800) * info.channels;
    expect([...data.subarray(center, center + 3)]).toEqual([255, 0, 0]);
    await expect(normalizeStudioImage(Buffer.from("bad"))).rejects.toThrow();
  });
});
