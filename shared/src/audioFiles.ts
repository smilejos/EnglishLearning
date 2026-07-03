// 音檔檔案工具：寫入 AUDIO_DIR 相對路徑（DB 只存相對路徑）、移除相對目錄。
// 原分別位於 api/src/audio.ts 與 worker/src/audio.ts，整併於此消除重複。
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { encodeWavToM4aFile, ffmpegAvailable } from "./audioEncode";

export async function writeAudio(
  audioDir: string,
  relPath: string,
  data: Buffer,
): Promise<string> {
  const abs = join(audioDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return relPath;
}

/** 移除 AUDIO_DIR 下某相對目錄（best-effort，不存在或失敗不丟錯）。 */
export async function removeAudioDir(
  audioDir: string,
  relPath: string,
): Promise<void> {
  await rm(join(audioDir, relPath), { recursive: true, force: true }).catch(
    () => {},
  );
}

export type AudioFormat = "m4a" | "wav";

export interface WriteEncodedOpts {
  format: AudioFormat;
  /** 注入編碼器（測試用），預設 ffmpeg。 */
  encoder?: (wav: Buffer, absPath: string) => Promise<void>;
  /** 注入可用性檢查（測試用），預設探測 ffmpeg。 */
  available?: () => Promise<boolean>;
}

/**
 * 依 format 寫入音檔並回傳實際相對路徑（含副檔名）。
 * m4a：ffmpeg 轉檔；ffmpeg 不可用或轉檔失敗時自動退回 .wav（不讓內容產製失敗）。
 */
export async function writeAudioEncoded(
  audioDir: string,
  relBase: string,
  wav: Buffer,
  opts: WriteEncodedOpts,
): Promise<string> {
  if (opts.format === "m4a" && (await (opts.available ?? ffmpegAvailable)())) {
    const rel = `${relBase}.m4a`;
    const abs = join(audioDir, rel);
    await mkdir(dirname(abs), { recursive: true });
    try {
      await (opts.encoder ?? encodeWavToM4aFile)(wav, abs);
      return rel;
    } catch {
      // 轉檔失敗 → 退回 wav。
    }
  }
  return writeAudio(audioDir, `${relBase}.wav`, wav);
}
