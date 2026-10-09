// 客廳等情境的完整英文旁白；預設 dry-run，不冒用字庫音檔 GUID。
import { createHash } from 'node:crypto';
import { readFile, writeFile, realpath, mkdir, lstat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_PROFILE, generateBatch, validateMp3, withBatchLock } from './generate-wordbank-audio.mjs';
import { validateScenarioPackage } from './check-scenario-package.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const within = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export function planScenarioAudio(pkg, profile = DEFAULT_PROFILE) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(pkg.scenarioKey ?? '') || !Number.isSafeInteger(pkg.revision) || pkg.revision < 1)
    throw new Error('無效情境 key 或 revision');
  if (pkg.story?.language !== 'en' || typeof pkg.story.textEn !== 'string' || !pkg.story.textEn.trim())
    throw new Error('旁白必須有完整英文故事');
  const text = pkg.story.textEn;
  const textHash = hash(text);
  const profileHash = hash(JSON.stringify(profile)).slice(0, 16);
  const assetGuid = hash(`scenario:${pkg.scenarioKey}:${pkg.revision}:${textHash}:${profileHash}`);
  return { assetGuid, scenarioKey: pkg.scenarioKey, revision: pkg.revision, kind: 'story', text, textHash,
    relativePath: `scenarios/${pkg.scenarioKey}/r${pkg.revision}/${profileHash}/story-${textHash.slice(0, 16)}.mp3` };
}

export async function generateScenarioAudio({ packageFile, repoRoot = process.cwd(), outputDir,
  endpoint = 'http://127.0.0.1:8000/v1/audio/speech', realOptIn = process.env.SCENARIO_REAL_TTS,
  profile = DEFAULT_PROFILE, fetchImpl = fetch, validate = validateMp3, log = console.log }) {
  if (realOptIn !== '1') throw new Error('真實產音須 SCENARIO_REAL_TTS=1');
  const root = await realpath(repoRoot);
  const file = await realpath(packageFile);
  if (!within(root, file)) throw new Error('套件必須位於專案內');
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('情境旁白只允許指定本機 TTS 服務');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  // 舊旁白失效時可再生成；其他來源與素材仍嚴格檢查。
  const check = await validateScenarioPackage({ ...pkg, assets: { ...pkg.assets, storyAudio: null } }, { repoRoot: root });
  if (!check.valid) throw new Error(`套件無效：${check.errors.join('；')}`);
  const job = planScenarioAudio(pkg, profile);
  const requested = path.resolve(outputDir ?? path.join(root, 'data/scenario-audio'));
  const lexicalRoot = path.resolve(repoRoot);
  const destination = within(lexicalRoot, requested) ? path.resolve(root, path.relative(lexicalRoot, requested)) : requested;
  if (!within(root, destination)) throw new Error('音檔輸出必須位於專案內');
  let parent = root;
  for (const segment of [...path.relative(root, destination).split(path.sep).filter(Boolean), ...job.relativePath.split('/').slice(0, -1)]) {
    parent = path.join(parent, segment);
    await mkdir(parent, { recursive: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    if ((await lstat(parent)).isSymbolicLink() || !within(root, await realpath(parent)))
      throw new Error('音檔路徑不得包含 symlink');
  }
  for (const name of [job.relativePath, `${job.relativePath}.partial.mp3`, '.batch.lock', 'manifest.json', 'report.json', 'manifest.json.tmp', 'report.json.tmp']) {
    try { if ((await lstat(path.join(destination, name))).isSymbolicLink()) throw new Error('音檔輸出不得覆写 symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return withBatchLock(destination, async () => {
    const report = await generateBatch({ jobs: [job], outputDir: destination, endpoint, profile, fetchImpl, validate, log, retries: 0 });
    if (report.failed.length || report.generated + report.skipped !== 1) throw new Error('故事音檔生成失敗，套件未更新');
    const audioPath = await realpath(path.join(destination, job.relativePath));
    if (!within(root, audioPath)) throw new Error('生成音檔不得離開專案');
    const metadata = await validate(audioPath);
    // 網路等待期間故事若被修改，不用舊快照覆蓋最新檔案。
    const latest = JSON.parse(await readFile(file, 'utf8'));
    if (latest.scenarioKey !== pkg.scenarioKey || latest.revision !== pkg.revision || latest.story?.textEn !== job.text)
      throw new Error('生成期間故事已變更；音檔保留，但套件未更新');
    const latestCheck = await validateScenarioPackage({ ...latest, assets: { ...latest.assets, storyAudio: null } }, { repoRoot: root });
    if (!latestCheck.valid) throw new Error(`生成期間套件已失效；音檔保留，套件未更新：${latestCheck.errors.join('；')}`);
    latest.assets.storyAudio = { path: path.relative(root, audioPath).split(path.sep).join('/'),
      sha256: hash(await readFile(audioPath)), language: 'en', textSha256: job.textHash,
      durationSeconds: metadata.durationSeconds, bytes: metadata.bytes, profile };
    latest.generationPlan.storyAudio = { ...latest.generationPlan.storyAudio, status: 'generated-awaiting-listening-review',
      voice: profile.voice, model: profile.model, instruct: profile.instruct };
    const temporary = `${file}.audio-${process.pid}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(latest, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, file);
    } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
    return { ...report, asset: latest.assets.storyAudio };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let generate = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--generate') generate = true;
    else if (['--package', '--output', '--endpoint'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} 缺少值`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`不支援參數 ${arg}`);
  }
  const packageFile = path.resolve(options.package ?? 'docs/scenarios/packages/living-room-15-v1/scenario.json');
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
  if (!generate) {
    console.log(JSON.stringify({ dryRun: true, profile: DEFAULT_PROFILE, job: planScenarioAudio(pkg) }, null, 2));
    return;
  }
  console.log(JSON.stringify(await generateScenarioAudio({ packageFile, outputDir: options.output, endpoint: options.endpoint }), null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
