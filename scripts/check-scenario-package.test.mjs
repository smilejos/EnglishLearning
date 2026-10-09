import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateScenarioPackage } from './check-scenario-package.mjs';

const script = fileURLToPath(new URL('./check-scenario-package.mjs', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const outside = await mkdtemp(path.join(tmpdir(), 'scenario-package-test-'));
  const root = path.join(outside, 'repo');
  await mkdir(path.join(root, 'source'), { recursive: true });
  t.after(() => rm(outside, { recursive: true, force: true }));
  const nouns = ['sofa', 'table', 'chair', 'lamp', 'book', 'pillow', 'window', 'curtain', 'clock', 'plant'];
  const adjectives = ['comfortable', 'happy'];
  const verbs = ['sleep', 'read', 'play'];
  const words = [...nouns, ...adjectives, ...verbs];
  const supporting = ['a', 'on', 'the', 'child', 'can', 'by', 'and', 'near', 'is', 'at', 'home'];
  const entries = [...words, ...supporting].map((word, index) => ({
    guid: `entry-${word}`, word,
    level: { list: word === 'comfortable' ? 'advance' : 'basic' },
    parts_of_speech: [nouns.includes(word) ? 'n' : adjectives.includes(word) ? 'adj' : verbs.includes(word) ? 'v' : 'other'],
  }));
  const sourceFile = path.join(root, 'source/vocabulary-database.json');
  await writeFile(sourceFile, JSON.stringify({ entries }));
  const assetBytes = 'isolated fixture asset';
  await writeFile(path.join(root, 'preview.png'), assetBytes);
  const targetWords = new Set(words);
  const sentences = [
    { id: 's1', en: 'Read a book on the sofa.', zh: '在沙發上讀書。' },
    { id: 's2', en: 'The happy child can play by the table and chair.', zh: '開心的孩子可以在桌椅旁玩耍。' },
    { id: 's3', en: 'A comfortable pillow is near the lamp, window, curtain, clock and plant.', zh: '舒服的枕頭在燈、窗戶、窗簾、時鐘和植物附近。' },
    { id: 's4', en: 'The child can sleep at home.', zh: '孩子可以在家睡覺。' },
  ].map((sentence) => ({ ...sentence, wordLinks: [...sentence.en.matchAll(/[A-Za-z]+/g)].map((token) => ({
    surface: token[0], word: token[0].toLowerCase(), entryGuid: `entry-${token[0].toLowerCase()}`,
    isTarget: targetWords.has(token[0].toLowerCase()), start: token.index, end: token.index + token[0].length,
  })) }));
  const pkg = {
    schemaVersion: 1, scenarioKey: 'living-room', revision: 1, status: 'draft', titleZh: '午後客廳',
    vocabularyFilter: { system: 'list', levels: ['basic', 'advance'] }, targetCount: 15,
    targets: words.map((word) => {
      const entry = entries.find((candidate) => candidate.word === word);
      return { word, entryGuid: entry.guid, list: entry.level.list, teachingPos: entry.parts_of_speech[0], senseZh: '本次教學詞義', interaction: null };
    }),
    story: { language: 'en', translationLanguage: 'zh-Hant', textEn: sentences.map((sentence) => sentence.en).join(' '), textZh: sentences.map((sentence) => sentence.zh).join(''), sentences },
    assets: { referenceImage: { path: 'preview.png', sha256: hash(assetBytes) }, baseImage: null, storyAudio: null },
  };
  const packageFile = path.join(root, 'scenario.json');
  const options = { repoRoot: root, sourceFile };
  const check = (value = pkg) => validateScenarioPackage(value, options);
  const run = async (extra = []) => {
    await writeFile(packageFile, JSON.stringify(pkg));
    const result = spawnSync(process.execPath, [script, packageFile, '--root', root, '--source', sourceFile, ...extra], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'must-not-connect', TEST_DATABASE_URL: 'must-not-connect' } });
    assert.equal(result.stderr, '');
    return { status: result.status, output: JSON.parse(result.stdout) };
  };
  return { outside, root, sourceFile, entries, pkg, check, run };
}

test('有效草稿可預檢，列出 15 組座標、底圖與故事音檔缺項', async (t) => {
  const f = await fixture(t);
  const result = await f.check();
  assert.equal(result.valid, true);
  assert.equal(result.publishReady, false);
  assert.equal(result.targetCount, 15);
  assert.equal(result.missing.length, 17);
  assert.ok(result.warnings.some((warning) => warning.includes('advance')));
  assert.equal((await f.run()).status, 0);
});

test('CLI 嚴格發布預檢缺素材時回傳 exit 1，但草稿仍 valid', async (t) => {
  const f = await fixture(t);
  const result = await f.run(['--require-publish-ready']);
  assert.equal(result.status, 1);
  assert.equal(result.output.valid, true);
  assert.equal(result.output.publishReady, false);
});

async function ready(f) {
  f.pkg.targets.forEach((target) => { target.interaction = { label: { x: 0, y: 1 }, object: { x: 0.5, y: 0.5 } }; });
  await writeFile(path.join(f.root, 'base.png'), 'base');
  await writeFile(path.join(f.root, 'story.mp3'), 'audio');
  f.pkg.assets.baseImage = { path: 'base.png', sha256: hash('base'), reviewed: true, containsVocabularyText: false };
  f.pkg.assets.storyAudio = { path: 'story.mp3', sha256: hash('audio'), textSha256: hash(f.pkg.story.textEn), language: 'en' };
}

test('已審核底圖、相符音檔與完整座標可通過嚴格預檢，draft 不阻擋', async (t) => {
  const f = await fixture(t);
  await ready(f);
  const result = await f.run(['--require-publish-ready']);
  assert.equal(result.status, 0);
  assert.equal(result.output.publishReady, true);
  assert.deepEqual(result.output.missing, []);
});

test('分級、GUID、詞性、不重複與完整目標數必須符合契約', async (t) => {
  const f = await fixture(t);
  const cases = [
    (p) => { p.targets[0].list = 'advance'; },
    (p) => { p.targets[0].entryGuid = 'unknown'; },
    (p) => { p.targets[0].word = 'other'; },
    (p) => { p.targets[0].teachingPos = 'v'; },
    (p) => { p.targets[1] = structuredClone(p.targets[0]); },
    (p) => { p.targets.pop(); },
    (p) => { p.targetCount = 8; },
    (p) => { p.vocabularyFilter.levels = ['basic']; },
    (p) => { p.vocabularyFilter.levels = {}; },
    (p) => { p.vocabularyFilter.levels = ['expert']; },
  ];
  for (const mutate of cases) {
    const pkg = structuredClone(f.pkg);
    mutate(pkg);
    assert.equal((await f.check(pkg)).valid, false);
  }
  f.entries.find((entry) => entry.word === 'comfortable').level.list = 'expert';
  await writeFile(f.sourceFile, JSON.stringify({ entries: f.entries }));
  assert.equal((await f.check()).valid, false);
});

test('故事中每個單字均需有效關聯，所有目標都要出現且 span 精確', async (t) => {
  const f = await fixture(t);
  const cases = [
    (p) => { p.story.sentences[0].wordLinks[0].start = 1; },
    (p) => { p.story.sentences[0].wordLinks[0].surface = 'read'; },
    (p) => { p.story.sentences[0].wordLinks[0].isTarget = false; },
    (p) => { p.story.sentences[0].wordLinks[1].entryGuid = 'wrong'; },
    (p) => { p.story.sentences[0].wordLinks.push(structuredClone(p.story.sentences[0].wordLinks[0])); },
    (p) => { p.story.sentences[0].wordLinks.splice(1, 1); },
    (p) => { p.story.textEn += ' Extra.'; },
    (p) => { p.story.textZh += '額外文字'; },
    (p) => { p.story.sentences.pop(); p.story.textEn = p.story.sentences.map((s) => s.en).join(' '); p.story.textZh = p.story.sentences.map((s) => s.zh).join(''); },
  ];
  for (const mutate of cases) {
    const pkg = structuredClone(f.pkg);
    mutate(pkg);
    assert.equal((await f.check(pkg)).valid, false);
  }
  f.entries.find((entry) => entry.word === 'the').level.list = 'expert';
  await writeFile(f.sourceFile, JSON.stringify({ entries: f.entries }));
  assert.equal((await f.check()).valid, false, '故事支援詞也不可超出所選分級');
});

test('拒絕錯誤 hash、不存在資產、絕對路徑與目錄穿越', async (t) => {
  const f = await fixture(t);
  const cases = [
    { path: 'preview.png', sha256: hash('wrong') },
    { path: 'missing.png', sha256: hash('x') },
    { path: '../preview.png', sha256: hash('x') },
    { path: '/etc/passwd', sha256: hash('x') },
    { path: 'C:\\preview.png', sha256: hash('x') },
  ];
  for (const asset of cases) {
    const pkg = structuredClone(f.pkg);
    pkg.assets.referenceImage = asset;
    assert.equal((await f.check(pkg)).valid, false);
  }
  f.pkg.assets.referenceImage.sha256 = hash('wrong');
  assert.equal((await f.run()).status, 1);
});

test('即使 hash 正確也拒絕 symlink 逃離專案根目錄', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.outside, 'external.png'), 'external');
  await symlink(path.join(f.outside, 'external.png'), path.join(f.root, 'escape.png'));
  f.pkg.assets.referenceImage = { path: 'escape.png', sha256: hash('external') };
  const result = await f.check();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('專案外')));
});

test('填入座標與發布素材時錯誤不可降為缺項，音檔綁定故事內容', async (t) => {
  const f = await fixture(t);
  await ready(f);
  const cases = [
    (p) => { p.targets[0].interaction.label.x = 1.1; },
    (p) => { p.targets[0].interaction.object.y = -0.1; },
    (p) => { p.targets[0].interaction.object.x = '0.5'; },
    (p) => { p.assets.storyAudio.textSha256 = hash('previous story'); },
    (p) => { p.assets.storyAudio.language = 'zh-Hant'; },
    (p) => { p.assets.baseImage.reviewed = false; },
    (p) => { p.assets.baseImage.containsVocabularyText = true; },
  ];
  for (const mutate of cases) {
    const pkg = structuredClone(f.pkg);
    mutate(pkg);
    assert.equal((await f.check(pkg)).valid, false);
  }
});

test('CLI 非法 JSON 或參數輸出結構化錯誤', async (t) => {
  const f = await fixture(t);
  const badFile = path.join(f.root, 'bad.json');
  await writeFile(badFile, '{');
  for (const args of [[badFile], [badFile, '--root'], [badFile, '--unknown']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).valid, false);
    assert.equal(result.stderr, '');
  }
});

test('不完整或型別錯誤的外部套件可回報 invalid，不拋例外', async (t) => {
  const f = await fixture(t);
  for (const pkg of [null, [], {}, { ...f.pkg, targets: [null] }, { ...f.pkg, story: { sentences: [null] } }, { ...f.pkg, assets: [] }]) {
    const result = await f.check(pkg);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  }
});
