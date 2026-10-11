// 單場製作／draft 匯入 orchestration；預設只列計畫，無生成或 DB 操作。
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readFile, writeFile, mkdir, open, access, rename, unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {dockerInvocation} from './docker-import.mjs';
import {safeFile, hash} from './import-safety.mjs';
import {productionOptions, reviewedCoordinates, scopedManifest, appendProgress} from './produce-one-safety.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA = 'data/scenario-preparation/basic-advance-01';
const AUDIO = 'data/scenario-wordbank-audio/basic-advance-01';
const STYLE = 'output/imagegen/living-room-base-2026-10-09-v1/scene-01-living-room-base.png';
async function exists(file) { try { await access(file); return true; } catch (e) { if (e.code !== 'ENOENT') throw e; return false; } }
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
  try { await rename(temporary, file); } finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
async function main() {
  const options = productionOptions(process.argv.slice(2), process.env.SCENARIO_REAL_TTS);
  const id = options.id;
  process.chdir(ROOT);
  const group = Number(id) <= 14 ? '02-14' : Number(id) <= 27 ? '15-27' : '28-40';
  const scene = (await json(`docs/scenarios/preparation/basic-advance-01/author-${group}.json`)).find(s => s.id === id);
  if (!scene || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.scenarioKey)) throw Error('本場文字備料不存在或 key 不合法');
  const key = scene.scenarioKey;
  const packageFile = `docs/scenarios/packages/${key}-15-v1/scenario.json`;
  const directory = `output/imagegen/basic-advance-01/${id}-${key}-v1`;
  const manifestFile = `${AUDIO}/${key}-manifest.json`;
  if (!options.execute) { console.log(JSON.stringify({id, key, packageFile, directory, manifestFile, execute: false, steps: ['refresh-formal-readonly', 'existing-revision-postcheck-or-db-checkpoint', 'prepare', 'image-once-or-reuse-reviewed', 'local-story-tts-or-reuse', 'target-missing-only', 'strict-check', 'dry-run', 'check', 'copy-audio', 'audio-metadata', 'scenario-draft', 'postcheck'], published: false})); return; }
  await mkdir(DATA, {recursive: true});
  const lockFile = `${DATA}/.produce-one.lock`;
  const lock = await open(lockFile, 'wx').catch(e => { if (e.code === 'EEXIST') throw Error('已有單場製作鎖；先確認進行中的工作，拒絕並行或自行清鎖'); throw e; });
  await lock.writeFile(JSON.stringify({id, key, pid: process.pid, startedAt: new Date().toISOString()}));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logs = {};
  async function run(label, program, args, {env = process.env, stdin, output} = {}) {
    const stdoutFile = output ?? `${DATA}/${id}-${stamp}-${label}.stdout.log`;
    const stderrFile = `${DATA}/${id}-${stamp}-${label}.stderr.log`;
    const out = await open(stdoutFile, 'wx');
    const err = await open(stderrFile, 'wx');
    const input = stdin ? await open(stdin, 'r') : undefined;
    logs[label] = {stdout: stdoutFile, stderr: stderrFile};
    console.log(JSON.stringify({id, key, stage: label, stdout: stdoutFile}));
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(program, args, {cwd: ROOT, env, stdio: [input?.fd ?? 'ignore', out.fd, err.fd]});
        child.once('error', () => reject(Error(`${label} 無法啟動；詳見日誌`)));
        child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`${label} 未成功 (${code ?? signal})；停止本場，詳見日誌`)));
      });
    } finally { await out.close(); await err.close(); await input?.close(); }
    return stdoutFile;
  }
  const node = (label, file, args = []) => run(label, process.execPath, [file, ...args]);
  const dockerTask = task => node(task, 'scripts/scenarios/docker-import.mjs', [task, '--package', packageFile, ...(task === 'postcheck' ? [] : ['--manifest', manifestFile])]);
  async function refresh(label) {
    const invocation = await dockerInvocation({task: 'snapshot'}, ['scripts/scenarios/formal-snapshot.mjs']);
    const file = await run(label, 'docker', invocation.args, {env: invocation.env});
    const snapshot = await json(file);
    await atomicJson(`${DATA}/formal-snapshot.json`, snapshot);
    return snapshot;
  }
  async function saveProgress(report) {
    if (report.scenarioKey !== key || report.revision !== 1) throw Error('postcheck 回報不是本場 revision 1，拒絕更新進度');
    const file = `${DATA}/progress.json`;
    const progress = await exists(file) ? await json(file) : {preparedTexts: 39, importedDrafts: []};
    await atomicJson(file, appendProgress(progress, id, report));
    const production = {id, key, completedAt: new Date().toISOString(), postcheck: report, logs, published: false, uiReview: 'not-performed', humanFullListening: 'not-performed'};
    await writeFile(`${DATA}/${id}-${stamp}-production.json`, JSON.stringify(production, null, 2) + '\n', {flag: 'wx'});
    // 已有主 agent 的驗收／進度證據保留，重跑不覆寫。
    if (!await exists(`${DATA}/${id}-production.json`)) await writeFile(`${DATA}/${id}-production.json`, JSON.stringify(production, null, 2) + '\n', {flag: 'wx'});
  }
  try {
    const initial = await refresh('initial-snapshot');
    const existing = initial.revisions.find(r => r.scenario_key === key && r.revision === 1);
    if (existing) {
      if (!await exists(packageFile)) throw Error('正式版本已存在但本機套件遺失，停止，不重做');
      const saved = await json(packageFile);
      if (saved.scenarioKey !== key || saved.revision !== 1) throw Error('既有套件不是本場 revision 1，拒絕誤接他場資料');
      const report = await json(await dockerTask('postcheck'));
      await saveProgress(report);
      console.log(JSON.stringify({id, key, reusedImportedDraft: true, contentHash: report.contentHash, published: false}));
      return;
    }
    const backup = await json('data/scenario-import-backups/20261010-143242/verification.json');
    if (!backup.dbDumpFullParse || !backup.gzipIntegrity || !backup.tarFullListing) throw Error('基準 DB／audio／images 備份核驗紀錄不完整');
    for (const file of ['db.dump', 'audio.tgz', 'images.tgz']) await safeFile(ROOT, `${backup.backup}/${file}`);
    const checkpoints = `${DATA}/checkpoints`; await mkdir(checkpoints, {recursive: true});
    // 只保存本場前的小型 DB dump；媒體沿用已核驗的整批基準備份。
    const invocation = await dockerInvocation({task: 'snapshot'}, ['scripts/scenarios/formal-snapshot.mjs']);
    const user = decodeURIComponent(new URL(invocation.env.DATABASE_URL).username);
    const dump = `${checkpoints}/${id}-${stamp}.dump`;
    await run('db-checkpoint', 'docker', ['compose', 'exec', '-T', 'db', 'pg_dump', '-U', user, '-d', 'english_learning', '--format=custom'], {output: dump});
    await run('db-checkpoint-parse', 'docker', ['compose', 'exec', '-T', 'db', 'pg_restore', '--file=/dev/null'], {stdin: dump});
    await atomicJson(`${dump}.json`, {id, key, database: initial.identity, bytes: (await readFile(dump)).length, sha256: hash(await readFile(dump)), fullParse: true, baselineBackup: backup.backup});
    await mkdir(directory, {recursive: true});
    if (!await exists(`${directory}/codex-prompt.txt`)) await node('prepare-prompt', 'scripts/scenarios/prepare-codex-image-prompt.mjs', [id]);
    if (!await exists(packageFile)) await node('prepare-package', 'scripts/scenarios/prepare-batch-01.mjs', [id, STYLE]);
    let pkg = await json(packageFile);
    if (pkg.scenarioKey !== key || pkg.revision !== 1) throw Error('本機套件不是本場 revision 1');
    if (!await exists(`${directory}/image-review.json`)) {
      if (options.skipImage || await exists(`${directory}/base.png`) || await exists(`${directory}/codex-result.txt`) || await exists(`${directory}/image-generation-started.json`)) throw Error('已有圖片／生成紀錄卻缺完整審閱；停止，不重呼叫生成');
      await writeFile(`${directory}/image-generation-started.json`, JSON.stringify({startedAt: new Date().toISOString(), id, key}), {flag: 'wx'});
      await run('codex-image', 'codex', ['exec', '--ephemeral', '--sandbox', 'workspace-write', '--json', '-i', STYLE, '--output-last-message', `${directory}/codex-result.txt`, '-'], {stdin: `${directory}/codex-prompt.txt`});
    }
    if (options.stopAfterImage) {
      console.log(JSON.stringify({id, key, status: 'image-produced-awaiting-independent-visual-review', imageReview: `${directory}/image-review.json`, formalWritten: false}));
      return;
    }
    const review = await json(`${directory}/image-review.json`);
    if (!review.imagePath?.startsWith(`${directory}/`)) throw Error('審閱圖片不在本場目錄');
    const imageFile = await safeFile(ROOT, review.imagePath);
    const imageBytes = await readFile(imageFile);
    const metadata = await sharp(imageBytes).metadata();
    const imageHash = hash(imageBytes);
    const acceptance = await exists(`${directory}/image-acceptance.json`) ? await json(`${directory}/image-acceptance.json`) : undefined;
    pkg.targets = reviewedCoordinates(review, pkg.targets, metadata, imageHash, acceptance);
    if (pkg.assets.baseImage && pkg.assets.baseImage.sha256 !== imageHash) throw Error('本機已有另一張已採用底圖；停止，避免重跑改套件');
    pkg.assets.baseImage = {path: review.imagePath, sha256: imageHash, reviewed: true, containsVocabularyText: false};
    pkg.generationPlan.baseImage = {...pkg.generationPlan.baseImage, status: 'cli-visually-reviewed', reviewPath: `${directory}/image-review.json`, ...(acceptance ? {acceptancePath: `${directory}/image-acceptance.json`} : {})};
    await atomicJson(packageFile, pkg);
    if (pkg.assets.storyAudio) {
      const audio = pkg.assets.storyAudio;
      const bytes = await readFile(await safeFile(ROOT, audio.path));
      if (audio.sha256 !== hash(bytes) || audio.bytes !== bytes.length || audio.textSha256 !== hash(pkg.story.textEn)) throw Error('既有旁白與定稿故事不符；停止，不為驗證重產');
      await run('existing-story-decode', 'ffmpeg', ['-v', 'error', '-i', audio.path, '-f', 'null', '-']);
    } else await node('story-tts', 'scripts/generate-scenario-audio.mjs', ['--package', packageFile, '--generate']);
    await refresh('audio-plan-snapshot');
    await node('target-audio', 'scripts/scenarios/generate-target-audio.mjs', [packageFile, '--generate']);
    pkg = await json(packageFile);
    const plan = await json(`${AUDIO}/${key}-plan.json`);
    const shared = await exists(`${AUDIO}/manifest.json`) ? await json(`${AUDIO}/manifest.json`) : {profile: pkg.assets.storyAudio.profile, entries: []};
    await atomicJson(manifestFile, scopedManifest(shared, plan, pkg));
    await node('strict-package', 'scripts/check-scenario-package.mjs', [packageFile, '--require-publish-ready']);
    await run('dry-run', process.execPath, ['--import', 'tsx', 'scripts/import-scenario.ts', '--package', packageFile, '--dry-run']);
    await dockerTask('check');
    if (plan.jobs.length) { await dockerTask('copy-audio'); await dockerTask('audio-metadata'); }
    await dockerTask('scenario');
    const report = await json(await dockerTask('postcheck'));
    await saveProgress(report);
    const reviewFile = path.join(path.dirname(packageFile), 'import-review.md');
    const text = `# ${id} ${pkg.titleZh}匯入紀錄\n\n日期：${new Date().toISOString()}。狀態：已匯入待人工驗收；revision 1 為 draft，未發布。\n\n- scenarioKey：${key}；十五詞及全部字庫關聯已由嚴格預檢、正式 preflight／postcheck 核對。\n- 圖片：Codex CLI 原生 image_generation；CLI agent 實際目視之審閱紀錄：${directory}/image-review.json。${acceptance ? '另有實際審圖 agent 的 hash 綁定 image-acceptance.json 解決原 issues，審閱者見該 JSON。' : 'CLI issues 為空。'}工具結構檢查不代替主 agent 完整圖文驗收。\n- 底圖 SHA-256：${pkg.assets.baseImage.sha256}；旁白 SHA-256：${pkg.assets.storyAudio.sha256}；故事 SHA-256：${hash(pkg.story.textEn)}。\n- Serena 旁白／十五詞錄音：完整 ffmpeg 解碼及當下文字 hash 通過；目標字庫 ${report.targetAudioCount} 段有效，本次缺音計畫 ${plan.jobs.length} 段；本場 scoped manifest：${manifestFile}。\n- 正式 DB：db:5432/english_learning；實際 172.18.0.4/32:5432/english_learning。volume：englishlearning_images → /data/images；englishlearning_audio → /data/audio。\n- 內容 hash：${report.contentHash}；字庫關聯 ${report.links} 個；publishedRevision null。\n- 本場 DB checkpoint：${dump}（pg_restore --file=/dev/null 完整解析通過）；基準 DB／audio／images 備份：${backup.backup}（既有核驗，未做還原測試）。\n- 各階段日誌／產製結果：${DATA}/${id}-production.json。\n- 桌機／手機 UI 驗收：本 helper 未執行，待主 agent 另行實際驗收與補紀錄。\n- 人工完整試聽／一般讀者 draft 媒體權限驗收：未執行。\n- 未部署、未啟動生成服務、未發布。已生成／匯入不等於可發布。\n`;
    if (!await exists(reviewFile)) await writeFile(reviewFile, text, {flag: 'wx'});
    else throw Error('既有 import-review.md 保留；本場資料已核驗，請主 agent 對照 production.json 更新紀錄');
    console.log(JSON.stringify({id, key, status: 'imported-draft-awaiting-root-ui-review', contentHash: report.contentHash, published: false}));
  } catch (error) {
    await writeFile(`${DATA}/${id}-${stamp}-failure.json`, JSON.stringify({id, key, failedAt: new Date().toISOString(), error: String(error.message).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[已遮蔽]'), logs, action: '保留已成功媒體與正式結果，主 agent 先查核／修正後單場 --resume；不自動重產或降低品質'}, null, 2) + '\n', {flag: 'wx'});
    throw error;
  } finally { await lock.close(); await unlink(lockFile); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
