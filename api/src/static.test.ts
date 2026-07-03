// Task 4.2 整合測試：/audio/* 靜態音檔服務與路徑穿越防護。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPool } from "@el/shared";
import { buildApp } from "./app";
import type { AuthConfig } from "./auth";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://app:app@localhost:5433/english_learning_test";

// devAuthBypass 讓我們專注測試靜態服務本身（/audio/ 本就是公開路徑）。
const config: AuthConfig = {
  cfAccess: null,
  devAuthBypass: true,
  devUserEmail: "dev@example.com",
  adminEmails: [],
};

let pool: ReturnType<typeof createPool>;
let audioDir: string;
const wavBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]); // "RIFF" + 資料

beforeAll(async () => {
  pool = createPool(DATABASE_URL);
  audioDir = await mkdtemp(join(tmpdir(), "el-audio-"));
  await mkdir(join(audioDir, "articles", "1"), { recursive: true });
  await writeFile(join(audioDir, "articles", "1", "p0.en.wav"), wavBytes);
});

afterAll(async () => {
  await pool.end();
  await rm(audioDir, { recursive: true, force: true });
});

describe("靜態音檔服務", () => {
  it("GET /audio/<path> 回 200 與正確 bytes", async () => {
    const app = buildApp({ config, pool, audioDir });
    const res = await app.inject({
      method: "GET",
      url: "/audio/articles/1/p0.en.wav",
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(wavBytes)).toBe(true);
    await app.close();
  });

  it("不存在的檔案回 404", async () => {
    const app = buildApp({ config, pool, audioDir });
    const res = await app.inject({
      method: "GET",
      url: "/audio/articles/1/missing.wav",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("路徑穿越（../）被擋，不外洩 root 外檔案", async () => {
    const app = buildApp({ config, pool, audioDir });
    for (const url of [
      "/audio/../../etc/passwd",
      "/audio/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "/audio/..%2f..%2fpackage.json",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).not.toBe(200);
    }
    await app.close();
  });
});
