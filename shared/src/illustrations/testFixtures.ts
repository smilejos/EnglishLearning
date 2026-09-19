import type { VisualPlan, VisualSource } from "./contracts";
export const exampleSource: VisualSource = {
  title: "The cat",
  grade: null,
  level: null,
  categoryId: null,
  paragraphs: [{ id: 1, idx: 0, text: "The cat sits." }],
};
export const examplePlan: VisualPlan = {
  articleSummary: "A cat sitting peacefully",
  audience: { ageBand: "6–9", englishLevel: "beginner" },
  styleBible: {
    medium: "watercolor",
    palette: ["green"],
    lighting: "soft daylight",
    compositionRules: ["central subject"],
    forbiddenElements: ["lettering"],
  },
  characterBible: [],
  coverBrief: {
    learningGoal: "Recognize a cat",
    subject: "cat",
    action: "sitting",
    setting: "garden",
    composition: "central cat",
    continuityNotes: [],
  },
  coverAltText: "A cat sitting in a garden",
  paragraphs: [
    {
      paragraphId: 1,
      idx: 0,
      required: true,
      skipReason: null,
      scene: {
        learningGoal: "Recognize sitting",
        subject: "cat",
        action: "sitting",
        setting: "garden",
        composition: "central cat",
        continuityNotes: [],
      },
      altText: "A cat sits on grass",
      teachingTargets: [
        {
          word: "cat",
          normalizedWord: "cat",
          reason: "concrete noun",
          visualObject: "cat",
        },
      ],
    },
  ],
};
