// Gemini's JSON Schema constrains structure; contracts.ts still validates source semantics.
// String length limits remain in Zod: generateContent supports only a JSON Schema subset.
const string = { type: "string" };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const array = (items: object, maxItems: number, minItems = 0) => ({
  type: "array", items, minItems, maxItems,
});
const object = (properties: Record<string, object>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const scene = object({
  learningGoal: string, subject: string, action: string, setting: string,
  composition: string, continuityNotes: array(string, 10),
});
const word = { type: "string" };
export const visualPlanJsonSchema = object({
  articleSummary: string,
  audience: object({ ageBand: nullable(string), englishLevel: nullable(string) }),
  styleBible: object({
    medium: string, palette: array(string, 10, 1), lighting: string,
    compositionRules: array(string, 10), forbiddenElements: array(string, 20),
  }),
  characterBible: array(object({
    id: string, name: string, visualDescription: string, clothing: string,
    continuityRules: array(string, 10),
  }), 12),
  coverBrief: scene, coverAltText: string,
  paragraphs: array(object({
    paragraphId: { type: "integer", minimum: 1 },
    idx: { type: "integer", minimum: 0 }, required: { type: "boolean" },
    skipReason: nullable(string), scene: nullable(scene), altText: string,
    teachingTargets: array(object({ word, normalizedWord: word, reason: string, visualObject: string }), 3),
  }), 200, 1),
});
