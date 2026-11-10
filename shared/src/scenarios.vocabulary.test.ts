import { describe, expect, it, vi } from "vitest";
import { ScenarioContentSchema, scenarioCanonicalJson, scenarioRevisionHash, type ScenarioContent, type ScenarioMedia } from "./scenarios";
import { listScenarios, validateScenarioWordbank } from "./repo/scenarios";
import type { Queryable } from "./repo/types";

const guid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const words = ["wait", "by", "the", "self-service kiosk", "and", "order", "À la carte"];
  const entries = words.map((word, i) => ({ guid: guid(i + 1), word, parts_of_speech: [i === 0 || i === 5 ? "v" : "n"], level: { list: i === 3 ? null : i === 6 ? "expert" : "basic" } }));
  const targets = [entries[0], entries[3], entries[6]].map(entry => ({ word: entry.word, entryGuid: entry.guid, list: entry.level.list as "basic" | "expert" | null, teachingPos: entry.parts_of_speech[0] as "v" | "n", senseZh: "情境詞義", interaction: { label: { x: .2, y: .2 }, object: { x: .4, y: .4 } } }));
  const en = "Wait by the self-service kiosk and order À la carte.";
  const surfaces = ["Wait", ...words.slice(1)];
  let cursor = 0;
  const wordLinks = surfaces.map((surface, i) => {
    const start = en.indexOf(surface, cursor), end = start + surface.length;
    cursor = end;
    return { surface, word: words[i], entryGuid: entries[i].guid, isTarget: targets.some(target => target.entryGuid === entries[i].guid), start, end };
  });
  const content: ScenarioContent = { schemaVersion: 1, scenarioKey: "specified-words", revision: 1, titleZh: "指定詞情境", vocabularyMode: "user-specified", vocabularyFilter: { system: "list", levels: ["basic", "expert"] }, targetCount: targets.length, targets,
    story: { language: "en", translationLanguage: "zh-Hant", textEn: en, textZh: "等候並單點。", sentences: [{ id: "s1", en, zh: "等候並單點。", wordLinks }] } };
  const db = { query: vi.fn(async () => ({ rows: entries })) } as unknown as Queryable;
  return { content, entries, db };
}

describe("使用者指定詞模式與完整故事片語", () => {
  it("指定詞接受 expert／未分級與 Unicode 片語，DB 仍檢查正式 GUID、字形、詞性與真實分級", async () => {
    const f = fixture();
    expect(ScenarioContentSchema.parse(f.content)).toEqual(f.content);
    await expect(validateScenarioWordbank(f.db, f.content)).resolves.toBeUndefined();
    const wrong = structuredClone(f.content);
    wrong.targets[1].list = "basic";
    await expect(validateScenarioWordbank(f.db, wrong)).rejects.toThrow("分級/詞性不符");
    f.entries[3].parts_of_speech = ["v"];
    await expect(validateScenarioWordbank(f.db, f.content)).rejects.toThrow("分級/詞性不符");
  });
  it("省略模式維持 graded 限制；指定詞可不設級別，但不得偽造詞條", async () => {
    const f = fixture();
    expect(ScenarioContentSchema.safeParse({ ...f.content, vocabularyMode: undefined }).success).toBe(false);
    expect(ScenarioContentSchema.safeParse({ ...f.content, vocabularyFilter: { system: "list", levels: [] } }).success).toBe(true);
    f.entries[6].word = "wrong phrase";
    await expect(validateScenarioWordbank(f.db, f.content)).rejects.toThrow("GUID/單字不符");
  });
  it("graded 模式同時限制故事支援詞級別，指定詞模式重用相同 GUID 並保持原分級", async () => {
    const f = fixture();
    f.content.targets = [f.content.targets[0]];
    f.content.targetCount = 1;
    f.content.story.sentences[0].wordLinks.forEach(link => { link.isTarget = link.entryGuid === guid(1); });
    await expect(validateScenarioWordbank(f.db, f.content)).resolves.toBeUndefined();
    await expect(validateScenarioWordbank(f.db, { ...f.content, vocabularyMode: undefined, vocabularyFilter: { system: "list", levels: ["basic"] } })).rejects.toThrow("故事/目標詞超出");
  });
  it("完整片語必須為一個 span；拒絕斷字、部分片語、重疊、亂序、漏詞與錯誤目標關聯", () => {
    const edits = [
      (content: ScenarioContent) => { content.story.sentences[0].wordLinks[6].start++; },
      (content: ScenarioContent) => { const link = content.story.sentences[0].wordLinks[3]; link.surface = "self"; link.end = link.start + 4; },
      (content: ScenarioContent) => { content.story.sentences[0].wordLinks.reverse(); },
      (content: ScenarioContent) => { content.story.sentences[0].wordLinks.splice(1, 1); },
      (content: ScenarioContent) => { content.story.sentences[0].wordLinks.splice(1, 0, structuredClone(content.story.sentences[0].wordLinks[0])); },
      (content: ScenarioContent) => { content.story.sentences[0].wordLinks[6].word = "carte"; },
      (content: ScenarioContent) => { content.story.sentences[0].wordLinks[6].isTarget = false; },
    ];
    for (const edit of edits) {
      const { content } = fixture(); edit(content);
      expect(ScenarioContentSchema.safeParse(content).success).toBe(false);
    }
  });
  it("完整片語不能跨句或標點，graded 模式仍只接受逐詞關聯", () => {
    const { content } = fixture();
    const sentence = content.story.sentences[0];
    sentence.en = sentence.en.replace("À la carte", "À,la carte");
    content.story.textEn = sentence.en;
    const link = sentence.wordLinks[6]; link.surface = "À,la carte"; link.word = "À,la carte";
    content.targets[2].word = link.word;
    expect(ScenarioContentSchema.safeParse(content).success).toBe(false);
    const graded = fixture().content;
    delete graded.vocabularyMode;
    graded.vocabularyFilter.levels = ["basic"];
    graded.targets.forEach(target => { target.list = "basic"; });
    expect(() => ScenarioContentSchema.parse(graded)).toThrow("完整單字");
  });
});


describe("圖解學習介系詞與舊版相容", () => {
  function guideFixture() {
    const f = fixture();
    f.content.learningMode = "illustrated-guide";
    f.entries[1].parts_of_speech = ["prep"];
    f.content.targets = [{ ...f.content.targets[0], word: "by", entryGuid: guid(2), teachingPos: "prep", senseZh: "不遲於指定時間" }];
    f.content.targetCount = 1;
    f.content.story.sentences[0].wordLinks.forEach(link => { link.isTarget = link.entryGuid === guid(2); });
    return f;
  }
  it("prep 僅在圖解模式合法，且仍核對真字庫的詞性、GUID 與分級", async () => {
    const f = guideFixture();
    expect(ScenarioContentSchema.parse(f.content).learningMode).toBe("illustrated-guide");
    await expect(validateScenarioWordbank(f.db, f.content)).resolves.toBeUndefined();
    expect(ScenarioContentSchema.safeParse({ ...f.content, learningMode: undefined }).success).toBe(false);
    expect(ScenarioContentSchema.safeParse({ ...f.content, learningMode: "other" }).success).toBe(false);
    f.entries[1].parts_of_speech = ["adv"];
    await expect(validateScenarioWordbank(f.db, f.content)).rejects.toThrow("分級/詞性不符");
    f.entries[1].parts_of_speech = ["prep"];
    f.entries[1].level.list = "expert";
    await expect(validateScenarioWordbank(f.db, f.content)).rejects.toThrow("分級/詞性不符");
    f.entries[1].level.list = "basic";
    f.entries[1].word = "wrong";
    await expect(validateScenarioWordbank(f.db, f.content)).rejects.toThrow("GUID/單字不符");
  });
  it("省略模式的 canonical JSON 與 revision hash 完全保持舊格式", () => {
    const { content } = fixture();
    const media = {} as ScenarioMedia;
    const before = scenarioRevisionHash(content, media);
    const parsed = ScenarioContentSchema.parse(content);
    expect(Object.hasOwn(parsed, "learningMode")).toBe(false);
    expect(scenarioCanonicalJson(parsed)).toBe(scenarioCanonicalJson(content));
    expect(scenarioRevisionHash(parsed, media)).toBe(before);
    expect(scenarioRevisionHash({ ...parsed, learningMode: "illustrated-guide" }, media)).not.toBe(before);
  });
  it("清單僅圖解模式輸出 prep 計數，舊版仍只有 n／adj／v 且不增加 mode", async () => {
    const old = fixture().content, guide = guideFixture().content;
    const media = { image: { width: 16, height: 9 } } as ScenarioMedia;
    const db = { query: vi.fn(async () => ({ rows: [old, guide].map(content => ({ content, media, status: "published", tags: [] })) })) } as unknown as Queryable;
    const summaries = await listScenarios(db);
    expect(summaries[0].targetCounts).toEqual({ n: 2, adj: 0, v: 1 });
    expect(Object.hasOwn(summaries[0], "learningMode")).toBe(false);
    expect(summaries[1]).toMatchObject({ learningMode: "illustrated-guide", targetCounts: { n: 0, adj: 0, v: 0, prep: 1 } });
  });
});
