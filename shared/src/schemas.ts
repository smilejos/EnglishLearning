// 前後端共用的資料契約（Zod schema + 推導型別）。
// 單一事實來源為設計 §4 / `docs/schema-reference.sql`；此處為其 DTO（JSON over HTTP）表示。
// DB 欄位為 snake_case，本層對外採 camelCase；repo（Task 2.3）負責兩者映射。

import { z } from "zod";

// -----------------------------------------------------------------------------
// 列舉
// -----------------------------------------------------------------------------

/** 處理狀態：對應 DB `processing_status` 與 Global constraints。 */
export const StatusSchema = z.enum(["pending", "processing", "done", "failed"]);
export type Status = z.infer<typeof StatusSchema>;

/** 教材性質：對應 DB `material_type`。 */
export const MaterialTypeSchema = z.enum(["school", "extracurricular"]);
export type MaterialType = z.infer<typeof MaterialTypeSchema>;

/** 使用者角色：對應 DB `user_role`。 */
export const UserRoleSchema = z.enum(["admin", "reader", "reviewer"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** 後台可指派的角色（管理者身分只由 ADMIN_EMAILS 決定，不可經後台指派）。 */
export const ManageableRoleSchema = z.enum(["reviewer", "reader"]);
export type ManageableRole = z.infer<typeof ManageableRoleSchema>;

/** PUT /users/:email/role 的 body。 */
export const SetUserRoleRequestSchema = z.object({ role: ManageableRoleSchema });

/** POST /users（預先指派）的 body。 */
export const PreprovisionUserRequestSchema = z.object({
  email: z.string().email(),
  role: ManageableRoleSchema,
});

// -----------------------------------------------------------------------------
// 實體
// -----------------------------------------------------------------------------

/** 文章（對應 `articles`）。分類欄位依 materialType 生效，未填者為 null。 */
export const ArticleSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  materialType: MaterialTypeSchema,
  // 課業內（school）分類
  grade: z.string().nullable(),
  unit: z.string().nullable(),
  week: z.number().int().nullable(),
  page: z.number().int().nullable(),
  // 課外（extracurricular）分類
  categoryId: z.number().int().nullable(),
  // 兩種教材皆可用
  level: z.string().nullable(),
  status: StatusSchema,
  createdBy: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Article = z.infer<typeof ArticleSchema>;

/** 段落（對應 `paragraphs`）。translation / audio 在 worker 處理前為 null。 */
export const ParagraphSchema = z.object({
  id: z.number().int(),
  articleId: z.number().int(),
  idx: z.number().int(),
  text: z.string(),
  translation: z.string().nullable(),
  enAudioPath: z.string().nullable(),
  zhAudioPath: z.string().nullable(),
  status: StatusSchema,
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

/** 單字主要身分（對應 `words`）。en 發音跨解釋共用。 */
export const WordSchema = z.object({
  id: z.number().int(),
  normalizedWord: z.string(),
  enAudioPath: z.string().nullable(),
  createdAt: z.string(),
});
export type Word = z.infer<typeof WordSchema>;

/**
 * 單字解釋變體（對應 `word_explanations`）。
 * 10 個內容欄位（5 組「文字 + 語音」）名稱須與設計 §4 一一對應。
 */
export const WordExplanationSchema = z.object({
  id: z.number().int(),
  wordId: z.number().int(),
  articleId: z.number().int(),
  paragraphId: z.number().int().nullable(),
  // 1–2 英文解釋
  enExplanation: z.string().nullable(),
  enExplanationAudioPath: z.string().nullable(),
  // 3–4 英文例句
  enExample: z.string().nullable(),
  enExampleAudioPath: z.string().nullable(),
  // 5–6 繁中翻譯
  zhTranslation: z.string().nullable(),
  zhTranslationAudioPath: z.string().nullable(),
  // 7–8 中文解釋
  zhExplanation: z.string().nullable(),
  zhExplanationAudioPath: z.string().nullable(),
  // 9–10 中文例句
  zhExample: z.string().nullable(),
  zhExampleAudioPath: z.string().nullable(),
  headword: z.string().nullable(),
  createdAt: z.string(),
});
export type WordExplanation = z.infer<typeof WordExplanationSchema>;

/** 解釋＋其來源文章連結資訊（前端彈窗列出多份解釋並可跳轉用）。 */
export const WordExplanationWithSourceSchema = WordExplanationSchema.extend({
  article: ArticleSchema.pick({ id: true, title: true }),
});
export type WordExplanationWithSource = z.infer<
  typeof WordExplanationWithSourceSchema
>;

// -----------------------------------------------------------------------------
// 單字查詢 DTO（POST /lookups）
// -----------------------------------------------------------------------------

/** 查詢請求：以點擊段落為脈絡來源。 */
export const WordLookupRequestSchema = z.object({
  articleId: z.number().int(),
  paragraphId: z.number().int(),
  word: z.string().min(1),
});
export type WordLookupRequest = z.infer<typeof WordLookupRequestSchema>;

/** 查詢回應：單字本身 + 該單字全部解釋（依來源累積，各附來源文章）。 */
export const WordLookupResponseSchema = z.object({
  word: WordSchema,
  explanations: z.array(WordExplanationWithSourceSchema),
});
export type WordLookupResponse = z.infer<typeof WordLookupResponseSchema>;
