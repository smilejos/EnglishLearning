// 將音檔寫入 AUDIO_DIR 的相對路徑（自動建立父目錄）。DB 只存相對路徑。
import { mkdir, writeFile } from "node:fs/promises";
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
