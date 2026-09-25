import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseImageCatalog, estimateImageCost } from "./catalog";
import {
  sourceHash,
  validateVisualPlan,
  PositionedTargetSchema,
  validateTargets,
  GenerationScopeSchema,
  type VisualPlan,
} from "./contracts";
import { examplePlan, exampleSource } from "./testFixtures";
it("reports schema paths and warns about skipped words without unrelated model output", () => {
  expect(() => validateVisualPlan({ ...examplePlan, coverBrief: null }, exampleSource)).toThrow("coverBrief");
  const plan = structuredClone(examplePlan);
  plan.paragraphs[0].teachingTargets[0].word = "kitty";
  plan.paragraphs[0].teachingTargets[0].reason = "secret-model-output";
  const warnings: string[] = [];
  const result = validateVisualPlan(plan, exampleSource, (warning) => warnings.push(warning));
  expect(result.paragraphs[0].teachingTargets).toEqual([]);
  expect(result.paragraphs[0].scene).toEqual(examplePlan.paragraphs[0].scene);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('段落 1：已略過教學單字第 1 項 "kitty"');
  expect(warnings[0]).not.toContain("secret-model-output");
});
it.each(["https://example.com?key=secret", "cat\nsecret", "cat\n"])(
  "does not persist unsafe teaching words in warnings: %s", (word) => {
    const plan = structuredClone(examplePlan);
    plan.paragraphs[0].teachingTargets[0].word = word;
    const warnings: string[] = [];
    expect(validateVisualPlan(plan, exampleSource, (warning) => warnings.push(warning))
      .paragraphs[0].teachingTargets).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain(word);
    expect(warnings[0]).not.toContain("secret");
  },
);
it("rejects overlong target text without echoing it", () => {
  const plan = structuredClone(examplePlan);
  plan.paragraphs[0].teachingTargets[0].word = "a".repeat(81);
  expect(() => validateVisualPlan(plan, exampleSource)).toThrow("word (too_big)");
  try { validateVisualPlan(plan, exampleSource); } catch (error) {
    expect(String(error)).not.toContain("a".repeat(81));
  }
});
const models = JSON.parse(
  readFileSync(
    new URL("../../../config/image-models.json", import.meta.url),
    "utf8",
  ),
);
const pricing = JSON.parse(
  readFileSync(
    new URL("../../../config/image-pricing.json", import.meta.url),
    "utf8",
  ),
);

describe("visual contracts", () => {
  it("validates shipped catalogs and exact rates, never invents zero prices", () => {
    const c = parseImageCatalog(models, pricing);
    expect(c.models).toHaveLength(2);
    expect(
      estimateImageCost(c.models[0], c.pricing[0], "cover", 2000, false),
    ).toBeGreaterThan(0);
    const invalid = structuredClone(models);
    invalid.models[0].profiles.cover.providerOptions.size = "1024x1024";
    expect(() => parseImageCatalog(invalid, pricing)).toThrow(
      "missing exact output rate",
    );
  });
  it("rejects duplicate IDs, invalid defaults, unknown options and unsupported Gemini size", () => {
    const duplicate = structuredClone(models);
    duplicate.models.push(duplicate.models[0]);
    expect(() => parseImageCatalog(duplicate, pricing)).toThrow(
      "duplicate model ID",
    );
    expect(() =>
      parseImageCatalog({ ...models, defaultModelId: "absent" }, pricing),
    ).toThrow("default model");
    const invalid = structuredClone(models);
    invalid.models[1].profiles.cover.providerOptions.imageSize = "4K";
    expect(() => parseImageCatalog(invalid, pricing)).toThrow();
  });
  it("hashes only visual source, insensitive to property ordering", () => {
    expect(sourceHash(exampleSource)).toBe(sourceHash({ ...exampleSource }));
    expect(sourceHash({ ...exampleSource, title: "new title" })).not.toBe(
      sourceHash(exampleSource),
    );
  });
  it("requires every source paragraph exactly once", () => {
    expect(validateVisualPlan(examplePlan, exampleSource)).toEqual(examplePlan);
    const p = structuredClone(examplePlan);
    p.paragraphs[0].paragraphId = 999;
    expect(() => validateVisualPlan(p, exampleSource)).toThrow(
      "paragraph set mismatch",
    );
    expect(() =>
      validateVisualPlan(
        {
          ...examplePlan,
          paragraphs: [...examplePlan.paragraphs, ...examplePlan.paragraphs],
        },
        exampleSource,
      ),
    ).toThrow();
  });
  it.each<[string, (plan: VisualPlan) => void]>([
    ["styleBible.palette", (plan) => { plan.styleBible.palette = []; }],
    ["styleBible.palette", (plan) => { plan.styleBible.palette = Array(11).fill("green"); }],
    ["styleBible.compositionRules", (plan) => { plan.styleBible.compositionRules = Array(11).fill("central"); }],
    ["styleBible.forbiddenElements", (plan) => { plan.styleBible.forbiddenElements = Array(21).fill("lettering"); }],
    ["coverBrief.continuityNotes", (plan) => { plan.coverBrief.continuityNotes = Array(11).fill("same cat"); }],
    ["characterBible", (plan) => { plan.characterBible = Array.from({ length: 13 }, (_, i) => ({
      id: String(i), name: "Cat", visualDescription: "Orange cat", clothing: "None", continuityRules: [],
    })); }],
    ["characterBible.0.continuityRules", (plan) => { plan.characterBible = [{
      id: "cat", name: "Cat", visualDescription: "Orange cat", clothing: "None", continuityRules: Array(11).fill("orange"),
    }]; }],
    ["paragraphs.0.paragraphId", (plan) => { plan.paragraphs[0].paragraphId = 0; }],
    ["paragraphs.0.idx", (plan) => { plan.paragraphs[0].idx = -1; }],
    ["paragraphs.0.scene.continuityNotes", (plan) => { plan.paragraphs[0].scene!.continuityNotes = Array(11).fill("same cat"); }],
    ["paragraphs", (plan) => { plan.paragraphs = []; }],
  ])("enforces %s bounds locally with a simplified provider schema", (path, mutate) => {
    const plan = structuredClone(examplePlan);
    mutate(plan);
    expect(() => validateVisualPlan(plan, exampleSource)).toThrow(`規劃格式不符：${path}`);
  });
  it("accepts 200 matching paragraphs and rejects 201 before source validation", () => {
    const source = structuredClone(exampleSource);
    const plan = structuredClone(examplePlan);
    source.paragraphs = Array.from({ length: 200 }, (_, idx) => ({ ...exampleSource.paragraphs[0], id: idx + 1, idx }));
    plan.paragraphs = source.paragraphs.map(({ id, idx }) => ({ ...examplePlan.paragraphs[0], paragraphId: id, idx }));
    expect(validateVisualPlan(plan, source).paragraphs).toHaveLength(200);
    source.paragraphs.push({ ...exampleSource.paragraphs[0], id: 201, idx: 200 });
    plan.paragraphs.push({ ...examplePlan.paragraphs[0], paragraphId: 201, idx: 200 });
    expect(() => validateVisualPlan(plan, source)).toThrow("規劃格式不符：paragraphs");
  });
  it.each(["CAT", "kitty", "", undefined, null, { invalid: true }])(
    "derives normalizedWord from the source token instead of planner value %j", (normalizedWord) => {
      const plan = structuredClone(examplePlan);
      const target = { ...plan.paragraphs[0].teachingTargets[0], normalizedWord };
      const input = { ...plan, paragraphs: [{ ...plan.paragraphs[0], teachingTargets: [target] }] };
      expect(validateVisualPlan(input, exampleSource).paragraphs[0].teachingTargets[0])
        .toEqual(examplePlan.paragraphs[0].teachingTargets[0]);
      expect(target.normalizedWord).toEqual(normalizedWord);
    },
  );
  it("merges repeated targets before the count check and keeps the first explanation", () => {
    const plan = structuredClone(examplePlan);
    const first = plan.paragraphs[0].teachingTargets[0];
    plan.paragraphs[0].teachingTargets = [first, ...Array.from({ length: 3 }, () => ({
      ...first, normalizedWord: "wrong", reason: "later reason", visualObject: "later object",
    }))];
    expect(validateVisualPlan(plan, exampleSource).paragraphs[0].teachingTargets).toEqual([first]);
    expect(plan.paragraphs[0].teachingTargets).toHaveLength(4);
  });
  it("merges case variants only when both exact tokens appear in the source", () => {
    const plan = structuredClone(examplePlan);
    const first = { ...plan.paragraphs[0].teachingTargets[0], word: "Cat", normalizedWord: "wrong" };
    plan.paragraphs[0].teachingTargets = [first, plan.paragraphs[0].teachingTargets[0]];
    const source = { ...exampleSource, paragraphs: [{ id: 1, idx: 0, text: "Cat meets cat." }] };
    expect(validateVisualPlan(plan, source).paragraphs[0].teachingTargets)
      .toEqual([{ ...first, normalizedWord: "cat" }]);
  });
  it("rejects four distinct valid source words instead of truncating", () => {
    const plan = structuredClone(examplePlan);
    plan.paragraphs[0].teachingTargets = ["cat", "dog", "tree", "bird"].map((word) => ({
      ...examplePlan.paragraphs[0].teachingTargets[0], word, normalizedWord: word,
    }));
    const source = { ...exampleSource, paragraphs: [{ id: 1, idx: 0, text: "cat dog tree bird" }] };
    expect(() => validateVisualPlan(plan, source)).toThrow("規劃格式不符：paragraphs.0.teachingTargets");
  });
  it.each(["Cat", "cats", "ca", "cat sits", "window box"])(
    "skips a nonexact source word %s while preserving valid words and scene", (word) => {
      const plan = structuredClone(examplePlan);
      plan.paragraphs[0].teachingTargets.push({
        ...plan.paragraphs[0].teachingTargets[0], word,
      });
      const warnings: string[] = [];
      const result = validateVisualPlan(plan, exampleSource, (warning) => warnings.push(warning));
      expect(result).toEqual(examplePlan);
      expect(warnings).toEqual([
        `段落 1：已略過教學單字第 2 項 ${JSON.stringify(word)}，不是原文完整單字（僅接受單一單字，大小寫與單複數須一致）`,
      ]);
    },
  );
  it("rejects phrases even when the complete phrase occurs in the source", () => {
    const plan = structuredClone(examplePlan);
    plan.paragraphs[0].teachingTargets = [{ ...plan.paragraphs[0].teachingTargets[0], word: "window box" }];
    const source = { ...exampleSource, paragraphs: [{ id: 1, idx: 0, text: "A window box." }] };
    expect(validateVisualPlan(plan, source).paragraphs[0].teachingTargets).toEqual([]);
    expect(() => validateTargets(plan.paragraphs[0].teachingTargets, source.paragraphs[0].text)).toThrow();
  });
  it("still rejects missing required scenes when all labels are skipped", () => {
    const plan = structuredClone(examplePlan);
    plan.paragraphs[0].scene = null;
    plan.paragraphs[0].teachingTargets[0].word = "window box";
    expect(() => validateVisualPlan(plan, exampleSource)).toThrow("required paragraph needs a scene");
  });
  it("keeps malformed targets invalid even when another occurrence could replace them", () => {
    const plan = structuredClone(examplePlan);
    plan.paragraphs[0].teachingTargets.push({ ...plan.paragraphs[0].teachingTargets[0], reason: "" });
    expect(() => validateVisualPlan(plan, exampleSource)).toThrow("paragraphs.0.teachingTargets.1.reason");
  });
  it("keeps manual normalization and duplicate checks strict", () => {
    const target = examplePlan.paragraphs[0].teachingTargets[0];
    expect(() => validateTargets([{ ...target, normalizedWord: "CAT" }], exampleSource.paragraphs[0].text)).toThrow();
    expect(() => validateTargets([target, target], exampleSource.paragraphs[0].text)).toThrow("duplicate teaching target");
  });
  it("requires source spelling and valid coordinates; rejects phase 2 scopes", () => {
    expect(() =>
      validateTargets(
        [
          {
            word: "kitty",
            normalizedWord: "kitty",
            reason: "animal",
            visualObject: "cat",
          },
        ],
        "The cat sits.",
      ),
    ).toThrow();
    expect(
      PositionedTargetSchema.safeParse({
        ...examplePlan.paragraphs[0].teachingTargets[0],
        anchor: { x: 1.1, y: 0.5 },
        confidence: 1,
        placementSource: "manual",
      }).success,
    ).toBe(false);
    expect(
      GenerationScopeSchema.safeParse({ kind: "paragraphs", paragraphIds: [1] })
        .success,
    ).toBe(false);
  });
});
