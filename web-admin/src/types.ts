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
  /** 該段對應 job 的最近錯誤（無則 null）。 */
  jobError?: string | null;
}

export type ManageableRole = "reviewer" | "reader";

export interface AdminUser {
  id: number;
  email: string;
  role: "admin" | "reviewer" | "reader";
  lastSeenAt: string | null;
  isEnvAdmin: boolean;
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
