import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAudioEncoded } from "./audioFiles";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "el-audiofiles-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeAudioEncoded", () => {
  const wav = Buffer.from("RIFFxxxx");

  it("format=wav 直接寫 .wav", async () => {
    const rel = await writeAudioEncoded(dir, "x/a", wav, { format: "wav" });
    expect(rel).toBe("x/a.wav");
    expect((await readFile(join(dir, rel))).equals(wav)).toBe(true);
  });

  it("format=m4a 且編碼成功 → .m4a（注入假 encoder）", async () => {
    const rel = await writeAudioEncoded(dir, "x/b", wav, {
      format: "m4a",
      available: async () => true,
      encoder: async (w, abs) => {
        await writeFile(abs, w);
      },
    });
    expect(rel).toBe("x/b.m4a");
    expect(await stat(join(dir, rel))).toBeTruthy();
  });

  it("format=m4a 但 ffmpeg 不可用 → 退回 .wav", async () => {
    const rel = await writeAudioEncoded(dir, "x/c", wav, {
      format: "m4a",
      available: async () => false,
    });
    expect(rel).toBe("x/c.wav");
  });

  it("format=m4a 編碼失敗 → 退回 .wav", async () => {
    const rel = await writeAudioEncoded(dir, "x/d", wav, {
      format: "m4a",
      available: async () => true,
      encoder: async () => {
        throw new Error("encode boom");
      },
    });
    expect(rel).toBe("x/d.wav");
    expect((await readFile(join(dir, rel))).equals(wav)).toBe(true);
  });
});
