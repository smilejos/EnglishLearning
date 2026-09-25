export interface VocabularySource {
  id: number;
  articleId: number | null;
  paragraphId: number | null;
  title: string;
  text: string;
  materialType: "school" | "extracurricular";
  grade: string | null;
  unit: string | null;
  category: string | null;
  savedAt: string;
}

export interface VocabularyItem {
  id: number;
  word: string;
  status: "active" | "mastered";
  savedAt: string;
  sources: VocabularySource[];
}
