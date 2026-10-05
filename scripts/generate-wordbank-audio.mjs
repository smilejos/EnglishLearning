// 本機 Qwen3-TTS 字庫批次產音；預設僅列計畫，真實生成須 WORD_BANK_REAL_TTS=1。
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat, unlink, open } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const DEFAULT_PROFILE = {
  model: 'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
  voice: 'Serena',
  instruct: 'Speak warmly and clearly, like a kindergarten English teacher. Use a gentle, encouraging tone and careful pronunciation.',
  lang_code: 'English',
  response_format: 'mp3',
};
const hash = (text) => createHash('sha256').update(text).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function planAudio(database, list = 'basic', profile = DEFAULT_PROFILE) {
  if (!Array.isArray(database.entries)) throw new Error('字庫缺少 entries 陣列');
  if (!['basic', 'advance', 'expert', 'all'].includes(list)) throw new Error('list 必須是 basic、advance、expert 或 all');
  const profileHash = hash(JSON.stringify(profile)).slice(0, 16);
  const jobs = [];
  const seen = new Set();
  const append = (entry, assetGuid, kind, rawText) => {
    if (!uuid.test(entry.guid) || !uuid.test(assetGuid)) throw new Error('字庫包含無效 GUID');
    const text = rawText?.trim();
    if (!text) throw new Error(`缺少朗讀文字：${assetGuid}`);
    if (seen.has(assetGuid)) throw new Error(`重複音訊 GUID：${assetGuid}`);
    seen.add(assetGuid);
    jobs.push({ assetGuid, entryGuid: entry.guid, kind, text, textHash: hash(text),
      relativePath: `wordbank/${profileHash}/${assetGuid}.mp3` });
  };
  for (const entry of database.entries) {
    if (list !== 'all' && entry.level?.list !== list) continue;
    append(entry, entry.guid, 'word', entry.word);
    if (!Array.isArray(entry.examples)) throw new Error(`缺少例句：${entry.guid}`);
    for (const example of entry.examples) append(entry, example.guid, 'example', example.en);
  }
  return jobs;
}

export async function validateMp3(path) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', path], { encoding: 'utf8' });
  if (probe.error) throw new Error(`無法執行 ffprobe：${probe.error.message}`);
  if (probe.status !== 0 || probe.stderr.trim()) throw new Error(`MP3 檢查失敗：${probe.stderr.trim()}`);
  const info = JSON.parse(probe.stdout);
  const durationSeconds = Number(info.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !info.streams?.some((s) => s.codec_name === 'mp3')) throw new Error('不是有效的 MP3 音訊');
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (decode.error || decode.status !== 0 || decode.stderr.trim()) throw new Error(`MP3 無法完整解碼：${decode.error?.message ?? decode.stderr.trim()}`);
  return { durationSeconds, bytes: (await stat(path)).size };
}

async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function withBatchLock(outputDir, run) {
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, '.batch.lock');
  let lock;
  try { lock = await open(path, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(path, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid < 1) throw new Error('批次鎖格式錯誤，請人工確認是否仍有產音程序');
    try { process.kill(previous.pid, 0); }
    catch (check) {
      if (check.code !== 'ESRCH') throw new Error(`已有批次使用此目錄（PID ${previous.pid}）`);
      await unlink(path);
      lock = await open(path, 'wx');
    }
    if (!lock) throw new Error(`已有批次使用此目錄（PID ${previous.pid}）`);
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await run();
  } finally { await lock.close(); await unlink(path); }
}

export async function generateBatch({ jobs, outputDir, profile = DEFAULT_PROFILE,
  endpoint = 'http://localhost:8000/v1/audio/speech', fetchImpl = fetch,
  validate = validateMp3, timeoutMs = 600_000, retries = 2,
  retryDelayMs = 2000, signal, log = console.log }) {
  const manifestPath = join(outputDir, 'manifest.json');
  let manifest = { version: 1, profile, entries: [] };
  try {
    const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (saved.version !== 1 || JSON.stringify(saved.profile) !== JSON.stringify(profile)) throw new Error('現有 manifest 的生成設定不同，請使用另一個輸出目錄');
    if (!Array.isArray(saved.entries)) throw new Error('現有 manifest entries 格式錯誤');
    manifest = saved;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const savedEntries = new Map(manifest.entries.map((entry) => [entry.assetGuid, entry]));
  const report = { total: jobs.length, generated: 0, skipped: 0, failed: [], startedAt: new Date().toISOString() };
  const started = Date.now();
  let consecutiveFailures = 0;
  for (const [index, job] of jobs.entries()) {
    if (signal?.aborted) break;
    const finalPath = join(outputDir, job.relativePath);
    const previous = savedEntries.get(job.assetGuid);
    if (previous?.textHash === job.textHash && previous.relativePath === job.relativePath) {
      try { await validate(finalPath); report.skipped++; consecutiveFailures = 0; continue; }
      catch { /* 遺失或損毀的音檔重新產生。 */ }
    }
    await mkdir(dirname(finalPath), { recursive: true });
    const partial = `${finalPath}.partial.mp3`;
    let lastError;
    let metadata;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) break;
      try {
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
        const response = await fetchImpl(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...profile, input: job.text, stream: false }), signal: requestSignal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('json') || contentType.startsWith('text/')) throw new Error('TTS 回傳文字而非音訊');
        const data = Buffer.from(await response.arrayBuffer());
        if (!data.length) throw new Error('TTS 回傳空音訊');
        await writeFile(partial, data);
        metadata = await validate(partial);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await unlink(partial).catch(() => {});
        if (['ENOSPC', 'EACCES', 'EROFS', 'EIO'].includes(error.code)) throw error;
        if (signal?.aborted) break;
        log(JSON.stringify({ assetGuid: job.assetGuid, attempt: attempt + 1, error: error.message }));
        if (attempt < retries) await new Promise((done) => setTimeout(done, retryDelayMs * (attempt + 1)));
      }
    }
    // 已取得有效音訊後，儲存錯誤直接停止；不要因 manifest 寫入失敗再次呼叫 TTS。
    if (metadata && !lastError) {
      await rename(partial, finalPath);
      savedEntries.set(job.assetGuid, { ...job, ...metadata, generatedAt: new Date().toISOString() });
      manifest.entries = [...savedEntries.values()];
      await saveJson(manifestPath, manifest);
      report.generated++;
      consecutiveFailures = 0;
      const elapsed = (Date.now() - started) / 1000;
      const average = elapsed / report.generated;
      const remaining = Math.max(0, jobs.length - index - 1);
      log(JSON.stringify({ completed: index + 1, total: jobs.length, generated: report.generated,
        skipped: report.skipped, kind: job.kind, text: job.text, seconds: metadata.durationSeconds,
        elapsedSeconds: Math.round(elapsed), estimatedRemainingSeconds: Math.round(average * remaining) }));
    }
    if (lastError && !signal?.aborted) {
      report.failed.push({ assetGuid: job.assetGuid, text: job.text, error: lastError.message });
      if (++consecutiveFailures >= 3) { report.stoppedReason = '連續三筆失敗，停止批次，請檢查 TTS 服務'; break; }
    }
    await saveJson(join(outputDir, 'report.json'), { ...report, finishedAt: new Date().toISOString() });
  }
  if (signal?.aborted) report.stoppedReason = '收到停止訊號，可重跑續接';
  report.finishedAt = new Date().toISOString();
  await saveJson(join(outputDir, 'report.json'), report);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--generate' || argument === '--dry-run') options[argument.slice(2)] = true;
    else if (['--input', '--output', '--list', '--endpoint', '--limit'].includes(argument)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${argument} 缺少值`);
      options[argument.slice(2)] = args[++i];
    } else throw new Error(`不支援參數：${argument}`);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const database = JSON.parse(await readFile(resolve(options.input ?? join(root, 'source/vocabulary-database.json')), 'utf8'));
  const planned = planAudio(database, options.list ?? 'basic');
  let jobs = planned;
  if (options.limit) {
    const limit = Number(options.limit);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--limit 必須為正整數');
    jobs = jobs.slice(0, limit);
  }
  const outputDir = resolve(options.output ?? join(root, 'data/wordbank-audio'));
  console.log(JSON.stringify({ profile: DEFAULT_PROFILE, outputDir, words: planned.filter((j) => j.kind === 'word').length,
    examples: planned.filter((j) => j.kind === 'example').length, selected: jobs.length, total: planned.length }));
  if (!options.generate || options['dry-run']) return;
  if (process.env.WORD_BANK_REAL_TTS !== '1') throw new Error('真實產音須明確設定 WORD_BANK_REAL_TTS=1');
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort());
  process.on('SIGTERM', () => controller.abort());
  const report = await withBatchLock(outputDir, () => generateBatch({ jobs, outputDir, endpoint: options.endpoint, signal: controller.signal }));
  console.log(JSON.stringify(report));
  if (report.failed.length || report.stoppedReason) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
