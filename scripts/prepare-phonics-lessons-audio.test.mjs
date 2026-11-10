import test from 'node:test';
import assert from 'node:assert/strict';
import { localTtsEndpoint, planLesson, matchingSource, keepExistingRecording, selectValidSource, batchPreparation, lessonMatchesBatch, validLessonId } from './prepare-phonics-lessons-audio.mjs';

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

test('長母音批次沿用安全識別，批次路徑不接受任意輸入', () => {
  assert.match(batchPreparation(), /short-vowels$/);
  assert.match(batchPreparation('long-vowels'), /long-vowels$/);
  for (const invalid of ['../long-vowels', 'long-a', '', '/tmp']) assert.throws(() => batchPreparation(invalid));
  const [job] = planLesson({ id: 'long-a', jobs: [{ key: 'cake', text: 'cake', kind: 'word' }] });
  assert.equal(job.assetGuid, 'phonics-long-a-cake');
  assert.throws(() => planLesson({ id: 'long-x', jobs: [] }));
});


test('第三至五章僅接受明列課程，批次配對不放寬長短母音範圍', () => {
  assert.match(batchPreparation('phonics-345'), /phonics-345$/);
  for (const id of ['blends-l', 'blends-r', 'blends-s', 'blends-final', 'blends-three',
    'digraph-sh', 'digraph-ch', 'digraph-th-voiceless', 'digraph-th-voiced', 'digraph-wh', 'digraph-ph', 'digraph-tch',
    'r-ar', 'r-or', 'r-ore-oar']) {
    assert.equal(validLessonId(id), true);
    assert.equal(lessonMatchesBatch(id, 'phonics-345'), true);
    assert.equal(lessonMatchesBatch(id, 'short-vowels'), false);
    assert.equal(lessonMatchesBatch(id, 'long-vowels'), false);
    assert.equal(planLesson({ id, jobs: [{ key: 'example', text: 'example', kind: 'word' }] })[0].assetGuid, `phonics-${id}-example`);
  }
  for (const id of ['short-a', 'long-u']) assert.equal(lessonMatchesBatch(id, 'phonics-345'), false);
  for (const id of ['blends-unknown', 'digraph-sh/escape', 'r-ar-other', '../r-ar', 'r-', 'short-ar', 'long-sh']) {
    assert.equal(validLessonId(id), false);
    assert.throws(() => planLesson({ id, jobs: [] }));
  }
  assert.throws(() => lessonMatchesBatch('short-a', 'toString'));
  assert.throws(() => batchPreparation('__proto__'));
});

test('字尾變化使用獨立白名單，不可混入其他教材批次', () => {
  assert.match(batchPreparation('endings'), /endings$/);
  for (const suffix of ['s', 'es', 'ed', 'ing']) {
    const id = `endings-${suffix}`;
    assert.equal(validLessonId(id), true);
    assert.equal(lessonMatchesBatch(id, 'endings'), true);
    for (const batch of ['short-vowels', 'long-vowels', 'phonics-345']) assert.equal(lessonMatchesBatch(id, batch), false);
    assert.equal(planLesson({ id, jobs: [{ key: 'test', kind: 'word', text: 'test' }] })[0].assetGuid, `phonics-${id}-test`);
  }
  for (const id of ['endings', 'endings-ies', 'endings-ing/escape', '../endings-s']) assert.equal(validLessonId(id), false);
  for (const id of ['short-a', 'long-a', 'digraph-sh']) assert.equal(lessonMatchesBatch(id, 'endings'), false);
});
