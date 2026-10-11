import path from 'node:path';
import {readFile, realpath, lstat, mkdir, open, unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const TASKS = ['check', 'copy-audio', 'audio-metadata', 'scenario', 'postcheck', 'snapshot'];
export function parseOptions(args) {
  const [task, ...rest] = args;
  if (!TASKS.includes(task)) throw Error(`工作必須為 ${TASKS.join('／')}`);
  const options = {task};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!['--package', '--manifest', '--baseline', '--output'].includes(flag) || !rest[i + 1] || rest[i + 1].startsWith('--') || options[flag.slice(2)]) throw Error('未知、重複或缺值參數');
    options[flag.slice(2)] = rest[i + 1];
  }
  if (task === 'snapshot') {
    if (!options.output || options.package || options.manifest || options.baseline) throw Error('snapshot 僅接受單一 --output');
  } else if (!options.package || options.output) throw Error('必須指定單一 --package，不能指定 --output');
  if (['copy-audio', 'audio-metadata'].includes(task) && !options.manifest) throw Error('此工作必須指定 --manifest');
  return options;
}

/** 新修訂只加入 draft；既有版本內容與發布指標必須與本輪唯讀基準一致。 */
export function assertRevisionBaseline(content, revisions, pointer, baseline) {
  const time = value => value == null ? null : value instanceof Date ? value.toISOString() : value;
  if (!baseline) {
    if (pointer !== null || revisions.some(r => r.status !== 'draft')) throw Error('已有發布版本，修訂須指定唯讀 --baseline');
    return;
  }
  if (baseline.identity?.database !== 'english_learning' || baseline.identity?.address !== '172.18.0.4/32' || baseline.identity?.port !== 5432 || !baseline.checkedAt || !Array.isArray(baseline.revisions) || !Array.isArray(baseline.pointers)) throw Error('修訂基準身分或結構不符');
  const saved = baseline.revisions.filter(r => r.scenario_key === content.scenarioKey);
  const savedPointer = baseline.pointers.find(r => r.scenario_key === content.scenarioKey);
  if (!saved.length || !savedPointer || pointer !== savedPointer.published_revision || content.revision !== Math.max(...saved.map(r => r.revision)) + 1) throw Error('新修訂版號／發布指標與基準不符');
  for (const old of saved) {
    const actual = revisions.find(r => r.revision === old.revision);
    if (!actual || actual.content_hash !== old.content_hash || actual.status !== old.status || time(actual.published_at) !== time(old.published_at)) throw Error('既有版本與修訂基準不同');
  }
  if (revisions.some(r => !saved.some(s => s.revision === r.revision) && (r.revision !== content.revision || r.status !== 'draft' || r.published_at !== null))) throw Error('出現基準以外的版本或發布異動');
}
export function assertManifestScope(manifest, content) {
  const targets = new Set(content.targets.map(t => t.entryGuid));
  if (manifest.entries.some(a => !targets.has(a.entryGuid))) throw Error('manifest 包含本場目標詞以外的音檔');
  if (new Set(manifest.entries.map(a => a.assetGuid)).size !== manifest.entries.length) throw Error('manifest 音檔 GUID 重複');
}
export async function safeFile(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw Error('不安全的相對路徑');
  let current = await realpath(root);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('拒絕 symlink');
  }
  if (!(await lstat(current)).isFile()) throw Error('必須為一般檔案');
  return current;
}
/** 排他建立；既有位元組完全相同才重用，衝突絕不覆寫。 */
export async function exclusiveCopy(root, relative, data) {
  if (!/^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(relative)) throw Error('音檔必須在安全 wordbank 路徑');
  const base = await realpath(root);
  if ((await lstat(root)).isSymbolicLink()) throw Error('volume root 不可為 symlink');
  let directory = base;
  for (const part of relative.split('/').slice(0, -1)) {
    directory = path.join(directory, part);
    try { await mkdir(directory); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('音檔目錄不可為 symlink');
  }
  const file = path.join(base, relative);
  let handle;
  try { handle = await open(file, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const existing = await readFile(await safeFile(base, relative));
    if (existing.length !== data.length || hash(existing) !== hash(data)) throw Error('既有音檔不同，拒絕覆寫');
    return false;
  }
  try { await handle.writeFile(data); }
  catch (e) { await handle.close(); await unlink(file); throw e; }
  await handle.close();
  if (hash(await readFile(await safeFile(base, relative))) !== hash(data)) throw Error('複製後 hash 不符');
  return true;
}
