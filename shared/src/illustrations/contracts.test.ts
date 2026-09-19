import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseImageCatalog, estimateImageCost } from "./catalog";
import {
  sourceHash,
  validateVisualPlan,
  PositionedTargetSchema,
  validateTargets,
  GenerationScopeSchema,
} from "./contracts";
import { examplePlan, exampleSource } from "./testFixtures";
it("reports schema paths and paragraph-specific failures without raw model output", () => {
  expect(() => validateVisualPlan({ ...examplePlan, coverBrief: null }, exampleSource)).toThrow("coverBrief");
  const plan = structuredClone(examplePlan);
  plan.paragraphs[0].teachingTargets[0].word = "secret-model-output";
  expect(() => validateVisualPlan(plan, exampleSource)).toThrow("教學單字");
  try { validateVisualPlan(plan, exampleSource); } catch (error) {
    expect(String(error)).not.toContain("secret-model-output");
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
