import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, symlink, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseOptions, assertManifestScope, assertRevisionBaseline, safeFile, exclusiveCopy} from './import-safety.mjs';

test('正式 task 必須明示單一套件；禁止未知／批次／重複參數', () => {
  assert.deepEqual(parseOptions(['scenario', '--package', 'p.json']), {task: 'scenario', package: 'p.json'});
  for (const args of [[], ['all', '--package', 'p.json'], ['scenario'], ['scenario', '--package', 'p.json', '--package', 'q.json'], ['scenario', '--package', 'p.json', '--apply'], ['copy-audio', '--package', 'p.json']]) assert.throws(() => parseOptions(args));
});
test('唯讀 snapshot 與新 revision 必須明示，發布基準及舊內容不可改', () => {
  assert.deepEqual(parseOptions(['snapshot', '--output', 'data/scenario-preparation/r2.json']), {task: 'snapshot', output: 'data/scenario-preparation/r2.json'});
  for (const args of [['snapshot'], ['snapshot', '--output', 'o.json', '--package', 'p.json'], ['scenario', '--package', 'p.json', '--output', 'o.json']]) assert.throws(() => parseOptions(args));
  const old = {scenario_key: 'living-room', revision: 1, status: 'published', content_hash: 'original', published_at: '2026-10-10T10:00:00.000Z'};
  const content = {scenarioKey: 'living-room', revision: 2};
  const baseline = {identity: {database: 'english_learning', address: '172.18.0.4/32', port: 5432}, checkedAt: '2026-10-11', revisions: [old], pointers: [{scenario_key: 'living-room', published_revision: 1}]};
  assert.throws(() => assertRevisionBaseline(content, [old], 1, null));
  assertRevisionBaseline(content, [{...old, published_at: new Date(old.published_at)}], 1, baseline);
  assertRevisionBaseline(content, [old, {revision: 2, status: 'draft', published_at: null}], 1, baseline);
  assert.throws(() => assertRevisionBaseline(content, [old], 2, baseline));
  assert.throws(() => assertRevisionBaseline(content, [{...old, content_hash: 'changed'}], 1, baseline));
  assert.throws(() => assertRevisionBaseline({...content, revision: 1}, [old], 1, baseline));
  assert.throws(() => assertRevisionBaseline(content, [old, {revision: 3, status: 'draft', published_at: null}], 1, baseline));
  assert.throws(() => assertRevisionBaseline(content, [old], 1, {...baseline, identity: {database: 'other'}}));
});
test('manifest 不可包含另一場非目標詞或重複資產', () => {
  const content = {targets: [{entryGuid: 'target'}]};
  assertManifestScope({entries: [{entryGuid: 'target', assetGuid: 'a'}]}, content);
  assert.throws(() => assertManifestScope({entries: [{entryGuid: 'other', assetGuid: 'a'}]}, content));
  assert.throws(() => assertManifestScope({entries: [{entryGuid: 'target', assetGuid: 'a'}, {entryGuid: 'target', assetGuid: 'a'}]}, content));
});
test('排他複製可重用相同 hash，但不同內容不覆寫', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'scenario-copy-'));
  try {
    const relative = 'wordbank/profile/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3';
    const bytes = Buffer.from('existing MP3 fixture');
    assert.equal(await exclusiveCopy(root, relative, bytes), true);
    assert.equal(await exclusiveCopy(root, relative, bytes), false);
    await assert.rejects(exclusiveCopy(root, relative, Buffer.from('different')), /拒絕覆寫/);
    assert.deepEqual(await readFile(path.join(root, relative)), bytes);
  } finally { await rm(root, {recursive: true, force: true}); }
});
test('媒體來源與目標拒絕 traversal／symlink，不能寫到 root 外', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'scenario-path-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'scenario-outside-'));
  try {
    await mkdir(path.join(root, 'wordbank'));
    await symlink(outside, path.join(root, 'wordbank', 'profile'));
    await assert.rejects(exclusiveCopy(root, 'wordbank/profile/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp3', Buffer.from('x')), /symlink/);
    await assert.rejects(safeFile(root, '../outside'), /不安全/);
    await assert.rejects(safeFile(root, 'wordbank/profile/file.mp3'), /symlink/);
    await assert.rejects(exclusiveCopy(root, '../x.mp3', Buffer.from('x')), /安全/);
  } finally { await rm(root, {recursive: true, force: true}); await rm(outside, {recursive: true, force: true}); }
});
