// 前端輕量型別（對應 api 回傳的 DTO；前端不直接 import 伺服器端 @el/shared）。
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
  page: number | null;
  categoryId: number | null;
  category: { id: number; label: string } | null;
  tags: ArticleTag[];
  level: string | null;
  status: Status;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
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

export interface CreateArticleInput {
  title: string;
  text: string;
  materialType?: MaterialType;
  grade?: string;
  unit?: string;
  week?: number;
  page?: number;
  level?: string;
  categoryId?: number;
  tags?: string[];
}
