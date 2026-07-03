// WAV → AAC/M4A 轉檔（外部 ffmpeg CLI；容器內建，本機無 ffmpeg 時由呼叫端退回 wav）。
import { spawn } from "node:child_process";

let ffmpegChecked: Promise<boolean> | null = null;

/** ffmpeg 是否可用（模組層快取，行程內只探測一次）。 */
export function ffmpegAvailable(): Promise<boolean> {
  if (!ffmpegChecked) {
    ffmpegChecked = new Promise((resolve) => {
      const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
  }
  return ffmpegChecked;
}

/** 將 WAV buffer 轉存為 AAC/M4A 檔（stdin 進、檔案出；48kbps 對語音綽綽有餘）。 */
export function encodeWavToM4aFile(wav: Buffer, absPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "48k", absPath],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    p.stderr!.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 200)}`)),
    );
    p.stdin!.on("error", () => {
      // ffmpeg 提前結束時的 EPIPE：由 exit 事件統一回報。
    });
    p.stdin!.end(wav);
  });
}
