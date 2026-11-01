// 離線自然發音教材的聲學初篩；通過不代表目標讀音或教學品質已通過聽審。
import { spawnSync } from 'node:child_process';
import { validateMp3 } from './generate-wordbank-audio.mjs';

/** 保留既有格式／完整解碼檢查，再保守排除峰值低於 -60 dBFS 的近靜音檔。 */
export async function validatePhonicsMp3(filename) {
  const metadata = await validateMp3(filename);
  const decoded = spawnSync('ffmpeg', [
    '-v', 'error', '-i', filename, '-map', '0:a:0', '-ac', '1', '-ar', '16000',
    '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1',
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (decoded.error || decoded.status !== 0 || decoded.stderr.toString().trim())
    throw new Error(`自然發音聲學檢查無法解碼：${decoded.error?.message ?? decoded.stderr.toString().trim()}`);
  const samples = decoded.stdout;
  if (!samples.length || samples.length % 4 !== 0) throw new Error('自然發音聲學檢查沒有有效的 PCM 樣本');
  let peak = 0;
  let squareSum = 0;
  for (let offset = 0; offset < samples.length; offset += 4) {
    const value = samples.readFloatLE(offset);
    if (!Number.isFinite(value)) throw new Error('自然發音聲學檢查出現無效樣本');
    peak = Math.max(peak, Math.abs(value));
    squareSum += value * value;
  }
  const peakDbfs = 20 * Math.log10(peak);
  const rmsDbfs = 20 * Math.log10(Math.sqrt(squareSum / (samples.length / 4)));
  if (peakDbfs < -60) throw new Error(`自然發音音檔近靜音：峰值 ${peakDbfs.toFixed(1)} dBFS，低於 -60 dBFS；RMS ${rmsDbfs.toFixed(1)} dBFS`);
  return { ...metadata, acousticCheck: { peakDbfs, rmsDbfs, minimumPeakDbfs: -60,
    scope: '近靜音初篩，未驗證讀音或人工聽審品質' } };
}
