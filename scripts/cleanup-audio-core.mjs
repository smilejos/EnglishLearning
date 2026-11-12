// 共用 audio volume 的未引用檔案清理；只刪經清單與最新 DB 雙重核對的音檔。
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

const namespaces = new Set(['articles', 'words', 'wordbank', 'assets', 'scenarios']);
const extensions = new Set(['.mp3', '.wav', '.m4a']);
const statuses = new Set(['candidate', 'referenced', 'recent', 'ignored']);
export const DEFAULT_MIN_AGE_HOURS = 24;
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function validateRelativePath(value) {
  if (typeof value !== 'string' || !value || /[\\\x00-\x1f\x7f]/.test(value) ||
      path.posix.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error(`音檔相對路徑不安全：${JSON.stringify(value)}`);
  return value;
}
export function supportedAudio(value) {
  validateRelativePath(value);
  return value.includes('/') && namespaces.has(value.split('/')[0]) && extensions.has(path.posix.extname(value));
}
const fileIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino), bytes: Number(stat.size),
  mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs) });
const sameFile = (a, b) => ['dev', 'ino', 'bytes', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);

export async function audioRootIdentity(audioDir) {
  const absolute = path.resolve(audioDir), stat = await lstat(absolute, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('AUDIO_DIR 必須是實體目錄，不可為 symlink');
  return { path: await realpath(absolute), dev: String(stat.dev), ino: String(stat.ino) };
}
async function checkedPath(root, relativePath) {
  validateRelativePath(relativePath);
  const parts = relativePath.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = await lstat(current, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error(`拒絕 symlink：${relativePath}`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`音檔父路徑不是目錄：${relativePath}`);
    if (index === parts.length - 1 && !stat.isFile()) throw new Error(`不是一般音檔：${relativePath}`);
  }
  return current;
}
async function inspectFile(root, relativePath) {
  const absolute = await checkedPath(root, relativePath);
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`不是一般音檔：${relativePath}`);
    const data = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const current = await lstat(await checkedPath(root, relativePath), { bigint: true });
    if (!sameFile(fileIdentity(before), fileIdentity(after)) || !sameFile(fileIdentity(after), fileIdentity(current)))
      throw new Error(`核對期間音檔已變更：${relativePath}`);
    return { ...fileIdentity(after), sha256: sha256(data) };
  } finally { await handle.close(); }
}

export function referenceSet(references) {
  const result = new Set();
  for (const reference of references) result.add(validateRelativePath(reference));
  return result;
}
export function summarizeFiles(files) {
  const summary = Object.fromEntries([...statuses].map(status => [status, { count: 0, bytes: 0 }]));
  for (const file of files) { summary[file.status].count++; summary[file.status].bytes += file.bytes; }
  return summary;
}
function planHash(plan) {
  const { planHash: ignored, ...body } = plan;
  return sha256(JSON.stringify(body));
}
export async function createCleanupPlan({ audioDir, target, references, minAgeHours = DEFAULT_MIN_AGE_HOURS, now = Date.now() }) {
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) throw new Error('min-age-hours 必須是非負數');
  const root = await audioRootIdentity(audioDir), used = referenceSet(references);
  const cutoffMs = now - minAgeHours * 3_600_000, files = [];
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      validateRelativePath(relativePath);
      const absolute = path.join(directory, entry.name), stat = await lstat(absolute, { bigint: true });
      if (stat.isSymbolicLink()) { files.push({ relativePath, status: 'ignored', reason: 'symlink', bytes: 0 }); continue; }
      if (stat.isDirectory()) { await visit(absolute, relativePath); continue; }
      if (!stat.isFile()) { files.push({ relativePath, status: 'ignored', reason: '非一般檔案', bytes: 0 }); continue; }
      const file = { relativePath, ...fileIdentity(stat) };
      if (used.has(relativePath)) files.push({ ...file, status: 'referenced' });
      else if (!supportedAudio(relativePath)) files.push({ ...file, status: 'ignored', reason: '未知目錄或非支援音檔' });
      else if (Math.max(Number(stat.mtimeNs), Number(stat.ctimeNs)) / 1_000_000 > cutoffMs)
        files.push({ ...file, status: 'recent', reason: '新增或變更時間晚於 cutoff' });
      else files.push({ relativePath, status: 'candidate', ...await inspectFile(root.path, relativePath) });
    }
  }
  await visit(root.path);
  const plan = { version: 1, createdAt: new Date(now).toISOString(), target, root, minAgeHours,
    cutoff: new Date(cutoffMs).toISOString(), files, summary: summarizeFiles(files) };
  plan.planHash = planHash(plan);
  validateCleanupPlan(plan);
  return plan;
}
export function validateCleanupPlan(plan) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.files) || !plan.target || !plan.root ||
      !path.isAbsolute(plan.root.path ?? '') || !Number.isFinite(plan.minAgeHours) || plan.minAgeHours < 0 ||
      !Number.isFinite(Date.parse(plan.createdAt)) || !Number.isFinite(Date.parse(plan.cutoff)) || plan.planHash !== planHash(plan))
    throw new Error('清理清單格式或雜湊不符，請重新 plan');
  const seen = new Set();
  for (const file of plan.files) {
    validateRelativePath(file.relativePath);
    if (seen.has(file.relativePath) || !statuses.has(file.status) || !Number.isSafeInteger(file.bytes) || file.bytes < 0)
      throw new Error('清理清單含重複路徑或無效檔案');
    seen.add(file.relativePath);
    if (file.status === 'candidate' && (!supportedAudio(file.relativePath) || !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !['dev', 'ino', 'mtimeNs', 'ctimeNs'].every(key => /^\d+$/.test(file[key] ?? '')) ||
        Math.max(Number(file.mtimeNs), Number(file.ctimeNs)) / 1_000_000 > Date.parse(plan.cutoff)))
      throw new Error(`候選音檔格式不符：${file.relativePath}`);
  }
  if (JSON.stringify(plan.summary) !== JSON.stringify(summarizeFiles(plan.files))) throw new Error('清理清單摘要不符');
}

/** references 必須在 DB SHARE 鎖持有期間讀取，且整個 apply 持續持鎖。 */
export async function applyCleanupPlan({ plan, audioDir, target, references, onProgress = async () => {},
  removeFile = unlink, assertConnection = async () => {}, signal }) {
  validateCleanupPlan(plan);
  if (JSON.stringify(target) !== JSON.stringify(plan.target)) throw new Error('資料庫目標與清理清單不同');
  const root = await audioRootIdentity(audioDir);
  if (['path', 'dev', 'ino'].some(key => root[key] !== plan.root[key])) throw new Error('audio 根目錄與清理清單不同');
  const used = referenceSet(references), candidates = plan.files.filter(file => file.status === 'candidate');
  const report = { planHash: plan.planHash, startedAt: new Date().toISOString(), candidates: candidates.length,
    deleted: 0, deletedBytes: 0, alreadyAbsent: 0, newlyReferenced: 0, failed: [], finishedAt: null };
  async function verify(file) {
    try {
      const actual = await inspectFile(root.path, file.relativePath);
      if (!sameFile(actual, file) || actual.sha256 !== file.sha256) throw new Error(`音檔已變更，未刪除：${file.relativePath}`);
      return true;
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  try {
    // 先核對整份候選清單；已變更或 symlink 不會在刪到一半後才首次被發現。
    for (const file of candidates) {
      signal?.throwIfAborted();
      if (!used.has(file.relativePath)) await verify(file);
    }
    for (const file of candidates) {
      signal?.throwIfAborted();
      let status;
      if (used.has(file.relativePath)) { report.newlyReferenced++; status = 'newlyReferenced'; }
      else if (!await verify(file)) { report.alreadyAbsent++; status = 'alreadyAbsent'; }
      else {
        // 真 CLI 以仍持有 SHARE 鎖的同一 DB client 核對連線，失效時停止 unlink。
        await assertConnection();
        signal?.throwIfAborted();
        await removeFile(await checkedPath(root.path, file.relativePath));
        report.deleted++; report.deletedBytes += file.bytes; status = 'deleted';
      }
      await onProgress({ relativePath: file.relativePath, status, bytes: file.bytes, at: new Date().toISOString() });
    }
  } catch (error) {
    report.failed.push(error.message);
    error.cleanupReport = report;
    throw error;
  } finally { report.finishedAt = new Date().toISOString(); }
  return report;
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
export function cleanupPlanCsv(plan) {
  validateCleanupPlan(plan);
  return '\uFEFF' + [['路徑', '狀態', 'bytes', 'SHA-256', '原因'], ...plan.files.map(file =>
    [file.relativePath, file.status, file.bytes, file.sha256, file.reason])].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}
