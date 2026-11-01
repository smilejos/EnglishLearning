import test from 'node:test';
import assert from 'node:assert/strict';
import { localTtsEndpoint, planLesson, matchingSource, keepExistingRecording, selectValidSource } from './prepare-phonics-lessons-audio.mjs';

test('產音端點僅允許本機 HTTP，不接受外部或夾帶帳密', () => {
  assert.match(localTtsEndpoint(), /^http:\/\/127\.0\.0\.1:8000/);
  assert.equal(localTtsEndpoint('http://[::1]:8000/v1/audio/speech'), 'http://[::1]:8000/v1/audio/speech');
  for (const endpoint of ['https://localhost/speech', 'http://cloud.example/speech', 'http://user:password@localhost/speech'])
    assert.throws(() => localTtsEndpoint(endpoint));
});

test('有效既存檔缺 metadata 或 hash 不符時停止，不能覆寫或重產', async () => {
  const deps = { validate: async () => ({}), read: async () => Buffer.from('existing-valid-mp3') };
  await assert.rejects(keepExistingRecording('pen.mp3', undefined, deps), /避免覆寫/);
  await assert.rejects(keepExistingRecording('pen.mp3', { sha256: 'different' }, deps), /避免覆寫/);
  assert.equal(await keepExistingRecording('pen.mp3', {}, deps), true);
  assert.equal(await keepExistingRecording('pen.mp3', undefined, { ...deps, validate: async () => { throw new Error('不可解碼'); } }), false);
});

test('首來源失效仍檢查後續候選，避免重產已有有效替代錄音', async () => {
  const [job] = planLesson({ id: 'short-e', jobs: [{ key: 'pen', text: 'pen', kind: 'word' }] });
  const broken = { text: job.text, textHash: job.textHash, kind: 'word', sourcePath: 'broken.mp3' };
  const valid = { ...broken, sourcePath: 'valid.mp3' };
  const excluded = [];
  const chosen = await selectValidSource(job, [broken, valid], async (source) => {
    if (source === broken) throw new Error('hash不符');
    return { bytes: 123 };
  }, (source) => excluded.push(source));
  assert.equal(chosen.source, valid);
  assert.deepEqual(excluded, [broken]);
});

test('新課工作識別與目的路徑不能誤寫其他課程或越過音訊目錄', () => {
  const jobs = planLesson({ id: 'short-e', jobs: [{ key: 'pen', text: 'pen', kind: 'word' }] });
  assert.equal(jobs[0].assetGuid, 'phonics-short-e-pen');
  assert.equal(jobs[0].relativePath, 'pen.mp3');
  assert.throws(() => planLesson({ id: '../short-e', jobs: [] }));
  assert.throws(() => planLesson({ id: 'short-e', jobs: [{ key: '../pen', text: 'pen', kind: 'word' }] }));
  assert.throws(() => planLesson({ id: 'short-e', jobs: [{ key: 'pen', text: 'pen', kind: 'word' }, { key: 'pen', text: 'pet', kind: 'word' }] }));
});

test('重用需要文字與 hash 相符，整詞不能誤用句子素材；不同原聲線仍保留候選', () => {
  const [job] = planLesson({ id: 'short-e', jobs: [{ key: 'pen', text: 'pen', kind: 'word' }] });
  const wrongKind = { text: 'pen', textHash: job.textHash, kind: 'sentence' };
  const source = { text: 'pen', textHash: job.textHash, kind: 'word', profile: { voice: 'original' } };
  assert.equal(matchingSource(job, [wrongKind, source]), source);
  assert.equal(matchingSource(job, [{ ...source, textHash: 'stale' }]), undefined);
  assert.equal(matchingSource(job, [{ ...source, text: 'Pen' }]), undefined);
});
