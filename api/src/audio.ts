// 將音檔寫入 AUDIO_DIR 的相對路徑（自動建立父目錄）。DB 只存相對路徑。
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
