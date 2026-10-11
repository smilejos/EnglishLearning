import type { WordbankSystem } from "./wordbankTypes";

export interface ScenarioSummary {
  scenarioKey: string;
  revision: number;
  status: "draft" | "published";
  titleZh: string;
  vocabularyFilter: { system: WordbankSystem; levels: string[] };
  targetCount: number;
}
export interface ScenarioTarget {
  word: string; entryGuid: string; list: string; teachingPos: string; senseZh: string;
  interaction: { label: { x: number; y: number }; object: { x: number; y: number } };
}
export interface ScenarioSentence {
  id: string; en: string; zh: string;
  wordLinks: { start: number; end: number; surface: string; word: string; entryGuid: string; isTarget: boolean }[];
}
export interface ScenarioDetail extends ScenarioSummary {
  targets: ScenarioTarget[];
  story: { textEn: string; textZh: string; sentences: ScenarioSentence[]; paragraphBreakAfterSentenceIds?: string[] };
  image: { url: string; width: number; height: number };
  storyAudio: { url: string } | null;
}
