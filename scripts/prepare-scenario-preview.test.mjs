import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildScenarioPreview } from './prepare-scenario-preview.mjs';

const targetGuid = '00000000-0000-0000-0000-000000000001';
const supportGuid = '00000000-0000-0000-0000-000000000002';
const exampleGuid = '00000000-0000-0000-0000-000000000003';
const explanationGuid = '00000000-0000-0000-0000-000000000004';
const supportExampleGuid = '00000000-0000-0000-0000-000000000005';
const sha = (text) => createHash('sha256').update(text.trim()).digest('hex');

async function fixture(t) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'scenario-preview-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  const audioRoot = path.join(tmp, 'audio');
  const outputAudioDir = path.join(tmp, 'output');
  await mkdir(path.join(audioRoot, 'wordbank/test'), { recursive: true });
  const sourceEntries = [
    { guid: targetGuid, word: 'sofa', level: { list: 'basic' }, parts_of_speech: ['n'], definition: '沙發',
      examples: [{ guid: exampleGuid, en: 'A sofa.', zh: '一張沙發。' }],
      explains: [{ guid: explanationGuid, en: 'A soft seat.' }] },
    { guid: supportGuid, word: 'a', level: { list: 'basic' }, parts_of_speech: ['art'], definition: '一個',
      examples: [{ guid: supportExampleGuid, en: 'A book.', zh: '一本書。' }], explains: [] },
  ];
  const manifest = { entries: [] };
  for (const [entryGuid, kind, assetGuid, text] of [
    [targetGuid, 'word', targetGuid, 'sofa'], [targetGuid, 'example', exampleGuid, 'A sofa.'],
    [targetGuid, 'explanation', explanationGuid, 'A soft seat.'],
    [supportGuid, 'word', supportGuid, 'a'], [supportGuid, 'example', supportExampleGuid, 'A book.'],
  ]) {
    const relativePath = `wordbank/test/${assetGuid}.mp3`;
    const content = Buffer.from(`fake-audio:${text}`);
    await writeFile(path.join(audioRoot, relativePath), content);
    manifest.entries.push({ entryGuid, kind, assetGuid, text, textHash: sha(text), relativePath, bytes: content.length });
  }
  const pkg = { scenarioKey: 'living-room', titleZh: '午後客廳',
    targets: [{ word: 'sofa', entryGuid: targetGuid }], story: { textEn: 'A sofa.', textZh: '一張沙發。',
      sentences: [{ id: 'sentence-1', en: 'A sofa.', zh: '一張沙發。', wordLinks: [
        { word: 'a', entryGuid: supportGuid, surface: 'A', start: 0, end: 1 },
        { word: 'sofa', entryGuid: targetGuid, surface: 'sofa', start: 2, end: 6 },
      ] }] } };
  return { tmp, audioRoot, outputAudioDir, sourceEntries, manifest, pkg };
}

test('只複製目標詞全部音檔及支援詞單字，保留全文詞條與來源內容', async (t) => {
  const f = await fixture(t);
  const { data, stats } = await buildScenarioPreview(f);
  assert.equal(stats.entries, 2);
  assert.equal(stats.audioFiles, 4);
  assert.equal(data.entries[0].examples[0].audioKey, `${exampleGuid}.mp3`);
  assert.equal(data.entries[0].explains[0].audioKey, `${explanationGuid}.mp3`);
  assert.equal(data.entries[1].examples[0].en, 'A book.');
  assert.equal(data.entries[1].examples[0].audioKey, null);
  assert.deepEqual(data.story.sentences, f.pkg.story.sentences);
  assert.equal((await readdir(f.outputAudioDir)).length, 4);
  assert.deepEqual(await readFile(path.join(f.outputAudioDir, `${targetGuid}.mp3`)),
    await readFile(path.join(f.audioRoot, f.manifest.entries[0].relativePath)));
});

test('音檔文字、hash、bytes、缺檔或越界路徑不會生成可播放 key', async (t) => {
  for (const fault of ['text', 'hash', 'bytes', 'missing', 'traversal', 'symlink']) {
    await t.test(fault, async (child) => {
      const f = await fixture(child);
      const asset = f.manifest.entries[0];
      if (fault === 'text') asset.text = 'wrong';
      if (fault === 'hash') asset.textHash = '0'.repeat(64);
      if (fault === 'bytes') asset.bytes += 1;
      if (fault === 'missing') await rm(path.join(f.audioRoot, asset.relativePath));
      if (fault === 'traversal') asset.relativePath = `../${targetGuid}.mp3`;
      if (fault === 'symlink') {
        const outside = path.join(f.tmp, 'outside.mp3');
        await writeFile(outside, Buffer.alloc(asset.bytes));
        await rm(path.join(f.audioRoot, asset.relativePath));
        await symlink(outside, path.join(f.audioRoot, asset.relativePath));
      }
      const { data, stats } = await buildScenarioPreview(f);
      assert.equal(data.entries[0].wordAudioKey, null);
      assert.deepEqual(stats.targetsMissingWordAudio, ['sofa']);
      assert.equal(stats.rejectedAssets, 1);
      assert.ok(!(await readdir(f.outputAudioDir)).includes(`${targetGuid}.mp3`));
    });
  }
});

test('缺少 manifest 仍可讀完整內容，所有音檔 key 為 null', async (t) => {
  const f = await fixture(t);
  const { data, stats } = await buildScenarioPreview({ ...f, manifest: null });
  assert.equal(stats.manifestAvailable, false);
  assert.equal(stats.audioFiles, 0);
  assert.equal(data.entries[0].definition, '沙發');
  assert.equal(data.entries[0].wordAudioKey, null);
  assert.equal(data.entries[0].examples[0].audioKey, null);
});

test('來源 GUID 或 word 不符時，在複製素材前拒絕套件', async (t) => {
  const f = await fixture(t);
  f.pkg.story.sentences[0].wordLinks[0].word = 'wrong';
  await assert.rejects(buildScenarioPreview(f), /來源不符/);
  await assert.rejects(readdir(f.outputAudioDir), { code: 'ENOENT' });
});
