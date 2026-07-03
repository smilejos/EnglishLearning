import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeWavToM4aFile, ffmpegAvailable } from "./audioEncode";
import { pcmToWav, TTS_FORMAT } from "./llm/wav";

const available = await ffmpegAvailable();

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "el-encode-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!available)("encodeWavToM4aFile（需本機 ffmpeg）", () => {
  it("輸出為 MP4 容器（offset 4 起為 ftyp）", async () => {
    const wav = pcmToWav(Buffer.alloc(4800), TTS_FORMAT); // 0.1 秒無聲 PCM
    const abs = join(dir, "t.m4a");
    await encodeWavToM4aFile(wav, abs);
    const head = await readFile(abs);
    expect(head.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });
});
