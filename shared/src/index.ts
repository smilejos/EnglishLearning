// @el/shared — 共用契約與工具。
// schemas、db pool、repositories 於 Phase 1+ 陸續加入。

export type Status = "pending" | "processing" | "done" | "failed";

export { loadConfig } from "./config";
export type {
  Config,
  GeminiConfig,
  CfAccessConfig,
} from "./config";
