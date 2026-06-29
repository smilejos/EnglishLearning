import { describe, it, expect } from "vitest";
import { pcmToWav } from "./wav";

describe("pcmToWav", () => {
  it("在前方加上 44-byte RIFF/WAVE 標頭且各欄位大小正確", () => {
    const pcm = Buffer.alloc(8, 1); // 8 bytes 音訊資料
    const wav = pcmToWav(pcm, {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
    });

    expect(wav.length).toBe(44 + 8);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(4)).toBe(36 + 8); // ChunkSize = 36 + dataLen
    expect(wav.readUInt32LE(24)).toBe(24000); // SampleRate
    expect(wav.readUInt16LE(22)).toBe(1); // NumChannels
    expect(wav.readUInt16LE(34)).toBe(16); // BitsPerSample
    expect(wav.readUInt32LE(40)).toBe(8); // Subchunk2Size = dataLen
  });
});
