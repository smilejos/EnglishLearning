import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DEFAULT_PROFILE } from './generate-wordbank-audio.mjs';
import { planScenarioAudio, generateScenarioAudio } from './generate-scenario-audio.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'scenario-narration-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = JSON.parse(await readFile(new URL('../docs/scenarios/packages/living-room-15-v1/scenario.json', import.meta.url), 'utf8'));
  const db = JSON.parse(await readFile(new URL('../source/vocabulary-database.json', import.meta.url), 'utf8'));
  const needed = new Set(pkg.story.sentences.flatMap(s => s.wordLinks.map(w => w.entryGuid)));
  await mkdir(path.join(root, 'source'));
  await writeFile(path.join(root, 'source/vocabulary-database.json'), JSON.stringify({ entries: db.entries.filter(e => needed.has(e.guid)) }));
  await writeFile(path.join(root, 'image.png'), 'test image');
  pkg.assets.referenceImage = { path: 'image.png', sha256: hash('test image') };
  pkg.assets.baseImage = { ...pkg.assets.referenceImage, reviewed: true, containsVocabularyText: false };
  pkg.assets.storyAudio = null;
  const packageFile = path.join(root, 'scenario.json');
  await writeFile(packageFile, JSON.stringify(pkg));
  let calls = 0;
  const fetchImpl = async (_url, request) => {
    calls++;
    assert.equal(JSON.parse(request.body).input, pkg.story.textEn);
    return new Response('fake audio bytes', { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  const validate = async (file) => { const bytes = await readFile(file); return { durationSeconds: 30, bytes: bytes.length }; };
  const options = { packageFile, repoRoot: root, outputDir: path.join(root, 'audio'), realOptIn: '1', fetchImpl, validate, log: () => {} };
  return { root, pkg, packageFile, options, calls: () => calls };
}

test('dry-run 不呼叫服務也不修改套件；旁白不使用字庫關聯', async () => {
  const result = spawnSync(process.execPath, ['scripts/generate-scenario-audio.mjs'], { encoding: 'utf8', env: { ...process.env, SCENARIO_REAL_TTS: '1' } });
  assert.equal(result.status, 0);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.job.kind, 'story');
  assert.equal(plan.job.entryGuid, undefined);
  assert.match(plan.job.relativePath, /^scenarios\/living-room\//);
});

test('真實 opt-in、回傳音訊及來源校驗通過才更新套件；重跑跳過已有旁白', async (t) => {
  const f = await fixture(t);
  await assert.rejects(generateScenarioAudio({ ...f.options, realOptIn: undefined }), /SCENARIO_REAL_TTS/);
  assert.equal(f.calls(), 0);
  const report = await generateScenarioAudio(f.options);
  assert.equal(report.generated, 1);
  const pkg = JSON.parse(await readFile(f.packageFile, 'utf8'));
  assert.equal(pkg.assets.storyAudio.textSha256, hash(f.pkg.story.textEn));
  assert.equal(pkg.assets.storyAudio.profile.voice, 'Serena');
  assert.equal(pkg.generationPlan.storyAudio.status, 'generated-awaiting-listening-review');
  assert.equal((await generateScenarioAudio(f.options)).skipped, 1);
  assert.equal(f.calls(), 1);
});

test('故事或聲線改變會使用另一個資產識別，不重用舊故事', async () => {
  const pkg = { scenarioKey: 'living-room', revision: 1, story: { language: 'en', textEn: 'Read a book.' } };
  const first = planScenarioAudio(pkg);
  assert.notEqual(planScenarioAudio({ ...pkg, story: { ...pkg.story, textEn: 'Read two books.' } }).assetGuid, first.assetGuid);
  assert.notEqual(planScenarioAudio(pkg, { ...DEFAULT_PROFILE, voice: 'other' }).relativePath, first.relativePath);
  assert.throws(() => planScenarioAudio({ ...pkg, scenarioKey: '../outside' }), /無效/);
});

test('生成失敗或等候期間故事改變，套件不寫入過期旁白', async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.packageFile, 'utf8');
  await assert.rejects(generateScenarioAudio({ ...f.options, fetchImpl: async () => new Response('failed', { status: 503 }) }), /生成失敗/);
  assert.equal(await readFile(f.packageFile, 'utf8'), before);
  const updated = { ...f.pkg, story: { ...f.pkg.story, textEn: `${f.pkg.story.textEn} Changed.` } };
  await assert.rejects(generateScenarioAudio({ ...f.options, fetchImpl: async () => {
    await writeFile(f.packageFile, JSON.stringify(updated));
    return new Response('fake audio', { headers: { 'Content-Type': 'audio/mpeg' } });
  } }), /故事已變更/);
  assert.equal(JSON.parse(await readFile(f.packageFile, 'utf8')).assets.storyAudio, null);
  assert.equal(JSON.parse(await readFile(f.packageFile, 'utf8')).story.textEn, updated.story.textEn);
});

test('拒絕雲端 endpoint 及 nested symlink 輸出，拒絕前不呼叫 TTS', async (t) => {
  const f = await fixture(t);
  await assert.rejects(generateScenarioAudio({ ...f.options, endpoint: 'https://example.com/tts' }), /本機/);
  await mkdir(f.options.outputDir);
  await symlink(f.root, path.join(f.options.outputDir, 'scenarios'));
  await assert.rejects(generateScenarioAudio(f.options), /symlink/);
  assert.equal(f.calls(), 0);
});

test('先拒絕輸出祖先 symlink，不在外部建立子目錄；manifest 也不能是 symlink', async (t) => {
  const f = await fixture(t);
  const outside = await mkdtemp(path.join(tmpdir(), 'scenario-narration-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(f.root, 'external'));
  await assert.rejects(generateScenarioAudio({ ...f.options, outputDir: path.join(f.root, 'external', 'new-dir') }), /symlink/);
  await assert.rejects(readFile(path.join(outside, 'new-dir', 'manifest.json')), { code: 'ENOENT' });
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(outside), []);
  await mkdir(f.options.outputDir, { recursive: true });
  await symlink(f.packageFile, path.join(f.options.outputDir, 'manifest.json'));
  await assert.rejects(generateScenarioAudio(f.options), /symlink/);
  assert.equal(f.calls(), 0);
});
