// 音檔檔案工具：寫入 AUDIO_DIR 相對路徑（DB 只存相對路徑）、移除相對目錄。
// 原分別位於 api/src/audio.ts 與 worker/src/audio.ts，整併於此消除重複。
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

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
