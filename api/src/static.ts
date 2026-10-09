// 靜態音檔服務：從 AUDIO_DIR 提供 /audio/*。
// @fastify/static 內建路徑穿越防護（拒絕 ../ 逃逸 root）。
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

export function registerStatic(app: FastifyInstance, audioDir: string): void {
  app.register(fastifyStatic, {
    root: audioDir,
    prefix: "/audio/",
    // 不需要目錄索引；找不到檔案交給預設 404。
    index: false,
    list: false,
    // 情境旁白只經受身分與發布狀態檢查的 /scenarios/.../media/audio 提供。
    allowedPath: (pathname) => {
      try { return !path.posix.normalize(decodeURIComponent(pathname)).replace(/^\/+/, "").startsWith("scenarios/"); }
      catch { return false; }
    },
  });
}
