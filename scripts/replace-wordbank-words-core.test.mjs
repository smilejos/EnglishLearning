import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { createWordReplacementPlan, validateWordReplacementPlan, runWordReplacement,
  writeWordReplacementStatus, withWordReplacementLock } from './replace-wordbank-words-core.mjs';

const guids = ['11111111-1111-5111-8111-111111111111', '22222222-2222-5222-8222-222222222222', '33333333-3333-5333-8333-333333333333'];
const profile = { model: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', voice: 'Serena',
  instruct: 'Speak clearly.', lang_code: 'English', response_format: 'mp3' };
const audio = Buffer.from('valid-audio');
const validate = async path => {
  assert.equal(await readFile(path, 'utf8'), 'valid-audio');
  return { durationSeconds: 1.25, bytes: (await stat(path)).size };
};
function planFor(words = ['apple', 'bank']) {
  return createWordReplacementPlan({ entries: words.map((word, i) => ({ guid: guids[i], word,
    examples: [{ guid: guids[2], en: 'Do not generate this sentence.' }], previous: null })),
  profile, origin: 'http://192.168.1.124:8000', batchId: 'test-batch', target: { database: 'wordbank_test' } });
}
async function fixture(run) {
  const base = await mkdtemp(join(tmpdir(), 'replace-words-test-'));
  const workDir = join(base, 'work'), audioDir = join(base, 'volume');
  await mkdir(audioDir);
  const current = new Map();
  const calls = { synthesize: [], resume: [], download: [], apply: [] };
  const deps = { validate,
    synthesize: async options => { calls.synthesize.push(options.text); return audio; },
    resumeEvent: async options => { calls.resume.push(options.eventId); return audio; },
    download: async options => { calls.download.push(options.file); return audio; },
    readCurrent: async job => current.get(job.assetGuid) ?? null,
    applyOne: async (job, asset, previous) => { calls.apply.push({ job, asset, previous }); current.set(job.assetGuid, asset); } };
  const logs = [];
  const options = { plan: planFor(), workDir, audioDir, apply: true, deps, log: value => logs.push(value) };
  try { await run({ base, workDir, audioDir, current, calls, deps, options, logs }); }
  finally { await rm(base, { recursive: true, force: true }); }
}
const record = async (workDir, guid = guids[0]) => JSON.parse(await readFile(join(workDir, 'records', `${guid}.json`), 'utf8'));

test('計畫只包含 word、穩定 GUID 與新批次目錄，保留原 metadata', () => {
  const old = { relativePath: 'wordbank/old/word.mp3', voice: 'old' };
  const plan = createWordReplacementPlan({ entries: [{ guid: guids[0], word: ' apple ', previous: old,
    examples: [{ guid: guids[1], en: 'No.' }] }], profile, origin: 'http://192.168.1.124:8000', batchId: 'next', target: null });
  assert.equal(plan.total, 1);
  assert.deepEqual(plan.jobs.map(job => job.kind), ['word']);
  assert.equal(plan.jobs[0].assetGuid, plan.jobs[0].entryGuid);
  assert.equal(plan.jobs[0].text, 'apple');
  assert.match(plan.jobs[0].relativePath, /^wordbank\/[a-f0-9]{16}-next\//);
  assert.deepEqual(plan.jobs[0].previous, old);
  old.voice = 'changed';
  assert.equal(plan.jobs[0].previous.voice, 'old');
  assert.throws(() => createWordReplacementPlan({ entries: [{ guid: guids[0], word: '' }], profile, batchId: 'next' }), /文字無效/);
  assert.throws(() => createWordReplacementPlan({ entries: [{ guid: guids[0], word: 'a' }, { guid: guids[0], word: 'b' }], profile, batchId: 'next' }), /重複/);
});

test('改動計畫或路徑拒絕執行', () => {
  const plan = planFor();
  plan.jobs[0].kind = 'example';
  assert.throws(() => validateWordReplacementPlan(plan), /改動/);
  assert.throws(() => createWordReplacementPlan({ entries: [{ guid: guids[0], word: 'a' }], profile, batchId: '../../bad' }), /batchId/);
});

test('逐字產生並替換，進度包含序號／總數／單字；續跑不重產', async () => fixture(async ({ options, calls, logs, workDir }) => {
  const first = await runWordReplacement(options);
  assert.equal(first.generated, 2);
  assert.equal(first.applied, 2);
  assert.deepEqual(calls.synthesize, ['apple', 'bank']);
  assert.deepEqual(logs.filter(line => /^\d+ \/ /.test(line)), ['1 / 2 - apple', '2 / 2 - bank']);
  assert.equal((await record(workDir)).stage, 'applied');
  const second = await runWordReplacement(options);
  assert.equal(second.skipped, 2);
  assert.equal(calls.synthesize.length, 2);
  assert.equal(calls.apply.length, 2);
  const status = await readFile(join(workDir, 'status.csv'), 'utf8');
  assert.match(status, /"1","2","apple","applied"/);
  assert.equal(status.trim().split('\n').length, 3);
}));

test('離線產生不碰 volume 與 DB，之後 apply 直接重用新音檔', async () => fixture(async ({ options, calls, audioDir }) => {
  const first = await runWordReplacement({ ...options, apply: false });
  assert.equal(first.generated, 2);
  assert.equal(calls.apply.length, 0);
  await assert.rejects(stat(join(audioDir, options.plan.jobs[0].relativePath)), { code: 'ENOENT' });
  const second = await runWordReplacement(options);
  assert.equal(second.applied, 2);
  assert.equal(calls.synthesize.length, 2);
}));

test('queued 中斷只恢復事件 GET，不再 POST，保留未處理字', async () => fixture(async ({ options, calls, deps, workDir }) => {
  deps.synthesize = async ({ onEvent, text }) => {
    calls.synthesize.push(text);
    await onEvent({ stage: 'queued', eventId: 'event-1' });
    throw new Error('connection interrupted');
  };
  const first = await runWordReplacement(options);
  assert.equal(first.failed.length, 1);
  assert.equal(first.failed[0].text, 'apple');
  assert.equal((await record(workDir)).stage, 'queued');
  deps.synthesize = async ({ text }) => { calls.synthesize.push(text); return audio; };
  const second = await runWordReplacement(options);
  assert.equal(second.applied, 2);
  assert.deepEqual(calls.resume, ['event-1']);
  assert.deepEqual(calls.synthesize, ['apple', 'bank']);
}));

test('ready 下載中斷只使用 FileData，不能重新產音', async () => fixture(async ({ options, calls, deps, workDir }) => {
  const file = { path: '/tmp/voice.wav' };
  deps.synthesize = async ({ onEvent, text }) => {
    calls.synthesize.push(text);
    await onEvent({ stage: 'queued', eventId: 'event-1' });
    await onEvent({ stage: 'ready', eventId: 'event-1', file });
    throw new Error('download interrupted');
  };
  await runWordReplacement({ ...options, plan: planFor(['apple']) });
  assert.equal((await record(workDir)).stage, 'ready');
  const resumed = await runWordReplacement({ ...options, plan: JSON.parse(await readFile(join(workDir, 'plan.json'), 'utf8')) });
  assert.equal(resumed.applied, 1);
  assert.deepEqual(calls.download, [file]);
  assert.deepEqual(calls.synthesize, ['apple']);
}));

test('requesting 結果不明預設停止，明示 retryUnknown 才重新 POST', async () => fixture(async ({ options, calls, deps }) => {
  options.plan = planFor(['apple']);
  deps.synthesize = async () => { calls.synthesize.push('unknown'); throw new Error('socket closed before event_id'); };
  assert.equal((await runWordReplacement(options)).failed.length, 1);
  const second = await runWordReplacement(options);
  assert.match(second.failed[0].error, /--retry-unknown/);
  assert.equal(calls.synthesize.length, 1);
  deps.synthesize = async () => { calls.synthesize.push('confirmed retry'); return audio; };
  assert.equal((await runWordReplacement({ ...options, retryUnknown: true })).applied, 1);
  assert.equal(calls.synthesize.length, 2);
}));

test('舊 ready 下載已過期時預設仍只 GET，明示 retryUnknown 才重產', async () => fixture(async ({ options, calls, deps, workDir }) => {
  options.plan = planFor(['apple']);
  deps.synthesize = async ({ onEvent, text }) => {
    calls.synthesize.push(text);
    await onEvent({ stage: 'ready', eventId: 'expired-event', file: { path: '/cache/old.wav' } });
    throw new Error('download connection lost');
  };
  await runWordReplacement(options);
  deps.download = async () => { calls.download.push('expired'); throw new Error('HTTP 404'); };
  const failed = await runWordReplacement(options);
  assert.match(failed.failed[0].error, /404/);
  assert.equal(calls.synthesize.length, 1);
  assert.equal((await record(workDir)).attempts, 1);
  deps.synthesize = async ({ text }) => { calls.synthesize.push(text); return audio; };
  assert.equal((await runWordReplacement({ ...options, retryUnknown: true })).applied, 1);
  assert.equal(calls.synthesize.length, 2);
  assert.equal((await record(workDir)).attempts, 2);
}));

test('生成完成、DB 寫入失敗可續接，不呼叫 TTS', async () => fixture(async ({ options, calls, deps, workDir }) => {
  options.plan = planFor(['apple']);
  const applyOne = deps.applyOne;
  deps.applyOne = async () => { throw new Error('DB disconnected'); };
  const first = await runWordReplacement(options);
  assert.match(first.failed[0].error, /DB disconnected/);
  assert.equal((await record(workDir)).stage, 'generated');
  deps.applyOne = applyOne;
  assert.equal((await runWordReplacement(options)).applied, 1);
  assert.equal(calls.synthesize.length, 1);
}));

test('DB 已切換但回應遺失時，嚴格比對 metadata 後恢復為 applied', async () => fixture(async ({ options, calls, deps, current, workDir }) => {
  options.plan = planFor(['apple']);
  deps.applyOne = async (job, asset) => { current.set(job.assetGuid, asset); throw new Error('commit response lost'); };
  const first = await runWordReplacement(options);
  assert.equal(first.failed.length, 1);
  assert.equal((await record(workDir)).stage, 'generated');
  deps.applyOne = async () => { assert.fail('不應再次寫 DB'); };
  const resumed = await runWordReplacement(options);
  assert.equal(resumed.skipped, 1);
  assert.equal(calls.synthesize.length, 1);
  assert.equal((await record(workDir)).stage, 'applied');
}));

test('metadata 只有路徑相同不算已套用', async () => fixture(async ({ options, deps, current, calls }) => {
  options.plan = planFor(['apple']);
  await runWordReplacement({ ...options, apply: false });
  const saved = await record(options.workDir);
  current.set(guids[0], { ...saved.asset, voice: 'another voice' });
  deps.applyOne = async () => { calls.apply.push('CAS conflict'); throw new Error('原 metadata 已改動'); };
  const result = await runWordReplacement(options);
  assert.match(result.failed[0].error, /已改動/);
  assert.equal(calls.apply.length, 1);
  assert.equal(calls.synthesize.length, 1);
}));

test('最後一字失敗也回報非成功，前面已完成的字不重產', async () => fixture(async ({ options, deps, calls }) => {
  deps.synthesize = async ({ text, onEvent }) => {
    calls.synthesize.push(text);
    if (text === 'bank') { await onEvent({ stage: 'queued', eventId: 'bank-event' }); throw new Error('last failure'); }
    return audio;
  };
  const first = await runWordReplacement(options);
  assert.equal(first.applied, 1);
  assert.equal(first.failed[0].index, 2);
  const resumed = await runWordReplacement(options);
  assert.equal(resumed.applied, 1);
  assert.equal(resumed.skipped, 1);
  assert.deepEqual(calls.synthesize, ['apple', 'bank']);
  assert.deepEqual(calls.resume, ['bank-event']);
}));

test('正式目的檔不同內容拒絕覆寫，舊錄音保留', async () => fixture(async ({ options, audioDir, calls }) => {
  options.plan = planFor(['apple']);
  const destination = join(audioDir, options.plan.jobs[0].relativePath);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, 'old-different-audio');
  const result = await runWordReplacement(options);
  assert.match(result.failed[0].error, /目的檔已有不同內容/);
  assert.equal(await readFile(destination, 'utf8'), 'old-different-audio');
  assert.equal(calls.apply.length, 0);
}));

test('音檔損毀或遺失停止，不靜默重新產音', async () => fixture(async ({ options, calls, workDir }) => {
  options.plan = planFor(['apple']);
  await runWordReplacement({ ...options, apply: false });
  const staged = join(workDir, 'staged', options.plan.jobs[0].relativePath);
  await writeFile(staged, 'invalid');
  assert.equal((await runWordReplacement(options)).failed.length, 1);
  await unlink(staged);
  assert.match((await runWordReplacement(options)).failed[0].error, /音檔遺失/);
  assert.equal(calls.synthesize.length, 1);
}));

test('新音檔寫好但 generated 記錄尚未落盤時，直接收編不重產', async () => fixture(async ({ options, workDir, calls }) => {
  options.plan = planFor(['apple']);
  await mkdir(workDir, { recursive: true });
  await writeFile(join(workDir, 'plan.json'), JSON.stringify(options.plan));
  const staged = join(workDir, 'staged', options.plan.jobs[0].relativePath);
  await mkdir(join(staged, '..'), { recursive: true });
  await writeFile(staged, audio);
  assert.equal((await runWordReplacement(options)).applied, 1);
  assert.equal(calls.synthesize.length, 0);
}));

test('Ctrl-C 中斷保留 queued 記錄，下一次恢復', async () => fixture(async ({ options, deps, calls, workDir }) => {
  options.plan = planFor(['apple']);
  const controller = new AbortController();
  deps.synthesize = async ({ onEvent, signal }) => {
    calls.synthesize.push('apple');
    await onEvent({ stage: 'queued', eventId: 'interrupted-event' });
    controller.abort(new Error('SIGINT'));
    signal.throwIfAborted();
  };
  const first = await runWordReplacement({ ...options, signal: controller.signal });
  assert.match(first.stoppedReason, /停止訊號/);
  assert.equal((await record(workDir)).eventId, 'interrupted-event');
  assert.equal((await runWordReplacement(options)).applied, 1);
  assert.deepEqual(calls.resume, ['interrupted-event']);
}));

test('CSV 可表示逗號、引號與換行，status 一字一筆並包含未處理字', async () => fixture(async ({ options, workDir }) => {
  options.plan = planFor(['say, "hello"\nagain', 'bank']);
  const summary = await writeWordReplacementStatus({ plan: options.plan, workDir });
  assert.deepEqual(summary, { total: 2, counts: { pending: 2 } });
  const status = await readFile(join(workDir, 'status.csv'), 'utf8');
  assert.match(status, /"say, ""hello""\nagain","pending"/);
  assert.match(status, /"2","2","bank","pending"/);
}));

test('輸出鎖阻擋同時執行，同主機死亡 PID 可續接，跨主機鎖不自動移除', async () => fixture(async ({ workDir }) => {
  await withWordReplacementLock(workDir, async () => {
    await assert.rejects(withWordReplacementLock(workDir, async () => {}), /已有替換程序/);
    await assert.rejects(withWordReplacementLock(workDir, async () => {}, { recoverLock: true }), /已有替換程序/);
  });
  const path = join(workDir, '.replacement.lock');
  await writeFile(path, JSON.stringify({ host: hostname(), pid: 2147483647 }));
  assert.equal(await withWordReplacementLock(workDir, async () => 'recovered'), 'recovered');
  await writeFile(path, JSON.stringify({ host: 'different-host', pid: 2147483647 }));
  await assert.rejects(withWordReplacementLock(workDir, async () => {}), /另一主機/);
  assert.equal(await withWordReplacementLock(workDir, async () => 'confirmed-stopped', { recoverLock: true }), 'confirmed-stopped');
}));

test('相同 PID 但 processStart 已不同可接續，Linux 另一 PID namespace 不自動清鎖', async () => fixture(async ({ workDir }) => {
  await mkdir(workDir, { recursive: true });
  const path = join(workDir, '.replacement.lock');
  await writeFile(path, JSON.stringify({ host: hostname(), pid: process.pid, processStart: 'old-process-start' }));
  assert.equal(await withWordReplacementLock(workDir, async () => 'reused-pid'), 'reused-pid');
  if (process.platform === 'linux') {
    await writeFile(path, JSON.stringify({ host: hostname(), pid: process.pid,
      processStart: 'old-process-start', namespace: 'pid:[another-container]' }));
    await assert.rejects(withWordReplacementLock(workDir, async () => {}), /另一個容器/);
    assert.equal(await withWordReplacementLock(workDir, async () => 'confirmed-container-stopped', { recoverLock: true }), 'confirmed-container-stopped');
  }
}));

test('同輸出目錄拒絕不同計畫；record 不能混用其他批次', async () => fixture(async ({ options, workDir }) => {
  await runWordReplacement(options);
  const another = createWordReplacementPlan({ entries: [{ guid: guids[0], word: 'apple' }], profile,
    origin: options.plan.origin, batchId: 'other' });
  await assert.rejects(runWordReplacement({ ...options, plan: another }), /其他批次/);
  const path = join(workDir, 'records', `${guids[0]}.json`);
  const saved = await record(workDir);
  await writeFile(path, JSON.stringify({ ...saved, planHash: 'different' }));
  await assert.rejects(writeWordReplacementStatus({ plan: options.plan, workDir }), /記錄與計畫不一致/);
}));


test('version2只選例句及解釋，使用既有GUID／文字，獨立CSV種類欄且續跑零重產', async () => fixture(async ({ options, calls, workDir }) => {
  const plan = createWordReplacementPlan({ entries: [{ guid: guids[0], word: 'apple', assets: [
    { assetGuid: guids[1], kind: 'example', text: ' An apple is red. ', previous: null },
    { assetGuid: guids[2], kind: 'explanation', text: 'A round fruit.', previous: null },
  ] }], kinds: ['example', 'explanation'], profile, origin: 'http://192.168.1.124:8000', batchId: 'other', target: null });
  assert.equal(plan.version, 2);
  assert.deepEqual(plan.kinds, ['example', 'explanation']);
  assert.deepEqual(plan.jobs.map(job => [job.assetGuid, job.entryGuid, job.kind, job.text]), [
    [guids[1], guids[0], 'example', 'An apple is red.'], [guids[2], guids[0], 'explanation', 'A round fruit.'],
  ]);
  const first = await runWordReplacement({ ...options, plan });
  assert.equal(first.applied, 2);
  assert.equal((await runWordReplacement({ ...options, plan })).skipped, 2);
  assert.deepEqual(calls.synthesize, ['An apple is red.', 'A round fruit.']);
  const csv = await readFile(join(workDir, 'status.csv'), 'utf8');
  assert.match(csv.split('\n')[0], /"種類"$/);
  assert.match(csv, /"example"/); assert.match(csv, /"explanation"/);
  for (const line of csv.trim().split('\n')) assert.equal(line.split(',').length, 10);
}));

test('version2拒絕重複／parent GUID衝突與沒有選中英文的清單', () => {
  const base = { kinds: ['example', 'explanation'], profile, batchId: 'other' };
  for (const assets of [
    [{ assetGuid: guids[0], kind: 'example', text: 'Text.' }],
    [{ assetGuid: guids[1], kind: 'example', text: 'One.' }, { assetGuid: guids[1], kind: 'explanation', text: 'Two.' }],
  ]) assert.throws(() => createWordReplacementPlan({ ...base, entries: [{ guid: guids[0], word: 'apple', assets }] }), /GUID/);
  assert.throws(() => createWordReplacementPlan({ ...base, entries: [{ guid: guids[0], word: 'apple', assets: [] }] }), /沒有非空白英文/);
});
