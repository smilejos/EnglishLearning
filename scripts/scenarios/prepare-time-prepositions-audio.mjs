// 本批離線缺音工具；來源只讀，所有寫入固定在本批目錄；不連 DB。
import { readFile, realpath, lstat, mkdir, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { constants } from 'node:fs';
import { planAudio, generateBatch, withBatchLock, validateMp3, DEFAULT_PROFILE } from '../generate-wordbank-audio.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OUTPUT = 'data/scenario-wordbank-audio/time-prepositions';
export const SOURCES = [OUTPUT, 'data/wordbank-audio', 'data/scenario-wordbank-audio/living-room-v1',
  'data/scenario-wordbank-audio/revision-02', ...['restaurant-tour', 'order-food', 'enjoy-meal', 'after-meal']
    .map(key => `data/scenario-wordbank-audio/mcdonalds-${key}-r1`)];
const hash = data => createHash('sha256').update(data).digest('hex');
const inside = (root, file) => file === root || file.startsWith(`${root}${path.sep}`);
export function localEndpoint(value = 'http://127.0.0.1:8000/v1/audio/speech') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash)
    throw Error('endpoint 僅允許無憑證的 loopback HTTP');
  return url.href;
}
export function parseOptions(args) {
  const result = { packages: [], generate: false, copy: false, report: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--generate') result.generate = true;
    else if (arg === '--copy-reused') result.copy = true;
    else if (arg === '--report') result.report = true;
    else if (['--package', '--scene', '--endpoint'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const value = args[++i];
      if (arg === '--package') result.packages.push(value); else result[arg.slice(2)] = value;
    } else throw Error(`未知或缺值參數 ${arg}`);
  }
  if (result.packages.length !== 2) throw Error('須以兩個 --package 指定本批兩套件');
  if (result.generate && process.env.SCENARIO_REAL_TTS !== '1') throw Error('生成須 --generate 與 SCENARIO_REAL_TTS=1');
  result.endpoint = localEndpoint(result.endpoint);
  return result;
}
async function safeExisting(relative) {
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '..' || p === '.')) throw Error('不安全相對路徑');
  let current = ROOT;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('路徑不可包含 symlink');
  }
  if (!inside(await realpath(ROOT), await realpath(current))) throw Error('路徑離開專案');
  return current;
}
async function outputDirectory(relative = '') {
  let current = ROOT;
  for (const part of `${OUTPUT}${relative ? `/${relative}` : ''}`.split('/')) {
    current = path.join(current, part);
    await mkdir(current).catch(e => { if (e.code !== 'EEXIST') throw e; });
    if (!(await lstat(current)).isDirectory() || (await lstat(current)).isSymbolicLink()) throw Error('輸出目錄不可為 symlink');
  }
  return current;
}
async function save(name, data) {
  const directory = await outputDirectory();
  for (const file of [name, `${name}.tmp`]) {
    try { if (!(await lstat(path.join(directory, file))).isFile() || (await lstat(path.join(directory, file))).isSymbolicLink()) throw Error('報告不可覆寫 symlink／非檔案'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await writeFile(path.join(directory, `${name}.tmp`), `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  await rename(path.join(directory, `${name}.tmp`), path.join(directory, name));
}
export async function prepare(options) {
  if (options.generate && process.env.SCENARIO_REAL_TTS !== '1') throw Error('生成須 SCENARIO_REAL_TTS=1');
  options.endpoint = localEndpoint(options.endpoint);
  const snapshots = [];
  async function read(relative) {
    const file = await safeExisting(relative); const bytes = await readFile(file);
    snapshots.push({ path: relative, sha256: hash(bytes) }); return JSON.parse(bytes);
  }
  const source = await read('source/vocabulary-database.json');
  const byGuid = new Map(source.entries.map(e => [e.guid, e]));
  const packages = [];
  for (const file of options.packages) {
    const relative = path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/');
    const pkg = await read(relative);
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(pkg.scenarioKey) || !Number.isSafeInteger(pkg.revision) || pkg.revision < 1 || pkg.targetCount !== pkg.targets?.length) throw Error('套件 key／revision／目標數不合法');
    packages.push(pkg);
  }
  const counts = packages.map(p => p.targets.length).sort((a,b) => a-b);
  const targetGuids = new Set(packages.flatMap(p => p.targets.map(t => t.entryGuid)));
  if (counts.join(',') !== '3,11' || targetGuids.size !== 13 || new Set(packages.map(p => p.scenarioKey)).size !== 2) throw Error('本批須為3＋11詞次、13唯一詞、兩個不同key');
  for (const pkg of packages) {
    if (new Set(pkg.targets.map(t => t.entryGuid)).size !== pkg.targets.length) throw Error('單場目標重複');
    for (const t of pkg.targets) {
      const e = byGuid.get(t.entryGuid);
      if (!e || e.word !== t.word || (e.level?.list ?? null) !== t.list) throw Error(`canonical 字庫不符：${t.word}`);
    }
  }
  const selected = options.scene ? packages.filter(p => p.scenarioKey === options.scene) : packages;
  if (!selected.length) throw Error('--scene 未符合本批key');
  const guids = new Set(selected.flatMap(p => p.targets.map(t => t.entryGuid)));
  const jobs = planAudio({ entries: source.entries.filter(e => guids.has(e.guid)) }, 'all');
  const manifests = [];
  const rejected = [];
  for (const base of SOURCES) {
    try {
      const bytes = await readFile(await safeExisting(`${base}/manifest.json`));
      const raw = JSON.parse(bytes);
      if (raw.version !== 1 || !isDeepStrictEqual(raw.profile, DEFAULT_PROFILE) || !Array.isArray(raw.entries)) throw Error('manifest版本／profile不符');
      if (new Set(raw.entries.map(e=>e.assetGuid)).size !== raw.entries.length) throw Error('manifest有重複assetGuid');
      manifests.push({ base, raw, sha256: hash(bytes) });
    } catch (e) {
      if (e.code !== 'ENOENT' && base === OUTPUT) throw e;
      if (e.code !== 'ENOENT') rejected.push({ source: base, reason: e.message });
    }
  }
  const reused = [], missing = [];
  for (const job of jobs) {
    let found;
    for (const { base, raw } of manifests) {
      for (const entry of raw.entries.filter(e => e.assetGuid === job.assetGuid)) {
        try {
          if (['entryGuid','kind','assetGuid','textHash','text','relativePath'].some(key => entry[key] !== job[key]) ||
              !Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0 || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !Number.isFinite(Date.parse(entry.generatedAt))) throw Error('metadata不符');
          const file = await safeExisting(`${base}/${job.relativePath}`);
          const meta = await validateMp3(file);
          const digest = hash(await readFile(file));
          if (entry.bytes !== meta.bytes || Math.abs(entry.durationSeconds - meta.durationSeconds) > 0.05 || (entry.sha256 && entry.sha256 !== digest)) throw Error('實檔metadata／hash不符');
          found = { job, source: `${base}/${job.relativePath}`, entry: { ...job, ...meta, generatedAt: entry.generatedAt, sha256: digest } };
          break;
        } catch (e) { rejected.push({ source: base, assetGuid: job.assetGuid, reason: e.message }); }
      }
      if (found) break;
    }
    if (found) reused.push(found); else missing.push(job);
  }
  const report = { mode: options.generate ? 'generate' : options.copy ? 'copy-reused' : 'plan', targetOccurrences: 14, uniqueTargets: 13,
    scenes: selected.map(p => ({ scenarioKey: p.scenarioKey, revision: p.revision, targets: p.targets.length,
      jobs: jobs.filter(j => p.targets.some(t => t.entryGuid === j.entryGuid)).length,
      missing: missing.filter(j => p.targets.some(t => t.entryGuid === j.entryGuid)).length })),
    profile: DEFAULT_PROFILE, total: jobs.length, reused: reused.length, missing: missing.length, complete: missing.length === 0,
    sourceEvidence: snapshots, reusedAssets: reused.map(r => ({ source: r.source, ...r.entry })), missingJobs: missing, rejected };
  const unchanged = async () => {
    for (const s of snapshots) if (hash(await readFile(await safeExisting(s.path))) !== s.sha256) throw Error('製作期間來源／套件已變更，停止');
  };
  if (!options.generate && !options.copy && !options.report) return report;
  await outputDirectory();
  try { if ((await lstat(path.join(ROOT, OUTPUT, '.batch.lock'))).isSymbolicLink()) throw Error('批次鎖不可為symlink'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  return withBatchLock(path.join(ROOT, OUTPUT), async () => {
    // 既有 batch 原語使用的所有控制檔均不可為 symlink。
    for (const name of ['manifest.json','report.json','manifest.json.tmp','report.json.tmp']) {
      try { if ((await lstat(path.join(ROOT, OUTPUT, name))).isSymbolicLink()) throw Error('控制檔不可為symlink'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    await unchanged();
    const previousOutput = manifests.find(m=>m.base===OUTPUT);
    try {
      const current = hash(await readFile(await safeExisting(`${OUTPUT}/manifest.json`)));
      if (current !== previousOutput?.sha256) throw Error('規劃期間本批manifest已變更，請重新執行');
    } catch (e) { if (e.code !== 'ENOENT' || previousOutput) throw e; }
    if (options.generate || options.copy) {
      for (const r of reused) {
        await outputDirectory(path.posix.dirname(r.job.relativePath));
        const destination = path.join(ROOT, OUTPUT, r.job.relativePath);
        const src = await safeExisting(r.source);
        if (hash(await readFile(src)) !== r.entry.sha256) throw Error('重用來源於核對後變更');
        if (src !== destination) {
          try { await copyFile(src, destination, constants.COPYFILE_EXCL); }
          catch (e) { if (e.code !== 'EEXIST') throw e; }
        }
        await safeExisting(`${OUTPUT}/${r.job.relativePath}`);
        if (hash(await readFile(destination)) !== r.entry.sha256) throw Error('輸出已有不同音檔，拒絕覆寫');
      }
      // 保留其他已完成分場；同 GUID 的舊失效記錄由本次計畫替換。
      const previous = manifests.find(m => m.base === OUTPUT)?.raw.entries ?? [];
      const keep = previous.filter(e => !jobs.some(j => j.assetGuid === e.assetGuid));
      const allJobs = planAudio({ entries: source.entries.filter(e => targetGuids.has(e.guid)) }, 'all');
      for (const entry of keep) {
        const expected = allJobs.find(j => j.assetGuid === entry.assetGuid);
        if (!expected || ['entryGuid','kind','assetGuid','text','textHash','relativePath'].some(k => entry[k] !== expected[k])) throw Error('本批既有manifest含範圍外／失效資產');
        const file = await safeExisting(`${OUTPUT}/${entry.relativePath}`);
        const meta = await validateMp3(file);
        const digest = hash(await readFile(file));
        if (meta.bytes !== entry.bytes || Math.abs(meta.durationSeconds-entry.durationSeconds)>0.05 || (entry.sha256 && entry.sha256!==digest)) throw Error('其他分場既有資產失效');
      }
      await unchanged();
      await save('manifest.json', { version: 1, profile: DEFAULT_PROFILE, entries: [...keep, ...reused.map(r => r.entry)] });
      for (const j of options.generate ? missing : []) {
        await outputDirectory(path.posix.dirname(j.relativePath));
        for (const name of [j.relativePath, `${j.relativePath}.partial.mp3`]) {
          try { await safeExisting(`${OUTPUT}/${name}`); throw Error('缺音輸出已有未驗證檔案，拒絕覆寫'); }
          catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
      }
      if (options.generate) {
        if (process.env.SCENARIO_REAL_TTS !== '1') throw Error('生成須 SCENARIO_REAL_TTS=1');
        const generated = await generateBatch({ jobs: missing, outputDir: path.join(ROOT, OUTPUT), profile: DEFAULT_PROFILE,
          endpoint: localEndpoint(options.endpoint), retries: 0, validate: validateMp3 });
        if (generated.failed.length || generated.generated + generated.skipped !== missing.length) throw Error('缺音生成未全部完成；保留已成功結果，不宣稱完整');
        await unchanged();
        const final = JSON.parse(await readFile(await safeExisting(`${OUTPUT}/manifest.json`)));
        for (const j of jobs) {
          const entry = final.entries.find(e => e.assetGuid === j.assetGuid);
          if (!entry || ['entryGuid','kind','text','textHash','relativePath'].some(k => entry[k] !== j[k])) throw Error('生成後manifest未完整');
          const file = await safeExisting(`${OUTPUT}/${j.relativePath}`);
          const meta = await validateMp3(file);
          if (meta.bytes !== entry.bytes || Math.abs(meta.durationSeconds-entry.durationSeconds)>0.05) throw Error('生成後metadata不符');
          entry.sha256 = hash(await readFile(file));
        }
        await save('manifest.json', final);
        report.complete = true; report.generated = generated.generated;
      }
    }
    await save(`plan-${options.scene ?? 'all'}.json`, report);
    return report;
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href) {
  try { const report = await prepare(parseOptions(process.argv.slice(2))); console.log(JSON.stringify(report, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
