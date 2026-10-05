export type WordbankSystem = "list" | "cefr" | "tw_7000";
export type PracticeMode = "practice" | "listening" | "challenge";
export interface WordbankOptions {
  total: number;
  systems: Record<WordbankSystem, { value: string; count: number }[]>;
}
export interface WordbankEntry {
  guid: string;
  word: string;
  partsOfSpeech: string[];
  definition: string;
  explains: { guid: string; en: string }[];
  level: { cefr: string | null; tw_7000: number | null; list: string | null };
  wordAudioUrl: string | null;
  examples: { guid: string; en: string; zh: string; audioUrl: string | null }[];
}
export interface WordbankQuestion { poolSize: number; entry: WordbankEntry | null }
