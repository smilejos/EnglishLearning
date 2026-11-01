import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validatePhonicsMp3 } from './phonics-audio-quality.mjs';
import { generateBatch, validateMp3 } from './generate-wordbank-audio.mjs';
import { keepExistingRecording } from './prepare-phonics-lessons-audio.mjs';

let directory;
const fixtures = {};
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'phonics-acoustic-test-'));
  for (const [name, source, filters] of [
    ['silent', 'anullsrc=r=16000:cl=mono', []],
    ['quiet', 'sine=frequency=440:sample_rate=16000', ['-af', 'volume=-70dB']],
    ['tone', 'sine=frequency=440:sample_rate=16000', []],
  ]) {
    fixtures[name] = path.join(directory, `${name}.mp3`);
    const result = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', source,
      '-t', '0.35', ...filters, '-ac', '1', '-codec:a', 'libmp3lame', fixtures[name]], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  }
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('可完整解碼的全靜音及近靜音 MP3 仍拒絕作為教材錄音', async () => {
  for (const filename of [fixtures.silent, fixtures.quiet]) {
    assert.ok((await validateMp3(filename)).durationSeconds > 0);
    await assert.rejects(validatePhonicsMp3(filename), /近靜音.*低於 -60 dBFS/);
    assert.equal(await keepExistingRecording(filename, {}), false);
  }
});

test('可量測波形通過並回報 peak／RMS，但不宣稱驗證讀音', async () => {
  const metadata = await validatePhonicsMp3(fixtures.tone);
  assert.ok(metadata.bytes > 0);
  assert.ok(metadata.durationSeconds > 0);
  assert.ok(metadata.acousticCheck.peakDbfs > -21 && metadata.acousticCheck.peakDbfs < -16);
  assert.ok(metadata.acousticCheck.rmsDbfs < metadata.acousticCheck.peakDbfs);
  assert.ok(metadata.acousticCheck.rmsDbfs > -26);
  assert.equal(metadata.acousticCheck.minimumPeakDbfs, -60);
  assert.match(metadata.acousticCheck.scope, /未驗證讀音/);
  assert.equal(await keepExistingRecording(fixtures.tone, {}), true);
});

test('注入聲學驗證後，假 TTS 的近靜音回應不會被批次工具記為成功', async () => {
  const job = { assetGuid: 'phonics-short-e-test', kind: 'word', text: 'test',
    textHash: 'fixture-text-hash', relativePath: 'test.mp3' };
  const bytes = await readFile(fixtures.quiet);
  const outputDir = path.join(directory, 'batch');
  const report = await generateBatch({ jobs: [job], outputDir, retries: 0,
    validate: validatePhonicsMp3, log: () => {},
    fetchImpl: async () => new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } }),
  });
  assert.equal(report.generated, 0);
  assert.equal(report.skipped, 0);
  assert.equal(report.failed.length, 1);
  assert.match(report.failed[0].error, /近靜音/);
  await assert.rejects(readFile(path.join(outputDir, 'test.mp3')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(outputDir, 'manifest.json')), { code: 'ENOENT' });
});
