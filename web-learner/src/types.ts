// 前端輕量型別（對應 api DTO；前端不直接 import 伺服器端 @el/shared）。
export type Status = "pending" | "processing" | "done" | "failed";
export type MaterialType = "school" | "extracurricular";

export interface ArticleTag {
  kind: string;
  label: string;
}

export interface Article {
  id: number;
  title: string;
  materialType: MaterialType;
  grade: string | null;
  unit: string | null;
  week: number | null;
  level: string | null;
  category: { id: number; label: string } | null;
  tags: ArticleTag[];
  status: Status;
  createdAt: string;
}

export interface Paragraph {
  id: number;
  articleId: number;
  idx: number;
  text: string;
  translation: string | null;
  enAudioPath: string | null;
  zhAudioPath: string | null;
  status: Status;
}

export interface Word {
  id: number;
  normalizedWord: string;
  enAudioPath: string | null;
  createdAt: string;
}

export interface ExplanationSource {
  id: number;
  title: string;
}

export interface WordExplanation {
  id: number;
  wordId: number;
  articleId: number;
  paragraphId: number | null;
  enExplanation: string | null;
  enExplanationAudioPath: string | null;
  enExample: string | null;
  enExampleAudioPath: string | null;
  zhTranslation: string | null;
  zhTranslationAudioPath: string | null;
  zhExplanation: string | null;
  zhExplanationAudioPath: string | null;
  zhExample: string | null;
  zhExampleAudioPath: string | null;
  headword: string | null;
  createdAt: string;
  article: ExplanationSource;
}

export interface WordLookupResponse {
  word: Word | null;
  explanations: WordExplanation[];
}
