// repo 層彙總匯出。各服務透過 `@el/shared` 的 repo 取得型別安全的查詢函式。
export type { Queryable } from "./types";

export * from "./users";
export * from "./articles";
export * from "./paragraphs";
export * from "./jobs";
export * from "./words";
export * from "./wordExplanations";
export * from "./audioBackfill";
export * from "./categories";
export * from "./tags";
export * from "./stats";
export * from "./wordbank";
export * from "./wordbankAudio";
export * from "./wordbankPractice";
export * from "./scenarios";
