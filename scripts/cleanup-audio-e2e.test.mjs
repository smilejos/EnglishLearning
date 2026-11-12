// 真實 CLI＋隔離 _test schema＋暫存檔，不碰正式 DB／volume，不呼叫生成 API。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPool } from '../shared/src/db.ts';
import { resolveTestDatabaseUrl } from '../shared/src/testing.ts';
import { AUDIO_REFERENCE_TABLES, readAudioReferences, withAudioCleanupSnapshot } from './cleanup-audio-db.mjs';
import { createCleanupPlan, applyCleanupPlan } from './cleanup-audio-core.mjs';

const exec = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t) {
  // 連線前必經共用 _test 保護；完全不採用 DATABASE_URL。
  const testUrl = resolveTestDatabaseUrl(), admin = createPool(testUrl);
  const schema = `audio_cleanup_${randomUUID().replaceAll('-', '')}`;
  const isolatedUrl = new URL(testUrl); isolatedUrl.searchParams.set('options', `-csearch_path=${schema}`);
  const pool = createPool(isolatedUrl.href, { max: 4 });
  const temporary = await mkdtemp(path.join(tmpdir(), 'audio-cleanup-cli-'));
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const table of AUDIO_REFERENCE_TABLES)
    await admin.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
  t.after(async () => {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    await rm(temporary, { recursive: true, force: true });
  });
  const audioDir = path.join(temporary, 'audio'), workDir = path.join(temporary, 'work'); await mkdir(audioDir);
  const add = async relativePath => {
    await mkdir(path.dirname(path.join(audioDir, relativePath)), { recursive: true });
    await writeFile(path.join(audioDir, relativePath), `recording:${relativePath}`);
  };
  const cli = (...args) => exec(process.execPath, ['--import', 'tsx', 'scripts/cleanup-audio.mjs', ...args,
    '--work-dir', workDir], { cwd: root, timeout: 20_000,
    env: { ...process.env, DATABASE_URL: isolatedUrl.href, AUDIO_DIR: audioDir } });
  return { schema, admin, pool, audioDir, workDir, add, cli };
}

test('CLI plan→apply→重跑：完整SQL來源皆保留，真正刪除孤檔且DB逐表不變', { timeout: 45_000 }, async t => {
  const f = await fixture(t), references = [];
  const paragraphPaths = ['articles/1/en.m4a', 'articles/1/zh.wav']; references.push(...paragraphPaths);
  await f.pool.query('INSERT INTO paragraphs(article_id,idx,text,en_audio_path,zh_audio_path) VALUES(1,0,\'test\',$1,$2)', paragraphPaths);
  references.push('words/1/word.mp3');
  await f.pool.query("INSERT INTO words(normalized_word,en_audio_path) VALUES('word',$1)", [references.at(-1)]);
  const explainPaths = ['en-explain', 'en-example', 'zh-translation', 'zh-explain', 'zh-example'].map(kind => `words/1/${kind}.wav`);
  references.push(...explainPaths);
  await f.pool.query(`INSERT INTO word_explanations(word_id,article_id,en_explanation_audio_path,en_example_audio_path,
    zh_translation_audio_path,zh_explanation_audio_path,zh_example_audio_path) VALUES(1,1,$1,$2,$3,$4,$5)`, explainPaths);
  const word = randomUUID(), registry = randomUUID(), hash = 'a'.repeat(64), profile = 'b'.repeat(16);
  const wordPath = `wordbank/current/${word}.mp3`, registryPath = `wordbank/${profile}/${registry}.mp3`;
  references.push(wordPath, registryPath);
  await f.pool.query(`INSERT INTO wordbank_audio(asset_guid,entry_guid,kind,relative_path,model,voice,instruct,language,
    text_hash,duration_seconds,bytes,generated_at) VALUES($1,$1,'word',$2,'model','voice','instruct','en',$3,1,100,now())`, [word, wordPath, hash]);
  // 無bindings的registry metadata仍必須保留，不能因字庫優先讀新檔就刪除。
  await f.pool.query(`INSERT INTO audio_assets(asset_guid,profile_hash,profile,kind,text,text_hash,relative_path,
    sha256,bytes,duration_seconds,generated_at) VALUES($1,$2,'{}','word','word',$3,$4,$3,100,1,now())`,
  [registry, profile, hash, registryPath]);
  for (const [revision, status] of [[1, 'published'], [2, 'published'], [3, 'draft']]) {
    const relativePath = `scenarios/example/${revision}/${hash}.mp3`; references.push(relativePath);
    await f.pool.query(`INSERT INTO scenario_revisions(scenario_key,revision,content,media,content_hash,status)
      VALUES('example',$1,'{}',$2,$3,$4)`, [revision, { audio: { relativePath } }, hash, status]);
  }
  assert.deepEqual(new Set(await readAudioReferences(f.pool)), new Set(references));
  for (const file of references) await f.add(file);
  const orphan = 'wordbank/old/orphan.mp3'; await f.add(orphan);
  await f.add('unknown/keep.mp3'); await f.add('assets/p/notes.json');
  const before = {};
  for (const table of AUDIO_REFERENCE_TABLES) before[table] = (await f.pool.query(`SELECT row_to_json(t) AS row FROM ${table} t`)).rows;
  const planned = await f.cli('plan', '--min-age-hours', '0'); assert.match(planned.stdout, /未刪除音檔/);
  const plan = JSON.parse(await readFile(path.join(f.workDir, 'plan.json'), 'utf8'));
  assert.equal(plan.summary.candidate.count, 1); assert.equal(plan.summary.referenced.count, references.length);
  await access(path.join(f.audioDir, orphan)); assert.match(await readFile(path.join(f.workDir, 'plan.csv'), 'utf8'), /orphan.mp3/);
  const applied = await f.cli('apply'); assert.match(applied.stdout, /"deleted": 1/);
  await assert.rejects(access(path.join(f.audioDir, orphan)), { code: 'ENOENT' });
  for (const file of references) await access(path.join(f.audioDir, file));
  await access(path.join(f.audioDir, 'unknown/keep.mp3')); await access(path.join(f.audioDir, 'assets/p/notes.json'));
  for (const table of AUDIO_REFERENCE_TABLES)
    assert.deepEqual((await f.pool.query(`SELECT row_to_json(t) AS row FROM ${table} t`)).rows, before[table]);
  assert.match((await f.cli('apply')).stdout, /"alreadyAbsent": 1/);
  const progress = (await readFile(path.join(f.workDir, 'progress.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(progress.map(event => event.status), ['deleted', 'alreadyAbsent']);
});

test('SHARE等鎖期間writer提交的新引用可見；持鎖時新metadata寫入被阻擋', { timeout: 20_000 }, async t => {
  const f = await fixture(t), relativePath = 'words/1/in-flight.wav'; await f.add(relativePath);
  const plan = await withAudioCleanupSnapshot(f.pool, {}, snapshot => createCleanupPlan({ ...snapshot,
    audioDir: f.audioDir, minAgeHours: 0 }));
  const writer = await f.pool.connect();
  try {
    await writer.query('BEGIN');
    await writer.query("INSERT INTO words(normalized_word,en_audio_path) VALUES('during-lock',$1)", [relativePath]);
    const pending = withAudioCleanupSnapshot(f.pool, { apply: true }, async snapshot => {
      assert.ok(snapshot.references.includes(relativePath));
      await writer.query("SET lock_timeout = '100ms'");
      await assert.rejects(writer.query("INSERT INTO words(normalized_word) VALUES('blocked')"), /lock timeout/);
      await writer.query('RESET lock_timeout');
      return applyCleanupPlan({ ...snapshot, plan, audioDir: f.audioDir });
    });
    // 真實觀察 SHARE 正在等待，而非用固定sleep假設時序。
    const deadline = Date.now() + 2_000;
    while (true) {
      const waiting = await f.admin.query(`SELECT count(*)::int AS count FROM pg_locks
        WHERE relation=$1::regclass AND mode='ShareLock' AND NOT granted`, [`${f.schema}.words`]);
      if (waiting.rows[0].count) break;
      if (Date.now() > deadline) throw new Error('沒有觀察到 SHARE 等鎖');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await writer.query('COMMIT');
    const report = await pending;
    assert.equal(report.newlyReferenced, 1); assert.equal(report.deleted, 0);
    await access(path.join(f.audioDir, relativePath));
  } finally { await writer.query('ROLLBACK').catch(() => {}); writer.release(); }
});

test('情境缺少audio/path、null、非字串或空白路徑時fail closed', { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  for (const media of [{}, { audio: {} }, { audio: { relativePath: null } }, { audio: { relativePath: 42 } }, { audio: { relativePath: ' ' } }]) {
    await f.pool.query(`INSERT INTO scenario_revisions(scenario_key,revision,content,media,content_hash)
      VALUES('invalid',1,'{}',$1,$2)`, [media, 'a'.repeat(64)]);
    await assert.rejects(withAudioCleanupSnapshot(f.pool, {}, snapshot => snapshot), /情境版本缺少有效/);
    await f.pool.query('DELETE FROM scenario_revisions');
  }
});

test('CLI沒有plan或候選變更時非零結束並保存失敗，不會刪其餘檔', { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  await assert.rejects(f.cli('apply'), error => { assert.equal(error.code, 1); return true; });
  await f.add('wordbank/p/a.mp3'); await f.add('wordbank/p/z.mp3');
  await f.cli('plan', '--min-age-hours', '0'); await writeFile(path.join(f.audioDir, 'wordbank/p/z.mp3'), 'changed');
  await assert.rejects(f.cli('apply'), error => { assert.equal(error.code, 1); assert.match(error.stderr, /音檔已變更/); return true; });
  const report = JSON.parse(await readFile(path.join(f.workDir, 'report.json'), 'utf8'));
  assert.equal(report.deleted, 0); assert.equal(report.failed.length, 1); await access(path.join(f.audioDir, 'wordbank/p/a.mp3'));
});

test('COMMIT失敗仍回報已刪數量，DB rollback不會虛構音檔復原', async () => {
  const calls = [], report = { deleted: 2, deletedBytes: 100, failed: [] };
  const client = { release() {}, async query(sql) {
    calls.push(sql);
    if (sql === 'COMMIT') throw new Error('模擬連線於COMMIT斷開');
    if (sql.includes('pg_try_advisory')) return { rows: [{ locked: true }] };
    if (sql.includes('current_database()')) return { rows: [{ database: 'audio_test' }] };
    if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
    return { rows: [] };
  } };
  await assert.rejects(withAudioCleanupSnapshot({ connect: async () => client }, { apply: true }, async () => report), error => {
    assert.equal(error.cleanupReport.deleted, 2); assert.equal(error.cleanupReport.deletedBytes, 100);
    assert.deepEqual(error.cleanupReport.failed, ['模擬連線於COMMIT斷開']); return true;
  });
  assert.equal(calls[0], 'BEGIN ISOLATION LEVEL READ COMMITTED'); assert.ok(calls.includes('ROLLBACK'));
});
