// 靜態音檔服務：從 AUDIO_DIR 提供 /audio/*。
// @fastify/static 內建路徑穿越防護（拒絕 ../ 逃逸 root）。
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

export function registerStatic(app: FastifyInstance, audioDir: string): void {
  app.register(fastifyStatic, {
    root: audioDir,
    prefix: "/audio/",
    // 不需要目錄索引；找不到檔案交給預設 404。
    index: false,
    list: false,
  });
}
