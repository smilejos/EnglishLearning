// 預設只盤點；apply 沿用 plan，僅移除 audio volume 內未引用檔案，不改 DB。
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../shared/src/db.ts';
import { createCleanupPlan, applyCleanupPlan, cleanupPlanCsv } from './cleanup-audio-core.mjs';
import { withAudioCleanupSnapshot } from './cleanup-audio-db.mjs';

export function parseCleanupOptions(args) {
  const input = [...args], options = { command: 'plan' };
  if (input[0] && !input[0].startsWith('--')) options.command = input.shift();
  if (!['plan', 'apply'].includes(options.command)) throw new Error('指令必須是 plan 或 apply');
  for (let i = 0; i < input.length; i++) {
    const key = input[i];
    if (key === '--help') options.help = true;
    else if (['--work-dir', '--audio-dir', '--min-age-hours'].includes(key)) {
      if (!input[i + 1] || input[i + 1].startsWith('--')) throw new Error(`${key} 缺少值`);
      options[key.slice(2)] = input[++i];
    } else throw new Error(`不支援參數：${key}`);
  }
  if (options['min-age-hours'] !== undefined) {
    if (options.command !== 'plan') throw new Error('--min-age-hours 只能在 plan 時指定');
    options['min-age-hours'] = Number(options['min-age-hours']);
    if (!Number.isFinite(options['min-age-hours']) || options['min-age-hours'] < 0) throw new Error('min-age-hours 必須是非負數');
  }
  return options;
}
async function atomicWrite(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`, handle = await open(temporary, 'wx');
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
}
export async function main(args = process.argv.slice(2)) {
  const options = parseCleanupOptions(args);
  if (options.help) {
    console.log(`音檔清理：plan（預設）只盤點，apply 永久刪除同份清單中仍未引用的音檔。
--work-dir PATH       清單與紀錄目錄（預設 data/audio-cleanup，Compose 使用 /workspace/data/audio-cleanup）
--audio-dir PATH      共用 audio 根目錄；也可設定 AUDIO_DIR
--min-age-hours N     僅 plan：排除 N 小時內新增/變更檔（預設 24；0 關閉時間保護）
清理時請與產音、匯入及還原錯開；apply 不會修改 DB 或啟動生成服務。`);
    return;
  }
  const workDir = path.resolve(options['work-dir'] ?? process.env.AUDIO_CLEANUP_WORK_DIR ?? 'data/audio-cleanup');
  const audioDir = options['audio-dir'] ?? process.env.AUDIO_DIR;
  if (!audioDir || !process.env.DATABASE_URL?.trim()) throw new Error('必須明確提供 AUDIO_DIR 與 DATABASE_URL');
  const relativeWork = path.relative(path.resolve(audioDir), workDir);
  if (!relativeWork || (!relativeWork.startsWith(`..${path.sep}`) && relativeWork !== '..' && !path.isAbsolute(relativeWork)))
    throw new Error('清理紀錄目錄不可位於 audio volume 內');
  await mkdir(workDir, { recursive: true });
  const lockFile = path.join(workDir, '.cleanup.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`清理目錄已上鎖；確認沒有清理程序執行後，才可移除 ${lockFile}`);
    throw error;
  }
  const pool = createPool(process.env.DATABASE_URL, { max: 1 });
  const controller = new AbortController(), stop = () => controller.abort(new Error('收到停止訊號，清理中斷；可重跑 apply'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const planFile = path.join(workDir, 'plan.json');
    if (options.command === 'plan') {
      const plan = await withAudioCleanupSnapshot(pool, {}, snapshot => createCleanupPlan({ ...snapshot, audioDir,
        minAgeHours: options['min-age-hours'] }));
      await atomicWrite(planFile, `${JSON.stringify(plan, null, 2)}\n`);
      await atomicWrite(path.join(workDir, 'plan.csv'), cleanupPlanCsv(plan));
      console.log(JSON.stringify(plan.summary, null, 2));
      console.log(`僅盤點，未刪除音檔。候選 ${plan.summary.candidate.count} 檔／${plan.summary.candidate.bytes} bytes。`);
      console.log(`清單：${planFile}\n審閱表：${path.join(workDir, 'plan.csv')}`);
    } else {
      const plan = JSON.parse(await readFile(planFile, 'utf8'));
      const reportFile = path.join(workDir, 'report.json');
      try {
        const report = await withAudioCleanupSnapshot(pool, { apply: true }, snapshot => applyCleanupPlan({
          ...snapshot, plan, audioDir, signal: controller.signal,
          onProgress: event => appendFile(path.join(workDir, 'progress.jsonl'), `${JSON.stringify({ planHash: plan.planHash, ...event })}\n`),
        }));
        await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`);
        console.log(JSON.stringify(report, null, 2));
      } catch (error) {
        const report = error.cleanupReport ?? { planHash: plan.planHash, deleted: 0, failed: [error.message], finishedAt: new Date().toISOString() };
        await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`);
        throw error;
      }
      console.log(`清理紀錄：${reportFile}`);
    }
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await pool.end(); await lock.close(); await unlink(lockFile);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
