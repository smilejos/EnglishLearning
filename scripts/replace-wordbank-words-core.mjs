// 單字錄音替換核心；所有服務／DB 操作均由呼叫者注入，這裡不自行連線。
import { createHash, randomUUID } from 'node:crypto';
import { open, mkdir, readFile, rename, unlink, link, stat, readlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';
import { spawnSync } from 'node:child_process';

const hash = value => createHash('sha256').update(value).digest('hex');
const guid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const stages = new Set(['pending', 'requesting', 'queued', 'ready', 'generated', 'applied']);
const now = () => new Date().toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
const profileKeys = ['model', 'voice', 'instruct', 'lang_code', 'response_format'];

function profileOf(input) {
  if (!input || profileKeys.some(key => typeof input[key] !== 'string') ||
      !input.model.trim() || !input.voice.trim() || !input.lang_code.trim() || input.response_format !== 'mp3')
    throw new Error('生成設定必須包含模型、聲線、指示、語言與 mp3 格式');
  return Object.fromEntries(profileKeys.map(key => [key, input[key]]));
}

function seal(plan) {
  const { planHash: _ignored, ...contents } = plan;
  return hash(JSON.stringify(contents));
}

export const AUDIO_KINDS = ['word', 'example', 'explanation'];
export function normalizeAudioKinds(input = ['word']) {
  const values = typeof input === 'string' ? input.split(',').map(value => value.trim()) : input;
  if (!Array.isArray(values) || !values.length || values.some(value => !AUDIO_KINDS.includes(value)) ||
      new Set(values).size !== values.length) throw new Error('kinds 只接受不重複的 word、example、explanation');
  return AUDIO_KINDS.filter(kind => values.includes(kind));
}
export const planAudioKinds = plan => plan.version === 1 ? ['word'] : normalizeAudioKinds(plan.kinds);

/** 順序來自唯讀 DB snapshot；未指定種類時保留原 version 1 整詞清單格式。 */
export function createWordReplacementPlan({ entries, profile, origin, batchId, target, kinds = ['word'] }) {
  const settings = profileOf(profile), selected = normalizeAudioKinds(kinds);
  if (!Array.isArray(entries) || !entries.length) throw new Error('替換清單不可為空');
  if (typeof batchId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(batchId)) throw new Error('batchId 格式錯誤');
  const profileHash = hash(JSON.stringify(settings)).slice(0, 16);
  const seen = new Set(), jobs = [];
  for (const [index, entry] of entries.entries()) {
    if (!guid.test(entry.guid) || typeof entry.word !== 'string' || !entry.word.trim())
      throw new Error(`第 ${index + 1} 個單字的 GUID／文字無效或重複`);
    const assets = selected.includes('word') ? [{ assetGuid: entry.guid, kind: 'word', text: entry.word, previous: entry.previous }] : [];
    assets.push(...(entry.assets ?? []).filter(asset => selected.includes(asset.kind)));
    for (const asset of assets) {
      if (!guid.test(asset.assetGuid) || seen.has(asset.assetGuid) || !AUDIO_KINDS.includes(asset.kind) ||
          typeof asset.text !== 'string' || !asset.text.trim() || (asset.kind !== 'word' && asset.assetGuid === entry.guid))
        throw new Error(`第 ${index + 1} 個單字的 GUID／文字無效或重複`);
      seen.add(asset.assetGuid);
      const text = asset.text.trim();
      jobs.push({ assetGuid: asset.assetGuid, entryGuid: entry.guid, kind: asset.kind, text,
        textHash: hash(text), relativePath: `wordbank/${profileHash}-${batchId}/${asset.assetGuid}.mp3`,
        previous: asset.previous == null ? null : clone(asset.previous) });
    }
  }
  if (!jobs.length) throw new Error('選定種類沒有非空白英文可替換');
  const legacy = selected.length === 1 && selected[0] === 'word';
  const plan = { version: legacy ? 1 : 2, batchId, createdAt: now(), origin, profile: settings,
    target: clone(target ?? null), total: jobs.length, jobs, ...(legacy ? {} : { kinds: selected }) };
  plan.planHash = seal(plan);
  validateWordReplacementPlan(plan);
  return plan;
}

export function validateWordReplacementPlan(plan) {
  if (!plan || ![1, 2].includes(plan.version) || !Array.isArray(plan.jobs) || !plan.jobs.length ||
      plan.total !== plan.jobs.length || plan.planHash !== seal(plan)) throw new Error('替換計畫已改動或格式錯誤，請使用原 plan.json');
  const selected = planAudioKinds(plan);
  if (plan.version === 2 && JSON.stringify(plan.kinds) !== JSON.stringify(selected)) throw new Error('計畫 kinds 順序或種類無效');
  const profile = profileOf(plan.profile);
  const profileHash = hash(JSON.stringify(profile)).slice(0, 16);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(plan.batchId)) throw new Error('batchId 格式錯誤');
  const seen = new Set();
  for (const job of plan.jobs) {
    if (!guid.test(job.assetGuid) || !guid.test(job.entryGuid) || !selected.includes(job.kind) ||
        (job.kind === 'word' ? job.assetGuid !== job.entryGuid : job.assetGuid === job.entryGuid) ||
        seen.has(job.assetGuid) || typeof job.text !== 'string' || !job.text.trim() || job.text !== job.text.trim() ||
        job.textHash !== hash(job.text) || job.relativePath !== `wordbank/${profileHash}-${plan.batchId}/${job.assetGuid}.mp3`)
      throw new Error('替換計畫只能包含文字、GUID 與選定種類一致的字庫音訊');
    seen.add(job.assetGuid);
  }
  return plan;
}

async function syncDirectory(path) {
  const directory = await open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx');
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
    await file.close();
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** 跨主機的鎖不可依本機 PID 判斷過期；同一主機僅清理確定已結束的程序。 */
export async function withWordReplacementLock(workDir, run, { recoverLock = false } = {}) {
  await mkdir(workDir, { recursive: true });
  const path = join(workDir, '.replacement.lock');
  const identity = await processIdentity(process.pid);
  const token = randomUUID();
  let handle;
  try { handle = await open(path, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const old = await readJson(path);
    if (!old || !Number.isSafeInteger(old.pid) || old.pid < 1) throw new Error('批次鎖格式錯誤，請人工確認原程序是否仍在執行');
    // 固定 hostname 的兩個容器仍可能各有 PID 1；不可把另一 namespace 的活鎖當作 PID 重用。
    const foreignHost = old.host !== hostname();
    const foreignNamespace = old.namespace && identity.namespace && old.namespace !== identity.namespace;
    if (foreignHost || foreignNamespace) {
      if (!recoverLock) throw new Error(foreignHost
        ? '此批次已有鎖（可能由另一主機執行），確認原程序已停止後可加 --recover-lock'
        : '此批次鎖來自另一個容器，確認原容器已停止後可加 --recover-lock');
    } else {
      let alive = true;
      try { process.kill(old.pid, 0); }
      catch (check) {
        if (check.code !== 'ESRCH') throw new Error(`已有替換程序使用此目錄（PID ${old.pid}）`);
        alive = false;
      }
      if (alive) {
        const current = await processIdentity(old.pid);
        if (!old.processStart || !current.processStart || old.processStart === current.processStart)
          throw new Error(`已有替換程序使用此目錄（PID ${old.pid}）`);
      }
    }
    await unlink(path);
    handle = await open(path, 'wx');
  }
  try {
    await handle.writeFile(JSON.stringify({ host: hostname(), pid: process.pid, ...identity, token, startedAt: now() }));
    await handle.sync();
    return await run();
  } finally {
    await handle.close();
    // 只移除本次取得的鎖，避免人工處理後誤刪其他程序的新鎖。
    if ((await readJson(path))?.token === token) await unlink(path);
  }
}

async function processIdentity(pid) {
  if (process.platform === 'linux') {
    try {
      const value = await readFile(`/proc/${pid}/stat`, 'utf8');
      const fields = value.slice(value.lastIndexOf(')') + 2).trim().split(/\s+/);
      return { processStart: fields[19], namespace: await readlink(`/proc/${pid}/ns/pid`) };
    } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim() ? { processStart: result.stdout.trim() } : {};
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvHeader = ['序號', '總數', '單字', '狀態', '嘗試次數', '更新時間', '錯誤', 'GUID', '新音檔路徑'];
const csvRow = (job, record, index, total, version = 1) => [index + 1, total, job.text, record?.stage ?? 'pending',
  record?.attempts ?? 0, record?.updatedAt ?? '', record?.error ?? '', job.assetGuid, job.relativePath, ...(version === 2 ? [job.kind] : [])].map(csvCell).join(',') + '\n';

async function appendProgress(workDir, job, record, index, total, version) {
  const path = join(workDir, 'progress.csv');
  let file;
  try { file = await open(path, 'ax'); await file.writeFile('\uFEFF' + [...csvHeader, ...(version === 2 ? ['種類'] : [])].map(csvCell).join(',') + '\n'); }
  catch (error) { if (error.code !== 'EEXIST') throw error; file = await open(path, 'a'); }
  try { await file.writeFile(csvRow(job, record, index, total, version)); await file.sync(); }
  finally { await file.close(); }
}

const recordPath = (workDir, job) => join(workDir, 'records', `${job.assetGuid}.json`);
async function loadRecord(workDir, plan, job) {
  const record = await readJson(recordPath(workDir, job));
  if (record && (record.version !== 1 || record.planHash !== plan.planHash || record.assetGuid !== job.assetGuid ||
      record.text !== job.text || !stages.has(record.stage) || !Number.isSafeInteger(record.attempts) || record.attempts < 0 ||
      (['generated', 'applied'].includes(record.stage) && !record.asset)))
    throw new Error(`單字記錄與計畫不一致：${job.text}`);
  if (record?.asset) {
    const expected = expectedAsset(plan, job, { durationSeconds: record.asset.durationSeconds,
      bytes: record.asset.bytes, sha256: record.asset.sha256 }, record.asset.generatedAt);
    if (!sameMetadata(record.asset, expected) || record.asset.text !== job.text ||
        !Number.isFinite(record.asset.durationSeconds) || record.asset.durationSeconds <= 0 ||
        !Number.isSafeInteger(record.asset.bytes) || record.asset.bytes <= 0 || !/^[a-f\d]{64}$/.test(record.asset.sha256))
      throw new Error(`單字音檔記錄與計畫不一致：${job.text}`);
  }
  return record ?? { version: 1, planHash: plan.planHash, assetGuid: job.assetGuid,
    text: job.text, stage: 'pending', attempts: 0, previous: job.previous };
}

/** 一個字一列的最新記錄；progress.csv 另保留即時狀態變化歷程。 */
export async function writeWordReplacementStatus({ plan, workDir }) {
  validateWordReplacementPlan(plan);
  let csv = '\uFEFF' + [...csvHeader, ...(plan.version === 2 ? ['種類'] : [])].map(csvCell).join(',') + '\n';
  const counts = {};
  for (const [index, job] of plan.jobs.entries()) {
    const record = await loadRecord(workDir, plan, job);
    counts[record.stage] = (counts[record.stage] ?? 0) + 1;
    csv += csvRow(job, record, index, plan.total, plan.version);
  }
  await mkdir(workDir, { recursive: true });
  const temporary = join(workDir, `status.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx');
  try { await file.writeFile(csv); await file.sync(); } finally { await file.close(); }
  await rename(temporary, join(workDir, 'status.csv'));
  await syncDirectory(workDir);
  return { total: plan.total, counts };
}

async function immutableFile(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx');
  try {
    await file.writeFile(bytes); await file.sync(); await file.close();
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readFile(path)).equals(bytes)) throw new Error(`目的檔已有不同內容，保留原檔：${path}`);
    }
    await syncDirectory(dirname(path));
  } finally { await file.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

async function audioMetadata(path, validate) {
  // 先檢查存在性；ffprobe 的缺檔錯誤不一定保留 ENOENT。
  await stat(path);
  const metadata = await validate(path);
  const bytes = await readFile(path);
  if (!Number.isFinite(metadata?.durationSeconds) || metadata.durationSeconds <= 0 || metadata.bytes !== bytes.length || !bytes.length)
    throw new Error('音檔驗證未回傳有效的秒數與檔案大小');
  return { durationSeconds: metadata.durationSeconds, bytes: bytes.length, sha256: hash(bytes) };
}

function expectedAsset(plan, job, metadata, generatedAt) {
  return { ...job, ...metadata, generatedAt, model: plan.profile.model, voice: plan.profile.voice,
    instruct: plan.profile.instruct, language: plan.profile.lang_code };
}

function sameMetadata(current, asset) {
  if (!current) return false;
  const date = new Date(current.generatedAt);
  if (!Number.isFinite(date.getTime())) return false;
  const exact = ['assetGuid', 'entryGuid', 'kind', 'relativePath', 'model', 'voice', 'instruct', 'language', 'textHash'];
  return exact.every(key => current[key] === asset[key]) && Number(current.bytes) === asset.bytes &&
    Number(current.durationSeconds) === asset.durationSeconds &&
    date.toISOString() === asset.generatedAt;
}

/** deps：synthesize/resumeEvent/download 回傳 MP3 Buffer；validate、readCurrent、applyOne 由 CLI 注入。 */
export async function runWordReplacement({ plan, workDir, audioDir, apply = false, retryUnknown = false, recoverLock = false,
  signal, log = console.log, deps }) {
  validateWordReplacementPlan(plan);
  if (!deps?.validate || !deps.synthesize || (apply && (!audioDir || !deps.readCurrent || !deps.applyOne)))
    throw new Error('缺少音檔驗證、生成或正式替換依賴');
  if (recoverLock) log('依 --recover-lock 處理先前容器／主機留下的鎖；原批次程序須已停止。');
  return withWordReplacementLock(workDir, async () => {
    const savedPlan = await readJson(join(workDir, 'plan.json'));
    if (savedPlan && savedPlan.planHash !== plan.planHash) throw new Error('此目錄屬於其他批次，請沿用原計畫或另選目錄');
    if (!savedPlan) await atomicJson(join(workDir, 'plan.json'), plan);
    const report = { total: plan.total, generated: 0, applied: 0, skipped: 0, failed: [] };
    let fatal;
    log(`共有 ${plan.total} ${plan.version === 1 ? '個單字' : '筆字庫音訊'}；${apply ? '逐筆產生並替換' : '逐筆產生離線音檔'}，重跑同一批次可續接。`);
    try {
      for (const [index, job] of plan.jobs.entries()) {
        if (signal?.aborted) { report.stoppedReason = '收到停止訊號，可重跑同一指令續接'; break; }
        log(`${index + 1} / ${plan.total} - ${plan.version === 2 ? `[${job.kind}] ` : ''}${job.text}`);
        let record = await loadRecord(workDir, plan, job);
        const persist = async changes => {
          record = { ...record, ...changes, updatedAt: now() };
          await atomicJson(recordPath(workDir, job), record);
          await appendProgress(workDir, job, record, index, plan.total, plan.version);
        };
        try {
          const staged = join(workDir, 'staged', job.relativePath);
          let existing;
          try { existing = await audioMetadata(staged, deps.validate); }
          catch (error) {
            if (error.code !== 'ENOENT') throw error;
            if (record.asset && apply) {
              try { existing = await audioMetadata(join(audioDir, job.relativePath), deps.validate); }
              catch (volumeError) { if (volumeError.code !== 'ENOENT') throw volumeError; }
            }
          }
          if (existing) {
            if (record.asset && (record.asset.sha256 !== existing.sha256 || record.asset.bytes !== existing.bytes ||
                record.asset.durationSeconds !== existing.durationSeconds)) throw new Error('已記錄的新音檔校驗不符，停止替換');
            if (!record.asset) await persist({ stage: 'generated', error: null,
              asset: expectedAsset(plan, job, existing, (await stat(staged)).mtime.toISOString()) });
          } else {
            if (record.asset) throw new Error('已產生的新音檔遺失，停止以免重複產音');
            if (retryUnknown && record.error && ['requesting', 'queued', 'ready'].includes(record.stage)) {
              log(`${index + 1} / ${plan.total} - ${job.text}：依 --retry-unknown 重新請求，捨棄先前失敗的事件／下載引用。`);
              await persist({ stage: 'pending', eventId: null, file: null, error: null });
            }
            const options = { origin: plan.origin, text: job.text, profile: plan.profile, signal,
              onEvent: async event => {
                if (event.stage === 'queued') await persist({ stage: 'queued', eventId: event.eventId, error: null });
                if (event.stage === 'ready') await persist({ stage: 'ready', eventId: event.eventId, file: event.file, error: null });
              } };
            let bytes;
            if (record.file) {
              if (!deps.download) throw new Error('缺少已生成音檔下載恢復依賴');
              bytes = await deps.download({ ...options, file: record.file });
            } else if (record.eventId) {
              if (!deps.resumeEvent) throw new Error('缺少 Gradio 事件恢復依賴');
              bytes = await deps.resumeEvent({ ...options, eventId: record.eventId });
            } else {
              if (record.stage === 'requesting' && !retryUnknown)
                throw new Error('上次產音請求結果不明；確認後加 --retry-unknown 才會重新請求此字');
              await persist({ stage: 'requesting', attempts: record.attempts + 1, error: null });
              bytes = await deps.synthesize(options);
            }
            signal?.throwIfAborted();
            if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('生成服務未回傳音訊 bytes');
            // 寫入後才驗證；若驗證失敗則保留原始輸出供檢查，不重新 POST。
            await immutableFile(staged, bytes);
            const metadata = await audioMetadata(staged, deps.validate);
            await persist({ stage: 'generated', error: null, asset: expectedAsset(plan, job, metadata, now()) });
            report.generated++;
          }
          if (!apply) { report.skipped += existing ? 1 : 0; continue; }
          signal?.throwIfAborted();
          const destination = join(audioDir, job.relativePath);
          const sourceBytes = await readFile(existing && !await fileExists(staged) ? destination : staged);
          await immutableFile(destination, sourceBytes);
          const checked = await audioMetadata(destination, deps.validate);
          if (checked.sha256 !== record.asset.sha256 || checked.bytes !== record.asset.bytes ||
              checked.durationSeconds !== record.asset.durationSeconds) throw new Error('正式目的檔校驗不符');
          await deps.verifySource?.(job);
          const current = await deps.readCurrent(job);
          if (sameMetadata(current, record.asset)) {
            if (record.stage !== 'applied' || record.error) await persist({ stage: 'applied', error: null });
            report.skipped++;
          } else {
            await deps.applyOne(job, record.asset, job.previous);
            if (!sameMetadata(await deps.readCurrent(job), record.asset)) throw new Error('寫入後 metadata 核對失敗');
            await persist({ stage: 'applied', error: null });
            report.applied++;
          }
        } catch (error) {
          // adapter 亦於下載前提供 FileData；callback 落盤失敗時盡量保留錯誤所帶的恢復資訊。
          const recovery = {};
          if (error.gradioEventId) recovery.eventId = error.gradioEventId;
          if (error.gradioFileData) { recovery.file = error.gradioFileData; recovery.stage = 'ready'; }
          else if (error.gradioEventId && record.stage === 'requesting') recovery.stage = 'queued';
          const message = error.message ?? String(error);
          try { await persist({ ...recovery, error: message }); }
          catch (recordingError) { report.recordingError = `錯誤記錄寫入失敗：${recordingError.message}`; }
          report.failed.push({ index: index + 1, assetGuid: job.assetGuid, text: job.text, error: message });
          report.stoppedReason = signal?.aborted ? '收到停止訊號，可重跑同一指令續接' : '此字失敗，已保存記錄並停止；重跑同一指令續接';
          log(`${index + 1} / ${plan.total} - ${job.text}：${message}`);
          break;
        }
      }
    } catch (error) {
      fatal = error;
      throw error;
    } finally {
      report.finishedAt = now();
      try {
        await writeWordReplacementStatus({ plan, workDir });
        await atomicJson(join(workDir, 'report.json'), report);
      } catch (recordingError) {
        if (!fatal && !report.failed.length && !report.stoppedReason) throw recordingError;
        const message = `結束記錄寫入失敗：${recordingError.message}`;
        if (fatal) fatal.recordingError = message;
        else report.recordingError = message;
        log(message);
      }
    }
    return report;
  }, { recoverLock });
}

async function fileExists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
