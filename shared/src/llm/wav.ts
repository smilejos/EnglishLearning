// PCM → WAV 封裝工具（移植自 article2speech/builder/src/wav.ts，內容不變）。

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export function pcmToWav(pcm: Buffer, fmt: WavFormat): Buffer {
  const { sampleRate, channels, bitsPerSample } = fmt;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export const TTS_FORMAT: WavFormat = {
  sampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
};

// 16-bit 單聲道 PCM 在指定取樣率下的秒數。
export function pcmDurationSec(pcm: Buffer, fmt: WavFormat = TTS_FORMAT): number {
  const bytesPerSample = (fmt.channels * fmt.bitsPerSample) / 8;
  return pcm.length / bytesPerSample / fmt.sampleRate;
}
