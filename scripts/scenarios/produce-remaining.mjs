// 只編排06–40；人工圖／UI gate 由接手agent寫入，不自動接受、不發布。
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readFile, writeFile, mkdir, open, rename, unlink, access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {safeFile, hash} from './import-safety.mjs';
import {reviewedCoordinates} from './produce-one-safety.mjs';
import {remainingOptions, verifyImageGate, verifyUiGate} from './produce-remaining-safety.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA = 'data/scenario-preparation/basic-advance-01';
const json = async file => JSON.parse(await readFile(file, 'utf8'));
async function exists(file) { try { await access(file); return true; } catch (e) { if (e.code !== 'ENOENT') throw e; return false; } }
async function main() {
  const scope = remainingOptions(process.argv.slice(2), process.env.SCENARIO_REAL_TTS);
  process.chdir(ROOT); await mkdir(DATA, {recursive: true});
  const lockFile = `${DATA}/.produce-remaining.lock`;
  const lock = await open(lockFile, 'wx').catch(e => { if (e.code === 'EEXIST') throw Error('已有06–40 driver鎖；先確認存活工作，不自動清鎖'); throw e; });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  await lock.writeFile(JSON.stringify({pid: process.pid, runId, scope}));
  let state = {runId, pid: process.pid, scope, completed: [], stage: 'waiting-for-05-ui'};
  async function update(patch) {
    state = {...state, ...patch, updatedAt: new Date().toISOString()};
    const file = `${DATA}/remaining-driver-state.json`, temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2) + '\n', {flag: 'wx'});
    await rename(temp, file);
    console.log(JSON.stringify({id: state.id ?? '05', scenarioKey: state.scenarioKey, stage: state.stage}));
  }
  async function waitFor(file) { while (!await exists(file)) await new Promise(resolve => setTimeout(resolve, 5000)); return json(file); }
  async function producer(id, flags, stage) {
    const stdout = `${DATA}/${id}-${runId}-driver-${stage}.stdout.log`, stderr = `${DATA}/${id}-${runId}-driver-${stage}.stderr.log`;
    await update({id, stage, childLogs: {stdout, stderr}});
    const out = await open(stdout, 'wx'), err = await open(stderr, 'wx');
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/scenarios/produce-one.mjs', id, '--execute', ...flags], {cwd: ROOT, env: process.env, stdio: ['ignore', out.fd, err.fd]});
        child.once('error', () => reject(Error(`本場${stage}無法啟動；詳見子日誌`)));
        child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`本場${stage}失敗 (${code ?? signal})；詳見子日誌，停止不降品質`)));
      });
    } finally { await out.close(); await err.close(); }
  }
  try {
    await update({stage: 'waiting-for-05-ui'});
    // 啟動driver本身亦不等於允許越過05；只有真UI紀錄到位才動06。
    const gate05 = await waitFor(`${DATA}/05-ui-review.json`);
    if (gate05.id !== '05' || gate05.scenarioKey !== 'laundry-day' || gate05.revision !== 1 || gate05.reviewed !== true) throw Error('05 UI gate 尚未明確審閱revision 1通過');
    for (let number = scope.start; number <= scope.end; number++) {
      const id = String(number).padStart(2, '0');
      const group = number <= 14 ? '02-14' : number <= 27 ? '15-27' : '28-40';
      const scene = (await json(`docs/scenarios/preparation/basic-advance-01/author-${group}.json`)).find(s => s.id === id);
      if (!scene || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.scenarioKey)) throw Error('本場備料key不存在或不合法');
      const key = scene.scenarioKey, directory = `output/imagegen/basic-advance-01/${id}-${key}-v1`;
      await update({id, scenarioKey: key});
      await producer(id, ['--stop-after-image', '--resume'], 'produce-image');
      await update({stage: 'await-image-gate'});
      const gate = await waitFor(`${DATA}/${id}-image-gate.json`);
      const review = await json(`${directory}/image-review.json`);
      if (!review.imagePath?.startsWith(`${directory}/`)) throw Error('圖片審閱path不在本場');
      const image = await safeFile(ROOT, review.imagePath), bytes = await readFile(image);
      const imageHash = hash(bytes);
      verifyImageGate(gate, {id, key, imagePath: review.imagePath, sha256: imageHash});
      const pkg = await json(`docs/scenarios/packages/${key}-15-v1/scenario.json`);
      const acceptance = await exists(`${directory}/image-acceptance.json`) ? await json(`${directory}/image-acceptance.json`) : undefined;
      reviewedCoordinates(review, pkg.targets, await sharp(bytes).metadata(), imageHash, acceptance);
      await producer(id, ['--skip-image', '--resume'], 'import-draft');
      const latest = await json(`${DATA}/progress.json`);
      const report = latest.importedDrafts.find(r => r.id === id && r.scenarioKey === key);
      if (!report || report.status !== 'draft' || report.publishedRevision !== null || report.missing !== 0) throw Error('本場正式postcheck成果不完整');
      await update({stage: 'await-ui-gate', contentHash: report.contentHash});
      verifyUiGate(await waitFor(`${DATA}/${id}-ui-review.json`), {id, key, contentHash: report.contentHash});
      await update({completed: [...state.completed, {id, scenarioKey: key, contentHash: report.contentHash}], stage: 'ui-gate-passed'});
    }
    await update({stage: 'completed-06-40-drafts-ui-reviewed'});
    await writeFile(`${DATA}/remaining-driver-${runId}-completed.json`, JSON.stringify(state, null, 2) + '\n', {flag: 'wx'});
  } catch (error) {
    await update({stage: 'failed', error: String(error.message).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[已遮蔽]')});
    await writeFile(`${DATA}/remaining-driver-${runId}-failure.json`, JSON.stringify(state, null, 2) + '\n', {flag: 'wx'});
    throw error;
  } finally { await lock.close(); await unlink(lockFile); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
