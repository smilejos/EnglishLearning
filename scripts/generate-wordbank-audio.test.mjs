import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PROFILE, planAudio, generateBatch, withBatchLock } from './generate-wordbank-audio.mjs';

const entryGuid = '11111111-1111-5111-8111-111111111111';
const exampleGuid = '22222222-2222-5222-8222-222222222222';
const database = { entries: [{ guid: entryGuid, word: 'apple', level: { list: 'basic' },
  examples: [{ guid: exampleGuid, en: 'I eat an apple.', zh: '我吃一顆蘋果。' }] },
{ guid: '33333333-3333-5333-8333-333333333333', word: 'orbit', level: { list: 'expert' }, examples: [] }] };
const mockAudio = () => new Response(Buffer.from('valid-audio'), { headers: { 'content-type': 'audio/mpeg' } });
const validate = async (path) => {
  assert.equal(await readFile(path, 'utf8'), 'valid-audio');
  return { durationSeconds: 1, bytes: (await stat(path)).size };
};
async function withOutput(run) {
  const outputDir = await mkdtemp(join(tmpdir(), 'wordbank-audio-test-'));
  try { await run(outputDir); } finally { await rm(outputDir, { recursive: true, force: true }); }
}

test('精確 basic 篩選，單字與所有例句有穩定 GUID 路徑與文字 hash', () => {
  const jobs = planAudio(database);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map((job) => job.kind), ['word', 'example']);
  assert.equal(jobs[1].entryGuid, entryGuid);
  assert.match(jobs[0].relativePath, new RegExp(`${entryGuid}\\.mp3$`));
  const changed = structuredClone(database);
  changed.entries[0].word = 'pear';
  assert.notEqual(jobs[0].textHash, planAudio(changed)[0].textHash);
  assert.notEqual(jobs[0].relativePath, planAudio(database, 'basic', { ...DEFAULT_PROFILE, voice: 'Aiden' })[0].relativePath);
  assert.throws(() => planAudio({ entries: [{ ...database.entries[0], word: '' }] }), /缺少朗讀文字/);
});

test('保存指定生成設定；續跑跳過有效檔，损毀音檔重新產生', async () => withOutput(async (outputDir) => {
  const jobs = planAudio(database);
  let requests = 0;
  const fetchImpl = async (_url, request) => {
    requests++;
    const body = JSON.parse(request.body);
    assert.equal(body.model, DEFAULT_PROFILE.model);
    assert.equal(body.voice, 'Serena');
    assert.equal(body.lang_code, 'English');
    assert.equal(body.stream, false);
    return mockAudio();
  };
  const options = { jobs, outputDir, fetchImpl, validate, log() {} };
  assert.equal((await generateBatch(options)).generated, 2);
  const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.entries.length, 2);
  assert.equal((await generateBatch(options)).skipped, 2);
  assert.equal(requests, 2);
  await writeFile(join(outputDir, jobs[1].relativePath), 'damaged');
  const resumed = await generateBatch(options);
  assert.equal(resumed.generated, 1);
  assert.equal(resumed.skipped, 1);
  assert.equal(requests, 3);
}));

test('HTTP 200 的錯誤文字不算音訊；重試後可恢復', async () => withOutput(async (outputDir) => {
  let requests = 0;
  const report = await generateBatch({ jobs: planAudio(database).slice(0, 1), outputDir, validate,
    retryDelayMs: 0, log() {}, fetchImpl: async () => ++requests === 1
      ? new Response('{"error":"speaker failed"}', { headers: { 'content-type': 'application/json' } }) : mockAudio() });
  assert.equal(requests, 2);
  assert.equal(report.generated, 1);
  assert.equal(report.failed.length, 0);
}));

test('空音訊不寫成功 manifest，失敗可在下一輪重試', async () => withOutput(async (outputDir) => {
  const jobs = planAudio(database).slice(0, 1);
  const failed = await generateBatch({ jobs, outputDir, validate, retries: 0, log() {},
    fetchImpl: async () => new Response(new Uint8Array()) });
  assert.equal(failed.generated, 0);
  assert.equal(failed.failed.length, 1);
  await assert.rejects(readFile(join(outputDir, 'manifest.json')), { code: 'ENOENT' });
  assert.equal((await generateBatch({ jobs, outputDir, validate, log() {}, fetchImpl: async () => mockAudio() })).generated, 1);
}));

test('已有 manifest 的模型或聲線設定不同時拒絕混用', async () => withOutput(async (outputDir) => {
  await generateBatch({ jobs: planAudio(database).slice(0, 1), outputDir, validate, log() {}, fetchImpl: async () => mockAudio() });
  await assert.rejects(generateBatch({ jobs: [], outputDir, profile: { ...DEFAULT_PROFILE, voice: 'Aiden' } }), /生成設定不同/);
}));

test('HTTP 200 但下載中斷需重試，不能記錄成功', async () => withOutput(async (outputDir) => {
  let requests = 0;
  const report = await generateBatch({ jobs: planAudio(database).slice(0, 1), outputDir, validate,
    retryDelayMs: 0, log() {}, fetchImpl: async () => ++requests === 1
      ? { ok: true, headers: new Headers({ 'content-type': 'audio/mpeg' }), async arrayBuffer() { throw new Error('傳輸中斷'); } }
      : mockAudio() });
  assert.equal(requests, 2);
  assert.equal(report.generated, 1);
}));

test('manifest 寫入失敗停止，已完成音訊不能重複呼叫 TTS', async () => withOutput(async (outputDir) => {
  let requests = 0;
  await assert.rejects(generateBatch({ jobs: planAudio(database), outputDir, validate,
    retryDelayMs: 0, log() {}, fetchImpl: async () => {
      requests++;
      await mkdir(join(outputDir, 'manifest.json'));
      return mockAudio();
    } }));
  assert.equal(requests, 1);
}));

test('同一輸出目錄的兩個批次不能同時產音，結束後釋放鎖', async () => withOutput(async (outputDir) => {
  await withBatchLock(outputDir, async () => {
    await assert.rejects(withBatchLock(outputDir, async () => {}), /已有批次/);
  });
  await assert.rejects(readFile(join(outputDir, '.batch.lock')), { code: 'ENOENT' });
}));
