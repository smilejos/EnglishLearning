// 已完成九場的修訂流程：僅新 draft，沿用經審核底圖；不部署、不發布、不啟動服務。
import {readFile, writeFile, open, rename, unlink, stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {hash, safeFile, assertRevisionBaseline} from './import-safety.mjs';
import {dockerInvocation} from './docker-import.mjs';
import {scopedManifest} from './produce-one-safety.mjs';
import {validateScenarioPackage} from '../check-scenario-package.mjs';

const [id, ...flags] = process.argv.slice(2);
if (!/^0[1-9]$/.test(id ?? '') || flags.some(f => f !== '--execute') || flags.length > 1) throw Error('用法：produce-revision.mjs <01–09> [--execute]');
const execute = flags.includes('--execute');
if (execute && process.env.SCENARIO_REAL_TTS !== '1') throw Error('實際本機產音／draft 匯入須 SCENARIO_REAL_TTS=1 及 --execute');
const DATA = 'data/scenario-preparation/basic-advance-01';
const AUDIO = 'data/scenario-wordbank-audio/revision-02';
const BASELINE = `${DATA}/revision-02-baseline.json`;
const scene = JSON.parse(await readFile('docs/scenarios/preparation/basic-advance-01/revision-02-texts.json', 'utf8')).find(s => s.id === id);
if (!scene || scene.revision !== 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.scenarioKey)) throw Error('缺少本場修訂文字');
const key = scene.scenarioKey;
const packageFile = `docs/scenarios/packages/${key}-r2/scenario.json`;
const manifestFile = `${AUDIO}/${key}-manifest.json`;
if (!execute) { console.log(JSON.stringify({id, key, revision: 2, packageFile, execute: false, stages: ['image-text-review', 'backup', 'formal-readonly-baseline', 'missing-only-local-tts', 'strict-dry-run', 'target-audio', 'draft', 'postcheck'], publish: false})); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const lockFile = `${DATA}/.produce-revision.lock`;
const lock = await open(lockFile, 'wx');
await lock.writeFile(JSON.stringify({id, key, pid: process.pid, startedAt: stamp}));
const logs = {};
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function save(file, value) { const tmp = `${file}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'}); await rename(tmp, file); }
async function run(label, program, args, env = process.env) {
  const stdout = `${DATA}/${id}-r2-${stamp}-${label}.stdout.log`, stderr = `${DATA}/${id}-r2-${stamp}-${label}.stderr.log`;
  const out = await open(stdout, 'wx'), err = await open(stderr, 'wx');
  logs[label] = {stdout, stderr}; console.log(JSON.stringify({id, key, stage: label, stdout}));
  try { await new Promise((resolve, reject) => { const c = spawn(program, args, {env, stdio: ['ignore', out.fd, err.fd]}); c.once('error', reject); c.once('exit', code => code === 0 ? resolve() : reject(Error(`${label} 失敗；先讀日誌查結果，不自動重送`))); }); }
  finally { await out.close(); await err.close(); }
  return stdout;
}
const node = (label, file, args = []) => run(label, process.execPath, [file, ...args]);
const task = name => node(name, 'scripts/scenarios/docker-import.mjs', [name, '--package', packageFile, '--baseline', BASELINE, ...(name === 'postcheck' ? [] : ['--manifest', manifestFile])]);
try {
  let pkg = await json(packageFile);
  if (pkg.revision !== 2 || pkg.scenarioKey !== key || pkg.status !== 'draft') throw Error('本場只能建立 revision 2 draft');
  const review = await json(`docs/scenarios/packages/${key}-r2/target-review.json`);
  if (review.reviewed !== true || review.imageSha256 !== pkg.assets.baseImage?.sha256 || review.targetsSha256 !== hash(JSON.stringify(pkg.targets)) || review.storySha256 !== hash(pkg.story.textEn)) throw Error('缺少綁定本版圖／目標／故事的真實審閱');
  const check = await validateScenarioPackage({...pkg, assets: {...pkg.assets, storyAudio: null}});
  if (!check.valid || check.missing.some(m => !m.includes('storyAudio'))) throw Error('本場圖文備料未完整');
  const backup = await json(`${DATA}/revision-02-backup.json`);
  if (!backup.dbDumpFullParse || !backup.gzipIntegrity || !backup.tarFullListing) throw Error('本輪備份核驗未完整');
  for (const name of ['db.dump', 'audio.tgz', 'images.tgz']) {
    const file = await safeFile(process.cwd(), `${backup.backup}/${name}`);
    if (!backup.sha256[name] || (await stat(file)).size !== backup.bytes[name]) throw Error('已核驗備份遺失或大小已變');
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    if (digest.digest('hex') !== backup.sha256[name]) throw Error('已核驗備份內容已變，停止匯入');
  }
  const snapshotFile = `${DATA}/${id}-r2-${stamp}-snapshot.json`;
  await node('formal-snapshot', 'scripts/scenarios/docker-import.mjs', ['snapshot', '--output', snapshotFile]);
  const snapshot = await json(snapshotFile), baseline = await json(BASELINE);
  const revisions = snapshot.revisions.filter(r => r.scenario_key === key);
  const pointer = snapshot.pointers.find(r => r.scenario_key === key)?.published_revision ?? null;
  assertRevisionBaseline(pkg, revisions, pointer, baseline);
  await save(`${DATA}/formal-snapshot.json`, snapshot);
  if (revisions.some(r => r.revision === 2)) {
    const report = await json(await task('postcheck'));
    console.log(JSON.stringify({id, key, reusedDraft: true, ...report}));
  } else {
    if (!pkg.assets.storyAudio) await node('story-audio', 'scripts/generate-scenario-audio.mjs', ['--package', packageFile, '--generate']);
    else if (pkg.assets.storyAudio.textSha256 !== hash(pkg.story.textEn)) throw Error('已有旁白與故事不符，拒絕為驗證重產');
    await node('target-audio', 'scripts/scenarios/generate-target-audio.mjs', [packageFile, '--output', AUDIO, '--generate']);
    const plan = await json(`${AUDIO}/${key}-plan.json`);
    let shared;
    try { shared = await json(`${AUDIO}/manifest.json`); } catch(e) { if(e.code !== 'ENOENT') throw e; shared = {profile: (await json(packageFile)).assets.storyAudio.profile, entries: []}; }
    await save(manifestFile, scopedManifest(shared, plan, pkg));
    await node('strict-check', 'scripts/check-scenario-package.mjs', [packageFile, '--require-publish-ready']);
    const invocation = await dockerInvocation({task: 'check', package: packageFile}, ['scripts/import-scenario.ts', '--package', packageFile]);
    await run('dry-run', 'docker', invocation.args, invocation.env);
    await task('check');
    if (plan.jobs.length) { await task('copy-audio'); await task('audio-metadata'); }
    await task('scenario');
    const report = await json(await task('postcheck'));
    if (report.revision !== 2 || report.status !== 'draft' || report.missing !== 0 || report.publishedRevision !== pointer) throw Error('新修訂結果與本場未發布目標不同');
    await save(`${DATA}/${id}-r2-production.json`, {id, key, completedAt: new Date().toISOString(), postcheck: report, logs, backup: backup.backup,
      targetPlan: {total: plan.total, reused: plan.reused, missing: plan.missing}, published: false, uiReview: 'awaiting-local-preview', humanFullListening: false});
    console.log(JSON.stringify({id, key, revision: 2, status: 'draft', contentHash: report.contentHash, targetCount: pkg.targetCount, publishedRevision: pointer}));
  }
} finally { await lock.close(); await unlink(lockFile); }
