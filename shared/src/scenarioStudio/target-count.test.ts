import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "../repo/types";
import { ScenarioContentSchema, scenarioCanonicalJson, scenarioRevisionHash, scenarioHash, type ScenarioContent, type ScenarioMedia } from "../scenarios";
import { emptyStudioDraft, StudioEditableSchema, StudioStorySchema } from "./contracts";
import { validateStudioTargets } from "./story";

function content(count: number, nounsOnly = false): ScenarioContent {
  const targets = Array.from({ length: count }, (_, i) => ({ word: `word${String.fromCharCode(97 + i)}`, entryGuid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    list: "basic" as const, teachingPos: nounsOnly || i < 15 ? "n" as const : i < 20 ? "adj" as const : "v" as const, senseZh: "測試詞義", interaction: { label: { x: .1, y: .2 }, object: { x: .3, y: .4 } } }));
  const en = targets.map(t => t.word).join(" ") + ".";
  let start = 0;
  const wordLinks = targets.map(t => { const link = { surface: t.word, word: t.word, entryGuid: t.entryGuid, isTarget: true, start, end: start + t.word.length }; start = link.end + 1; return link; });
  return { schemaVersion: 1, scenarioKey: "target-count", revision: 1, titleZh: "詞數測試", vocabularyFilter: { system: "list", levels: ["basic", "advance"] }, targetCount: count, targets,
    story: { language: "en", translationLanguage: "zh-Hant", textEn: en, textZh: "測試故事。", sentences: [{ id: "s1", en, zh: "測試故事。", wordLinks }] } };
}

describe("情境實際詞數與舊教材相容", () => {
  it("舊15詞內容不增加預設欄位或改變媒體／內容hash", () => {
    const legacy = content(15);
    legacy.targets[13].teachingPos = "adj"; legacy.targets[14].teachingPos = "v";
    const media: ScenarioMedia = { image: { relativePath: `scenarios/target-count/1/${"1".repeat(64)}.png`, sha256: "1".repeat(64), bytes: 1, contentType: "image/png", width: 1600, height: 900 },
      audio: { relativePath: `scenarios/target-count/1/${"2".repeat(64)}.mp3`, sha256: "2".repeat(64), bytes: 1, contentType: "audio/mpeg", textSha256: scenarioHash(legacy.story.textEn) } };
    expect(ScenarioContentSchema.parse(legacy)).toEqual(legacy);
    // 舊hash以儲存的原始JSON內容和媒體建立；新契約解析不得重寫它。
    expect(scenarioRevisionHash(ScenarioContentSchema.parse(legacy), media)).toBe(scenarioHash(scenarioCanonicalJson({ content: legacy, media })));
  });
  it("接受25詞與零動詞／零形容詞組，不把15n+5adj+5v當硬配額", () => {
    expect(ScenarioContentSchema.parse(content(25)).targetCount).toBe(25);
    expect(ScenarioContentSchema.parse(content(25, true)).targets.every(t => t.teachingPos === "n")).toBe(true);
    expect(ScenarioContentSchema.parse(content(1, true)).targetCount).toBe(1);
  });
  it("可選分段保留全文／音檔文字hash，拒絕不存在、末句或重複分段ID", () => {
    const split = content(1);
    const second = { ...structuredClone(split.story.sentences[0]), id: "s2" };
    split.story.sentences.push(second);
    split.story.textEn = split.story.sentences.map(s => s.en).join(" ");
    split.story.textZh = split.story.sentences.map(s => s.zh).join("");
    const originalHash = scenarioHash(split.story.textEn);
    split.story.paragraphBreakAfterSentenceIds = ["s1"];
    expect(ScenarioContentSchema.parse(split).story.paragraphBreakAfterSentenceIds).toEqual(["s1"]);
    expect(StudioStorySchema.parse(split.story).paragraphBreakAfterSentenceIds).toEqual(["s1"]);
    expect(scenarioHash(split.story.textEn)).toBe(originalHash);
    for (const ids of [[], ["missing"], ["s2"], ["s1", "s1"], Array.from({ length: 100 }, () => "s1")]) {
      expect(ScenarioContentSchema.safeParse({ ...split, story: { ...split.story, paragraphBreakAfterSentenceIds: ids } }).success).toBe(false);
      expect(StudioStorySchema.safeParse({ ...split.story, paragraphBreakAfterSentenceIds: ids }).success).toBe(false);
    }
    expect(StudioStorySchema.parse(content(1).story)).not.toHaveProperty("paragraphBreakAfterSentenceIds");
  });
  it("拒絕詞數不符、26詞、空教材、重複GUID或重複字形", () => {
    expect(() => ScenarioContentSchema.parse({ ...content(25), targetCount: 24 })).toThrow("目標數量");
    for (const count of [0, 26]) expect(ScenarioContentSchema.safeParse(content(count)).success).toBe(false);
    for (const field of ["entryGuid", "word"] as const) {
      const duplicate = content(25); duplicate.targets[1][field] = duplicate.targets[0][field];
      expect(() => ScenarioContentSchema.parse(duplicate)).toThrow("不可重複");
    }
  });
  it("實際目標數擴充後仍拒絕缺少任一目標或錯誤isTarget映射", () => {
    const missing = content(25), sentence = missing.story.sentences[0];
    sentence.wordLinks.pop(); sentence.en = missing.targets.slice(0, -1).map(t => t.word).join(" ") + "."; missing.story.textEn = sentence.en;
    expect(() => ScenarioContentSchema.parse(missing)).toThrow("涵蓋所有");
    const wrong = content(25); wrong.story.sentences[0].wordLinks[0].isTarget = false;
    expect(() => ScenarioContentSchema.parse(wrong)).toThrow("目標詞對應");
  });
  it("草稿可空白保存但完整檢查限1–25，保留字庫GUID／詞性／級別／詞義驗證", async () => {
    const complete = content(25, true);
    const draft = { ...emptyStudioDraft("target-count"), targets: complete.targets };
    const rows = complete.targets.map(t => ({ guid: t.entryGuid, word: t.word, parts_of_speech: ["n"], level: { list: "basic" } }));
    const db = { query: vi.fn(async () => ({ rows })) } as unknown as Queryable;
    expect(StudioEditableSchema.parse(emptyStudioDraft("target-count")).targets).toEqual([]);
    expect(StudioEditableSchema.parse(draft).targets).toHaveLength(25);
    expect(StudioEditableSchema.safeParse({ ...draft, targets: content(26).targets }).success).toBe(false);
    expect(await validateStudioTargets(db, draft)).toEqual([]);
    expect(await validateStudioTargets(db, { ...draft, targets: [] })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "target-count" })]));
    const bad = structuredClone(draft); bad.targets[0].teachingPos = "v"; bad.targets[1].word = "wrong"; bad.targets[2].list = "advance"; bad.targets[3].senseZh = "";
    const checks = await validateStudioTargets(db, bad);
    expect(checks.filter(c => c.code === "target-invalid")).toHaveLength(3);
    expect(checks).toContainEqual(expect.objectContaining({ code: "target-sense" }));
  });
});
