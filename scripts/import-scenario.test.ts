import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ScenarioContentSchema, scenarioCanonicalJson, scenarioRevisionHash, type ScenarioMedia } from "@el/shared";
import { contentFromScenarioPackage } from "./import-scenario";


test("匯入轉換保留 illustrated-guide 與 prep，省略模式維持舊 canonical/hash", async () => {
  const pkg = JSON.parse(await readFile(new URL("../docs/scenarios/packages/living-room-15-v1/scenario.json", import.meta.url), "utf8"));
  const old = ScenarioContentSchema.parse({ schemaVersion: pkg.schemaVersion, scenarioKey: pkg.scenarioKey, revision: pkg.revision,
    titleZh: pkg.titleZh, vocabularyMode: pkg.vocabularyMode, vocabularyFilter: pkg.vocabularyFilter,
    targetCount: pkg.targetCount, targets: pkg.targets, story: pkg.story });
  const converted = contentFromScenarioPackage(pkg);
  assert.equal(Object.hasOwn(converted, "learningMode"), false);
  assert.equal(scenarioCanonicalJson(converted), scenarioCanonicalJson(old));
  assert.equal(scenarioRevisionHash(converted, {} as ScenarioMedia), scenarioRevisionHash(old, {} as ScenarioMedia));
  const guide = structuredClone(pkg);
  guide.learningMode = "illustrated-guide";
  const at = guide.story.sentences.flatMap((s: any) => s.wordLinks).find((link: any) => link.word === "at");
  assert.ok(at);
  guide.targets = [{ ...guide.targets[0], word: at.word, entryGuid: at.entryGuid, teachingPos: "prep", list: "basic" }];
  guide.targetCount = 1;
  guide.story.sentences.forEach((s: any) => s.wordLinks.forEach((link: any) => { link.isTarget = link.entryGuid === at.entryGuid; }));
  const result = contentFromScenarioPackage(guide);
  assert.equal(result.learningMode, "illustrated-guide");
  assert.equal(result.targets[0].teachingPos, "prep");
  assert.throws(() => contentFromScenarioPackage({ ...guide, learningMode: undefined }), /介系詞目標/);
  assert.throws(() => contentFromScenarioPackage({ ...guide, learningMode: "other" }));
});
