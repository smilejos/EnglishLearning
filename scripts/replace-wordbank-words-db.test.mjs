// 只連隔離測試庫；不清全表，每個案例僅建立／刪除自己的 UUID 詞條。
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createPool } from '../shared/src/db.ts';
import { resolveTestDatabaseUrl } from '../shared/src/testing.ts';
import {
  assertDatabaseIdentity, audioMetadata, databaseIdentity, sameAudioMetadata,
  snapshotWordbank, wordReplacementStore,
} from './replace-wordbank-words-db.mjs';

let pool;
before(() => { pool = createPool(resolveTestDatabaseUrl()); });
after(async () => { await pool?.end(); });

const textHash = text => createHash('sha256').update(text.trim()).digest('hex');

async function insertAudio(asset) {
  await pool.query(`INSERT INTO wordbank_audio
    (asset_guid, entry_guid, kind, relative_path, model, voice, instruct, language,
     text_hash, duration_seconds, bytes, generated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [asset.assetGuid, asset.entryGuid, asset.kind, asset.relativePath, asset.model, asset.voice,
    asset.instruct, asset.language, asset.textHash, asset.durationSeconds, asset.bytes, asset.generatedAt]);
}

async function fixture(t, { previous = true, level = 'basic', word } = {}) {
  const guid = randomUUID();
  const text = word ?? `word-replacement-${guid}`;
  await pool.query(`INSERT INTO wordbank_entries (guid, source_id, word, level)
    VALUES ($1, $2, $3, $4::jsonb)`, [guid, 2147480000, text, JSON.stringify({ list: level })]);
  t.after(async () => { await pool.query('DELETE FROM wordbank_entries WHERE guid=$1', [guid]); });
  const old = {
    assetGuid: guid, entryGuid: guid, kind: 'word', relativePath: `wordbank/old/${guid}.mp3`,
    model: 'old-model', voice: 'old-voice', instruct: 'old instruction', language: 'English',
    textHash: textHash(text), durationSeconds: 1.25, bytes: 1234,
    generatedAt: '2026-10-01T00:00:00.000Z',
  };
  if (previous) await insertAudio(old);
  const desired = { ...old, relativePath: `wordbank/new-batch/${guid}.mp3`, model: 'Qwen-new-model',
    voice: 'Serena', durationSeconds: 1.5, bytes: 4321, generatedAt: '2026-11-12T00:00:00.000Z' };
  return { guid, text, previous: previous ? old : null, desired,
    job: { assetGuid: guid, entryGuid: guid, kind: 'word', text, textHash: textHash(text), relativePath: desired.relativePath } };
}

async function ownRows(guid) {
  return (await pool.query('SELECT * FROM wordbank_audio WHERE entry_guid=$1 ORDER BY asset_guid', [guid])).rows;
}

test('snapshot 包含不同級別與缺音詞條，保存舊 metadata 且不改動資料', async t => {
  const basic = await fixture(t);
  const expert = await fixture(t, { level: 'expert', previous: false });
  const unclassified = await fixture(t, { level: null, previous: false });
  const beforeRows = await ownRows(basic.guid);
  const snapshot = await snapshotWordbank(pool);
  assert.deepEqual(snapshot.target, await databaseIdentity(pool));
  for (const item of [basic, expert, unclassified]) {
    assert.deepEqual(snapshot.entries.find(entry => entry.guid === item.guid),
      { guid: item.guid, word: item.text, previous: item.previous });
  }
  assert.deepEqual(await ownRows(basic.guid), beforeRows);
  assert.deepEqual(await ownRows(expert.guid), []);
  assert.deepEqual(await ownRows(unclassified.guid), []);
});

test('applyOne 只替換整詞，保留相同詞條的例句與解釋錄音', async t => {
  const item = await fixture(t);
  for (const kind of ['example', 'explanation']) {
    const assetGuid = randomUUID();
    await insertAudio({ ...item.previous, assetGuid, kind, relativePath: `wordbank/old/${assetGuid}.mp3`,
      textHash: textHash(`${kind} text`) });
  }
  const beforeOther = (await ownRows(item.guid)).filter(row => row.kind !== 'word');
  const store = wordReplacementStore(pool);
  await store.applyOne(item.job, item.desired, item.previous);
  assert.deepEqual(await store.readCurrent(item.job), item.desired);
  assert.deepEqual((await ownRows(item.guid)).filter(row => row.kind !== 'word'), beforeOther);
});

test('applyOne 阻擋 plan 之後外部更新的錄音 metadata', async t => {
  const item = await fixture(t);
  await pool.query('UPDATE wordbank_audio SET voice=$2 WHERE asset_guid=$1', [item.guid, 'external-update']);
  const beforeRows = await ownRows(item.guid);
  await assert.rejects(wordReplacementStore(pool).applyOne(item.job, item.desired, item.previous), /其他操作更新/);
  assert.deepEqual(await ownRows(item.guid), beforeRows);
});

test('applyOne 阻擋 plan 之後已變更的單字文字', async t => {
  const item = await fixture(t);
  await pool.query('UPDATE wordbank_entries SET word=$2 WHERE guid=$1', [item.guid, 'changed word']);
  await assert.rejects(wordReplacementStore(pool).applyOne(item.job, item.desired, item.previous), /文字變更/);
  assert.deepEqual(await wordReplacementStore(pool).readCurrent(item.job), item.previous);
});

test('applyOne 在原本沒有整詞錄音時 INSERT，readCurrent 缺音回傳 null', async t => {
  const item = await fixture(t, { previous: false });
  const store = wordReplacementStore(pool);
  assert.equal(await store.readCurrent(item.job), null);
  await store.applyOne(item.job, item.desired, null);
  assert.deepEqual(await store.readCurrent(item.job), item.desired);
});

test('applyOne 已切換至相同目標時可續跑，不需舊 metadata 仍吻合', async t => {
  const item = await fixture(t);
  const store = wordReplacementStore(pool);
  await store.applyOne(item.job, item.desired, item.previous);
  const beforeRows = await ownRows(item.guid);
  await store.applyOne(item.job, item.desired, item.previous);
  assert.deepEqual(await ownRows(item.guid), beforeRows);
  assert.equal(sameAudioMetadata(await store.readCurrent(item.job), item.desired), true);
});

test('applyOne 拒絕非 word 資產或不同文字 hash，原錄音不變', async t => {
  const item = await fixture(t);
  const store = wordReplacementStore(pool);
  await assert.rejects(store.applyOne({ ...item.job, kind: 'example' }, item.desired, item.previous), /僅接受/);
  await assert.rejects(store.applyOne(item.job, { ...item.desired, kind: 'explanation' }, item.previous), /僅接受/);
  await assert.rejects(store.applyOne(item.job, { ...item.desired, textHash: '0'.repeat(64) }, item.previous), /僅接受/);
  assert.deepEqual(await store.readCurrent(item.job), item.previous);
});

test('snapshot 遇到整詞 GUID 被錯誤綁成例句時拒絕建立清單', async t => {
  const item = await fixture(t);
  await pool.query("UPDATE wordbank_audio SET kind='example' WHERE asset_guid=$1", [item.guid]);
  await assert.rejects(snapshotWordbank(pool), /整詞 GUID 對應異常/);
  assert.equal((await ownRows(item.guid))[0].kind, 'example');
});

test('目標資料庫身分必須全部吻合，database／address／port 任一變更皆阻擋', async () => {
  const actual = await databaseIdentity(pool);
  assert.doesNotThrow(() => assertDatabaseIdentity(actual, { ...actual }));
  for (const [key, value] of [['database', `${actual.database}_other`], ['address', '192.0.2.1'], ['port', Number(actual.port) + 1]]) {
    assert.throws(() => assertDatabaseIdentity(actual, { ...actual, [key]: value }), /資料庫目標與 plan 不同/);
  }
  assert.equal(audioMetadata(undefined), null);
});

async function sentenceFixture(t) {
  const schema = `word_audio_kinds_${randomUUID().replaceAll('-', '')}`;
  await pool.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(resolveTestDatabaseUrl());
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = createPool(url.href);
  t.after(async () => { await db.end(); await pool.query(`DROP SCHEMA ${schema} CASCADE`); });
  await pool.query(`CREATE TABLE ${schema}.wordbank_entries (LIKE public.wordbank_entries INCLUDING ALL)`);
  await pool.query(`CREATE TABLE ${schema}.wordbank_audio (LIKE public.wordbank_audio INCLUDING ALL)`);
  const entryGuid = randomUUID(), example = randomUUID(), missing = randomUUID(), explanation = randomUUID(), blank = randomUUID();
  const examples = [{ guid: example, en: ' The apple is red. ', zh: '蘋果是紅色的。' },
    { guid: missing, en: 'I like apples.', zh: '' }, { guid: blank, en: '  ', zh: '' }];
  const explains = [{ guid: explanation, en: ' A round fruit. ' }];
  await db.query(`INSERT INTO wordbank_entries(guid, source_id, word, examples, explains, level)
    VALUES($1,1,'apple',$2::jsonb,$3::jsonb,'{"list":"expert"}')`, [entryGuid, JSON.stringify(examples), JSON.stringify(explains)]);
  const metadata = (assetGuid, kind, text) => ({ assetGuid, entryGuid, kind, relativePath: `wordbank/old/${assetGuid}.mp3`,
    model: 'old', voice: 'old', instruct: 'old', language: 'English', textHash: textHash(text),
    durationSeconds: 1, bytes: 123, generatedAt: '2026-10-01T00:00:00.000Z' });
  for (const asset of [metadata(entryGuid, 'word', 'apple'), metadata(example, 'example', examples[0].en),
    metadata(explanation, 'explanation', explains[0].en)]) {
    await db.query(`INSERT INTO wordbank_audio(asset_guid,entry_guid,kind,relative_path,model,voice,instruct,language,text_hash,duration_seconds,bytes,generated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [asset.assetGuid, asset.entryGuid, asset.kind, asset.relativePath,
      asset.model, asset.voice, asset.instruct, asset.language, asset.textHash, asset.durationSeconds, asset.bytes, asset.generatedAt]);
  }
  const rowSnapshot = async () => (await db.query('SELECT * FROM wordbank_audio ORDER BY asset_guid')).rows;
  const desired = job => ({ ...metadata(job.assetGuid, job.kind, job.text), relativePath: job.relativePath,
    model: 'new', voice: 'Serena', durationSeconds: 2, bytes: 456, generatedAt: '2026-11-12T00:00:00.000Z' });
  const jobs = (await snapshotWordbank(db, ['example', 'explanation'])).entries[0].assets.map(asset => ({
    assetGuid: asset.assetGuid, entryGuid, kind: asset.kind, text: asset.text, textHash: textHash(asset.text),
    relativePath: `wordbank/new/${asset.assetGuid}.mp3`, previous: asset.previous,
  }));
  return { db, entryGuid, example, missing, explanation, blank, examples, explains, jobs, desired, metadata, rowSnapshot };
}

test('snapshot所選英文例句／解釋含缺音，略過空英文，沿既有GUID且不寫DB', async t => {
  const f = await sentenceFixture(t), before = await f.rowSnapshot();
  const snapshot = await snapshotWordbank(f.db, ['explanation', 'example']);
  assert.deepEqual(snapshot.entries[0].assets.map(asset => [asset.assetGuid, asset.kind, asset.text, asset.previous === null]), [
    [f.example, 'example', 'The apple is red.', false], [f.missing, 'example', 'I like apples.', true],
    [f.explanation, 'explanation', 'A round fruit.', false],
  ]);
  assert.equal(snapshot.entries[0].previous, null);
  assert.deepEqual(await f.rowSnapshot(), before);
});

test('例句與解釋apply只更新選中asset，缺音可INSERT，整詞metadata完整不變', async t => {
  const f = await sentenceFixture(t), store = wordReplacementStore(f.db);
  const beforeWord = (await f.rowSnapshot()).find(row => row.kind === 'word');
  for (const job of f.jobs) {
    const untouched = (await f.rowSnapshot()).filter(row => row.asset_guid !== job.assetGuid);
    await store.applyOne(job, f.desired(job), job.previous);
    assert.deepEqual((await f.rowSnapshot()).filter(row => row.asset_guid !== job.assetGuid), untouched);
    assert.deepEqual(await store.readCurrent(job), f.desired(job));
    await store.applyOne(job, f.desired(job), job.previous);
  }
  assert.deepEqual((await f.rowSnapshot()).find(row => row.kind === 'word'), beforeWord);
  assert.equal((await f.rowSnapshot()).length, 4);
});

test('例句／解釋apply阻擋文字或GUID變更、parent錯配及CAS衝突', async t => {
  const f = await sentenceFixture(t), store = wordReplacementStore(f.db);
  for (const job of [f.jobs[0], f.jobs[2]]) {
    const column = job.kind === 'example' ? 'examples' : 'explains';
    const original = job.kind === 'example' ? f.examples : f.explains;
    for (const mutated of [original.map(item => item.guid === job.assetGuid ? { ...item, en: 'Changed.' } : item),
      original.map(item => item.guid === job.assetGuid ? { ...item, guid: randomUUID() } : item)]) {
      await f.db.query(`UPDATE wordbank_entries SET ${column}=$2::jsonb WHERE guid=$1`, [f.entryGuid, JSON.stringify(mutated)]);
      await assert.rejects(store.applyOne(job, f.desired(job), job.previous), /GUID 或文字變更/);
      await assert.rejects(store.verifySource(job), /GUID 或文字變更/);
    }
    await f.db.query(`UPDATE wordbank_entries SET ${column}=$2::jsonb WHERE guid=$1`, [f.entryGuid, JSON.stringify(original)]);
  }
  const job = f.jobs[0];
  await f.db.query('UPDATE wordbank_audio SET voice=$2 WHERE asset_guid=$1', [job.assetGuid, 'external']);
  await assert.rejects(store.applyOne(job, f.desired(job), job.previous), /其他操作更新/);
  await assert.rejects(store.applyOne({ ...job, entryGuid: randomUUID() }, { ...f.desired(job), entryGuid: randomUUID() }, job.previous), /僅接受/);
});

test('snapshot拒絕跨kind／parent重複GUID及音訊metadata錯綁', async t => {
  const f = await sentenceFixture(t);
  await f.db.query('UPDATE wordbank_entries SET explains=$2::jsonb WHERE guid=$1',
    [f.entryGuid, JSON.stringify([{ guid: f.example, en: 'Duplicated asset.' }])]);
  await assert.rejects(snapshotWordbank(f.db, ['example', 'explanation']), /重複/);
  await f.db.query('UPDATE wordbank_entries SET explains=$2::jsonb WHERE guid=$1', [f.entryGuid, JSON.stringify(f.explains)]);
  await f.db.query("UPDATE wordbank_audio SET kind='explanation' WHERE asset_guid=$1", [f.example]);
  await assert.rejects(snapshotWordbank(f.db, ['example']), /種類異常/);
  await f.db.query("UPDATE wordbank_audio SET kind='example' WHERE asset_guid=$1", [f.example]);
  await f.db.query('UPDATE wordbank_entries SET examples=$2::jsonb WHERE guid=$1',
    [f.entryGuid, JSON.stringify([{ guid: f.entryGuid, en: 'Parent collision.' }])]);
  await assert.rejects(snapshotWordbank(f.db, ['example']), /衝突/);
});

test('apply拒絕把被另一kind／parent占用的metadata移給新資產，即便previous吻合', async t => {
  const f = await sentenceFixture(t), store = wordReplacementStore(f.db), job = f.jobs[0];
  await f.db.query("UPDATE wordbank_audio SET kind='explanation' WHERE asset_guid=$1", [job.assetGuid]);
  const previous = await store.readCurrent(job), before = await f.rowSnapshot();
  await assert.rejects(store.applyOne(job, f.desired(job), previous), /占用/);
  assert.deepEqual(await f.rowSnapshot(), before);
  const other = randomUUID();
  await f.db.query("INSERT INTO wordbank_entries(guid,source_id,word) VALUES($1,2,'other')", [other]);
  await f.db.query("UPDATE wordbank_audio SET kind='example',entry_guid=$2 WHERE asset_guid=$1", [job.assetGuid, other]);
  await assert.rejects(store.applyOne(job, f.desired(job), await store.readCurrent(job)), /占用/);
});
