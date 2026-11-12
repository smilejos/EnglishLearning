import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, unlink, utimes, access, rename } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createCleanupPlan, applyCleanupPlan, validateCleanupPlan, cleanupPlanCsv, sha256 } from './cleanup-audio-core.mjs';
import { parseCleanupOptions } from './cleanup-audio.mjs';

const target = { database: 'audio_test', address: '127.0.0.1/32', port: 5433, schema: 'public' };
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'audio-cleanup-core-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const audioDir = path.join(root, 'audio'); await mkdir(audioDir);
  const add = async (relativePath, value = relativePath) => {
    await mkdir(path.dirname(path.join(audioDir, relativePath)), { recursive: true });
    await writeFile(path.join(audioDir, relativePath), value);
  };
  const plan = (options = {}) => createCleanupPlan({ audioDir, target, references: [], now: Date.now() + 172_800_000, ...options });
  const apply = (saved, options = {}) => applyCleanupPlan({ audioDir, target, references: [], plan: saved, ...options });
  return { root, audioDir, add, plan, apply };
}
const missing = file => assert.rejects(access(file), { code: 'ENOENT' });
function resign(plan) { delete plan.planHash; plan.planHash = sha256(JSON.stringify(plan)); return plan; }

test('plan 唯讀盤點，所有來源引用都保留；只有已知 namespace 的音檔成為候選', async t => {
  const f = await fixture(t), references = ['articles/1/en.m4a', 'articles/1/zh.wav', 'words/1/en.wav',
    'words/1/explain.m4a', 'words/1/example.mp3', 'words/1/translation.mp3', 'words/1/zh-explain.wav',
    'words/1/zh-example.wav', 'wordbank/current/id.mp3', 'wordbank/registry-old/id.mp3', 'scenarios/old/1/audio.mp3'];
  for (const file of references) await f.add(file);
  await f.add('wordbank/old/unused.mp3'); await f.add('assets/old/unused.mp3');
  await f.add('unexpected/unused.mp3'); await f.add('words/1/readme.txt'); await f.add('at-root.mp3');
  const plan = await f.plan({ references });
  assert.equal(plan.summary.referenced.count, references.length);
  assert.equal(plan.summary.candidate.count, 2); assert.equal(plan.summary.ignored.count, 3);
  assert.match(cleanupPlanCsv(plan), /wordbank\/old\/unused.mp3/);
  for (const file of plan.files) assert.ok(await readFile(path.join(f.audioDir, file.relativePath)));
  const report = await f.apply(plan, { references });
  assert.equal(report.deleted, 2); assert.equal(report.failed.length, 0);
  for (const file of references) assert.ok(await readFile(path.join(f.audioDir, file)));
  await missing(path.join(f.audioDir, 'wordbank/old/unused.mp3'));
  assert.equal((await f.apply(plan, { references })).alreadyAbsent, 2);
});

test('預設排除24h內新增／變更檔，plan 時可明確設0', async t => {
  const f = await fixture(t); await f.add('wordbank/old/id.mp3');
  const plan = await f.plan({ now: Date.now() });
  assert.equal(plan.minAgeHours, 24); assert.equal(plan.summary.recent.count, 1);
  const unrestricted = await f.plan({ now: Date.now() + 1, minAgeHours: 0 });
  assert.equal(unrestricted.summary.candidate.count, 1);
});

test('plan 後新增引用：apply 保留並回報，其他未引用候選仍可刪除', async t => {
  const f = await fixture(t); await f.add('assets/p/new-reference.mp3'); await f.add('wordbank/p/orphan.mp3');
  const plan = await f.plan(), report = await f.apply(plan, { references: ['assets/p/new-reference.mp3'] });
  assert.equal(report.newlyReferenced, 1); assert.equal(report.deleted, 1);
  await access(path.join(f.audioDir, 'assets/p/new-reference.mp3'));
});

test('候選內容改變會在任何刪除前失敗', async t => {
  const f = await fixture(t); await f.add('wordbank/p/a.mp3'); await f.add('wordbank/p/z.mp3');
  const plan = await f.plan(); await f.add('wordbank/p/z.mp3', 'changed content');
  await assert.rejects(f.apply(plan), /音檔已變更/);
  await access(path.join(f.audioDir, 'wordbank/p/a.mp3'));
  assert.equal(await readFile(path.join(f.audioDir, 'wordbank/p/z.mp3'), 'utf8'), 'changed content');
});

test('內容雜湊相同但touch或inode改變也停止', async t => {
  const f = await fixture(t); const file = 'words/1/same.wav'; await f.add(file, 'same');
  let plan = await f.plan(); await utimes(path.join(f.audioDir, file), new Date(), new Date('2020-01-01'));
  await assert.rejects(f.apply(plan), /音檔已變更/);
  plan = await f.plan(); await rename(path.join(f.audioDir, file), path.join(f.audioDir, 'old'));
  await f.add(file, 'same'); await assert.rejects(f.apply(plan), /音檔已變更/);
});

test('plan 不跟隨檔案或目錄 symlink，apply 拒絕候選被替換為symlink', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside'); await mkdir(outside);
  await writeFile(path.join(outside, 'keep.mp3'), 'outside'); await mkdir(path.join(f.audioDir, 'words'));
  await symlink(outside, path.join(f.audioDir, 'words', 'linked-dir'));
  await symlink(path.join(outside, 'keep.mp3'), path.join(f.audioDir, 'words', 'linked.mp3'));
  await f.add('wordbank/p/candidate.mp3'); const plan = await f.plan();
  assert.equal(plan.summary.ignored.count, 2); assert.equal(plan.summary.candidate.count, 1);
  await unlink(path.join(f.audioDir, 'wordbank/p/candidate.mp3'));
  await symlink(path.join(outside, 'keep.mp3'), path.join(f.audioDir, 'wordbank/p/candidate.mp3'));
  await assert.rejects(f.apply(plan), /symlink/);
  assert.equal(await readFile(path.join(outside, 'keep.mp3'), 'utf8'), 'outside');
});

test('apply 拒絕候選父目錄變成symlink與根目錄被替換', async t => {
  const f = await fixture(t); await f.add('wordbank/p/a.mp3'); const plan = await f.plan();
  await rename(path.join(f.audioDir, 'wordbank/p'), path.join(f.audioDir, 'other'));
  await symlink(path.join(f.audioDir, 'other'), path.join(f.audioDir, 'wordbank/p'));
  await assert.rejects(f.apply(plan), /symlink/);
  await rename(f.audioDir, path.join(f.root, 'old-audio')); await mkdir(f.audioDir);
  await assert.rejects(f.apply(plan), /根目錄/);
});

test('錯資料庫／schema或錯根目錄不刪，清單雜湊及越界路徑拒絕', async t => {
  const f = await fixture(t); await f.add('assets/p/a.mp3'); const plan = await f.plan();
  await assert.rejects(f.apply(plan, { target: { ...target, schema: 'other' } }), /資料庫目標/);
  const tampered = structuredClone(plan); tampered.files[0].bytes++;
  assert.throws(() => validateCleanupPlan(tampered), /雜湊/);
  for (const file of ['../escape.mp3', '/tmp/escape.mp3', 'wordbank//a.mp3', 'wordbank/./a.mp3', 'wordbank/..\\escape.mp3']) {
    const unsafe = structuredClone(plan); unsafe.files[0].relativePath = file; resign(unsafe);
    await assert.rejects(f.apply(unsafe), /路徑不安全/);
  }
  await access(path.join(f.audioDir, 'assets/p/a.mp3'));
});

test('null以外無效DB引用即停止，避免把未知引用當成未使用', async t => {
  const f = await fixture(t); await f.add('wordbank/p/a.mp3');
  for (const reference of ['', '../wordbank/p/a.mp3', '/audio/wordbank/p/a.mp3', null])
    await assert.rejects(f.plan({ references: [reference] }), /相對路徑不安全/);
});

test('刪除中途失敗保存已刪數量，重跑只刪剩餘檔', async t => {
  const f = await fixture(t); await f.add('wordbank/p/a.mp3'); await f.add('wordbank/p/b.mp3'); const plan = await f.plan();
  let calls = 0;
  await assert.rejects(f.apply(plan, { removeFile: async file => {
    if (++calls === 2) throw new Error('模擬權限錯誤'); await unlink(file);
  } }), error => {
    assert.equal(error.cleanupReport.deleted, 1); assert.deepEqual(error.cleanupReport.failed, ['模擬權限錯誤']);
    assert.ok(error.cleanupReport.finishedAt); return true;
  });
  const report = await f.apply(plan); assert.equal(report.deleted, 1); assert.equal(report.alreadyAbsent, 1);
});

test('停止訊號不會刪除，參數預設只plan且未知參數拒絕', async t => {
  const f = await fixture(t); await f.add('wordbank/p/a.mp3'); const plan = await f.plan();
  const controller = new AbortController(); controller.abort(new Error('test stop'));
  await assert.rejects(f.apply(plan, { signal: controller.signal }), /test stop/);
  await access(path.join(f.audioDir, 'wordbank/p/a.mp3'));
  assert.equal(parseCleanupOptions([]).command, 'plan');
  assert.equal(parseCleanupOptions(['plan', '--min-age-hours', '0'])['min-age-hours'], 0);
  for (const args of [['--apply'], ['run'], ['apply', '--min-age-hours', '0'], ['plan', '--min-age-hours', '-1']])
    assert.throws(() => parseCleanupOptions(args));
});

test('持鎖DB連線檢查失敗後停止unlink，保留已刪數與其餘檔', async t => {
  const f = await fixture(t); await f.add('wordbank/p/a.mp3'); await f.add('wordbank/p/b.mp3'); const plan = await f.plan();
  let checks = 0;
  await assert.rejects(f.apply(plan, { assertConnection: async () => {
    if (++checks === 2) throw new Error('DB 連線已失效');
  } }), error => {
    assert.equal(error.cleanupReport.deleted, 1); assert.deepEqual(error.cleanupReport.failed, ['DB 連線已失效']); return true;
  });
  await missing(path.join(f.audioDir, 'wordbank/p/a.mp3')); await access(path.join(f.audioDir, 'wordbank/p/b.mp3'));
});
