// Keep Gemini's constrained-decoding schema structural: nested array bounds and
// numeric limits can exceed its serving-state budget even for short articles.
// plannerPrompt guides counts; contracts.ts enforces all bounds and source semantics.
const string = { type: "string" };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const array = (items: object) => ({ type: "array", items });
const object = (properties: Record<string, object>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const scene = object({
  learningGoal: string, subject: string, action: string, setting: string,
  composition: string, continuityNotes: array(string),
});
const word = { type: "string" };
export const visualPlanJsonSchema = object({
  articleSummary: string,
  audience: object({ ageBand: nullable(string), englishLevel: nullable(string) }),
  styleBible: object({
    medium: string, palette: array(string), lighting: string,
    compositionRules: array(string), forbiddenElements: array(string),
  }),
  characterBible: array(object({
    id: string, name: string, visualDescription: string, clothing: string,
    continuityRules: array(string),
  })),
  coverBrief: scene, coverAltText: string,
  paragraphs: array(object({
    paragraphId: { type: "integer" },
    idx: { type: "integer" }, required: { type: "boolean" },
    skipReason: nullable(string), scene: nullable(scene), altText: string,
    teachingTargets: array(object({ word, normalizedWord: word, reason: string, visualObject: string })),
  })),
});
