/** 僅時間介系詞兩場 r1。stdout 僅 JSON；不部署、不分類、不發布、不生成。
 * preflight/postcheck 全程 READ ONLY。apply 須有未變更 baseline 與備份驗證紀錄。
 * 宿主入口：run-time-prepositions-production.mjs；本檔亦可由 mock 匯入，無頂層副作用。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, lstat, realpath, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool, type PoolClient } from 'pg';
import sharp from 'sharp';
import {
  parseWordbankDocument, WordbankAudioManifestSchema, validateWordbankAudioManifest,
  mergeWordbankEntry, scenarioCanonicalJson, scenarioRevisionHash, scenarioHash,
  validateScenarioMedia, importWordbankEntries, importScenarioRevision, copyScenarioAsset,
  verifyScenarioAssets, withTransaction, type WordbankEntry, type WordbankAudioManifest,
  type ScenarioContent, type ScenarioMedia, type DbPool,
} from '@el/shared';
import { contentFromScenarioPackage } from '../import-scenario';
// @ts-expect-error 現有離線 MJS 檢查器沒有型別宣告。
import { validateScenarioPackage } from '../check-scenario-package.mjs';
// @ts-expect-error 現有純檔案安全原語沒有型別宣告。
import { safeFile, exclusiveCopy } from './import-safety.mjs';

export const KEYS = ['time-prepositions-basics', 'time-prepositions-extended'] as const;
export const IDENTITY = { database: 'english_learning', address: '172.18.0.4', port: 5432 };
export const DELTA = 'docs/scenarios/preparation/time-prepositions/wordbank-additions.json';
export const MANIFEST = 'data/scenario-wordbank-audio/time-prepositions/manifest.json';
const AUTUMN = { guid: '8f3a9c1c-fc8e-5494-b126-31fe95b29df8', id: 9253, word: 'autumn' };
const TARGET_WORDS = ['in', 'on', 'at', 'before', 'after', 'from', 'to', 'by', 'until', 'for', 'since', 'during', 'within'];
const TABLES = ['learning_scenarios', 'scenario_revisions', 'scenario_word_links', 'scenario_tags',
  'scenario_tag_settings', 'tags', 'wordbank_entries', 'wordbank_audio', 'pgmigrations'];
export const REQUIRED_COLUMNS: Record<string, string[]> = {
  learning_scenarios: ['scenario_key', 'published_revision', 'created_at'],
  scenario_revisions: ['scenario_key', 'revision', 'content', 'media', 'content_hash', 'status', 'created_at', 'published_at'],
  scenario_word_links: ['scenario_key', 'revision', 'entry_guid', 'word'], scenario_tags: ['scenario_key', 'tag_id'],
  scenario_tag_settings: ['singleton', 'kind'], tags: ['id', 'kind', 'label'],
  wordbank_entries: ['guid', 'source_id', 'word', 'parts_of_speech', 'definition', 'explains', 'examples', 'level', 'category', 'scenario', 'created_at', 'updated_at'],
  wordbank_audio: ['asset_guid', 'entry_guid', 'kind', 'relative_path', 'model', 'voice', 'instruct', 'language', 'text_hash', 'duration_seconds', 'bytes', 'generated_at'],
  pgmigrations: ['id', 'name', 'run_on'],
};
const REQUIRED_MIGRATIONS = ['1791158400000_wordbank', '1791158400001_wordbank-explanation-audio',
  '1791504000000_scenarios', '1791676800000_scenario-tags'];
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ROOTS = { audioDir: '/data/audio', imageDir: '/data/images' };
type Row = Record<string, any>; // DB JSON；進入內容／字庫／音訊邊界時另用 shared schema 驗證。
type Identity = typeof IDENTITY;
type Roots = typeof ROOTS;
type Mode = 'preflight' | 'apply' | 'postcheck';
export type Options = { mode: Mode; baseline?: string; backupRecord?: string };
type FileState = { root: 'audioDir' | 'imageDir'; relativePath: string; exists: boolean; bytes?: number; sha256?: string };
type Package = { content: ScenarioContent; media: ScenarioMedia; imagePath: string; audioPath: string };
export type Inputs = {
  inputHashes: Record<string, string>; delta: WordbankEntry[]; canonical: WordbankEntry[];
  manifest: WordbankAudioManifest; audioHashes: Record<string, string>; packages: Package[];
  targetGuids: string[]; refs: string[];
};
type Summary = { count: number; sha256: string };
export type State = {
  identity: Identity; migrations: Row[]; schema: Row[]; constraints: Row[]; triggers: Row[];
  settings: Row[]; scenarios: Row[]; revisions: Row[]; links: Row[]; scenarioTags: Row[]; tags: Row[];
  wordbank: Summary & { unrelated: Summary; affectedRows: Row[]; supportRows: Row[]; autumnCollisions: Row[] };
  audio: Summary & { unrelated: Summary; targetRows: Row[] };
};
export type Baseline = {
  version: 1; batch: 'time-prepositions-r1'; checkedAt: string; inputHashes: Record<string, string>;
  state: State; files: FileState[]; plan: Row; backupRecordContract: Row; baselineContentHash: string;
};
export const digest = (value: unknown): string => scenarioHash(scenarioCanonicalJson(value));
const equal = (a: unknown, b: unknown): boolean => digest(a) === digest(b);
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const summary = (rows: Row[]): Summary => ({ count: rows.length, sha256: digest(rows) });
const isTargetKey = (key: string): boolean => (KEYS as readonly string[]).includes(key);
const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;
export function parseOptions(args: string[]): Options {
  const [mode, ...rest] = args;
  ensure(['preflight', 'apply', 'postcheck'].includes(mode), '僅接受 preflight／apply／postcheck');
  const result: Options = { mode: mode as Mode };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    ensure(['--baseline', '--backup-record'].includes(flag) && value && !value.startsWith('--'), '未知或缺值參數');
    const field = flag === '--baseline' ? 'baseline' : 'backupRecord';
    ensure(!result[field] && /^data\/[a-zA-Z0-9_./-]+\.json$/.test(value) &&
      !value.split('/').some(x => !x || x === '.' || x === '..'), '參數須為不重複的安全 data/*.json 路徑');
    result[field] = value;
  }
  ensure(mode !== 'preflight' || (!result.baseline && !result.backupRecord), 'preflight 不接受既有 baseline／backup-record');
  ensure(mode === 'preflight' || result.baseline, 'apply／postcheck 必須指定 --baseline');
  ensure(mode !== 'apply' || result.backupRecord, 'apply 必須指定 --backup-record');
  ensure(mode === 'apply' || !result.backupRecord, 'backup-record 僅供 apply');
  return result;
}
export function redact(message: string): string {
  let result = message.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[資料庫連線已遮蔽]');
  const url = process.env.DATABASE_URL;
  if (url) {
    result = result.split(url).join('[資料庫連線已遮蔽]');
    try { const password = decodeURIComponent(new URL(url).password); if (password) result = result.split(password).join('[已遮蔽]'); } catch { /* 不輸出設定 */ }
  }
  return result;
}
async function readSafe(root: string, relative: string): Promise<Buffer> {
  return readFile(await safeFile(root, relative));
}
async function readJson(root: string, relative: string): Promise<Row> {
  try { return JSON.parse((await readSafe(root, relative)).toString('utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw Error(`JSON 格式錯誤：${relative}`); throw error; }
}
export function decode(file: string): void {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: 'ignore' });
  ensure(!result.error && result.status === 0, 'MP3 完整解碼失敗');
}
async function runtimeFiles(root: string, relative: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    ensure(!entry.isSymbolicLink(), `程式來源不可為 symlink：${name}`);
    if (entry.isDirectory()) files.push(...await runtimeFiles(root, name));
    else if (/\.(ts|mjs)$/.test(name) && !/\.test\./.test(name)) files.push(name);
  }
  return files;
}
export async function loadInputs(root = ROOT, decodeFile = decode): Promise<Inputs> {
  const inputHashes: Record<string, string> = {};
  const pinned = async (relative: string) => {
    const bytes = await readSafe(root, relative); inputHashes[relative] = scenarioHash(bytes); return bytes;
  };
  for (const file of [...await runtimeFiles(root, 'shared/src'),
    'scripts/scenarios/time-prepositions-production.ts', 'scripts/scenarios/run-time-prepositions-production.mjs',
    'scripts/scenarios/docker-import.mjs', 'scripts/scenarios/import-safety.mjs',
    'scripts/check-scenario-package.mjs', 'scripts/import-scenario.ts'].sort()) {
    await pinned(file);
  }
  const canonical = parseWordbankDocument(JSON.parse((await pinned('source/vocabulary-database.json')).toString()));
  const rawDelta = JSON.parse((await pinned(DELTA)).toString());
  const delta = parseWordbankDocument(rawDelta);
  ensure(delta.length === 14, '本批 delta 必須恰為14詞');
  const autumn = delta.find(e => e.guid === AUTUMN.guid);
  ensure(autumn && autumn.id === AUTUMN.id && autumn.word === AUTUMN.word && autumn.definition.trim() &&
    autumn.parts_of_speech.join(',') === 'n' && Object.values(autumn.level).every(v => v === null) &&
    autumn.explains.length === 3 && autumn.examples.length === 3, 'autumn 固定身分／完整內容不符');
  const old = delta.filter(e => e.guid !== AUTUMN.guid);
  ensure(equal(old.map(e => e.word).sort(), [...TARGET_WORDS].sort()), '13舊詞白名單不符');
  for (const entry of old) {
    const raw = rawDelta.entries.find((e: Row) => e.guid === entry.guid);
    ensure(equal(Object.keys(raw).sort(), ['id', 'guid', 'word', 'parts_of_speech', 'explains', 'examples'].sort()) &&
      entry.parts_of_speech.join(',') === 'prep' && entry.explains.length === 1 && entry.examples.length === 1,
    `舊詞只允許本批 partial delta：${entry.word}`);
  }
  const byGuid = new Map(canonical.map(e => [e.guid, e]));
  for (const entry of delta) {
    const expected = byGuid.get(entry.guid);
    ensure(expected && expected.id === entry.id && expected.word === entry.word &&
      equal(mergeWordbankEntry(expected, entry), expected), `delta 與 canonical 不符：${entry.word}`);
  }
  const rawManifest = JSON.parse((await pinned(MANIFEST)).toString());
  const manifest = WordbankAudioManifestSchema.parse(rawManifest);
  const targetGuids = old.map(e => e.guid).sort();
  ensure(manifest.entries.length === 123 && new Set(manifest.entries.map(e => e.entryGuid)).size === 13 &&
    manifest.entries.every(e => targetGuids.includes(e.entryGuid)), 'manifest 必須恰含本批13詞／123段');
  validateWordbankAudioManifest(manifest, canonical);
  const targetAssets = canonical.filter(e => targetGuids.includes(e.guid)).flatMap(e => [e.guid,
    ...e.explains.filter(x => x.en.trim()).map(x => x.guid), ...e.examples.filter(x => x.en.trim()).map(x => x.guid)]);
  ensure(targetAssets.length === 123 && equal(targetAssets.sort(), manifest.entries.map(a => a.assetGuid).sort()),
    'manifest未完整涵蓋canonical的123個目標音訊資產');
  const audioHashes: Record<string, string> = {};
  for (const asset of manifest.entries) {
    const relative = `${path.posix.dirname(MANIFEST)}/${asset.relativePath}`;
    const bytes = await pinned(relative);
    const recorded = rawManifest.entries.find((e: Row) => e.assetGuid === asset.assetGuid)?.sha256;
    ensure(bytes.length === asset.bytes && /^[a-f0-9]{64}$/.test(recorded ?? '') && scenarioHash(bytes) === recorded,
      `來源詞音 bytes／SHA256 不符：${asset.assetGuid}`);
    audioHashes[asset.assetGuid] = recorded;
    decodeFile(await safeFile(root, relative));
  }
  const packages: Package[] = [];
  for (const key of KEYS) {
    const file = `docs/scenarios/packages/${key}-r1/scenario.json`;
    const pkg = JSON.parse((await pinned(file)).toString());
    const checked = await validateScenarioPackage(pkg, { repoRoot: root });
    ensure(checked.valid && checked.publishReady, `套件素材未完整：${key}`);
    const content = contentFromScenarioPackage(pkg);
    const words = key === KEYS[0] ? ['in', 'on', 'at'] : TARGET_WORDS.filter(w => !['on', 'at'].includes(w));
    ensure(content.scenarioKey === key && content.revision === 1 && content.learningMode === 'illustrated-guide' &&
      content.vocabularyMode === 'user-specified' && equal(content.targets.map(t => t.word).sort(), words.sort()) &&
      content.targets.every(t => t.teachingPos === 'prep' && targetGuids.includes(t.entryGuid)), '兩套 key／r1／guide／目標白名單不符');
    for (const ref of [...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)]) {
      ensure(byGuid.get(ref.entryGuid)?.word === ref.word, `故事／目標 GUID 與 canonical 不符：${ref.word}`);
    }
    const image = await pinned(pkg.assets.baseImage.path), audio = await pinned(pkg.assets.storyAudio.path);
    ensure(scenarioHash(image) === pkg.assets.baseImage.sha256 && scenarioHash(audio) === pkg.assets.storyAudio.sha256 &&
      scenarioHash(content.story.textEn) === pkg.assets.storyAudio.textSha256, '套件媒體／故事 SHA256 不符');
    decodeFile(await safeFile(root, pkg.assets.storyAudio.path));
    const info = await sharp(image).metadata();
    ensure(info.format === 'png' && info.width && info.height, '本批底圖必須為完整PNG');
    const prefix = `scenarios/${key}/1`;
    const media: ScenarioMedia = {
      image: { relativePath: `${prefix}/${scenarioHash(image)}.png`, sha256: scenarioHash(image), bytes: image.length,
        contentType: 'image/png', width: info.width, height: info.height },
      audio: { relativePath: `${prefix}/${scenarioHash(audio)}.mp3`, sha256: scenarioHash(audio), bytes: audio.length,
        contentType: 'audio/mpeg', textSha256: scenarioHash(content.story.textEn) },
    };
    validateScenarioMedia(content, media);
    packages.push({ content, media, imagePath: pkg.assets.baseImage.path, audioPath: pkg.assets.storyAudio.path });
  }
  const refs = [...new Set(packages.flatMap(p => [...p.content.targets,
    ...p.content.story.sentences.flatMap(s => s.wordLinks)].map(r => r.entryGuid)))].sort();
  ensure(refs.includes(AUTUMN.guid), '故事必須保留 autumn');
  return { inputHashes: Object.fromEntries(Object.entries(inputHashes).sort(([a], [b]) => a.localeCompare(b))),
    delta, canonical, manifest, audioHashes, packages, targetGuids, refs };
}
export async function assertIdentity(client: Pick<PoolClient, 'query'>): Promise<Identity> {
  const result = await client.query("SELECT current_database() AS database, host(inet_server_addr()) AS address, inet_server_port() AS port, current_schema() AS schema");
  const { schema, ...identity } = result.rows[0];
  ensure(equal(identity, IDENTITY) && schema === 'public', '實際正式DB身分／schema不同，停止');
  return identity as Identity;
}
export function entryFromRow(row: Row): WordbankEntry {
  return parseWordbankDocument({ entries: [{ ...row, id: row.source_id }] })[0];
}
export async function captureState(client: Pick<PoolClient, 'query'>, inputs: Inputs): Promise<State> {
  const identity = await assertIdentity(client);
  const rows = async (sql: string, values?: unknown[]): Promise<Row[]> => plain((await client.query(sql, values)).rows);
  const schema = await rows(`SELECT table_name,column_name,udt_name,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`, [TABLES]);
  ensure(Object.entries(REQUIRED_COLUMNS).every(([table, columns]) => columns.every(column =>
    schema.some(c => c.table_name === table && c.column_name === column))), '必要schema欄位未備妥；不自動migration');
  const migrations = await rows('SELECT name,run_on FROM pgmigrations ORDER BY id');
  ensure(REQUIRED_MIGRATIONS.every(name => migrations.some(m => m.name === name)), '必要migration ledger缺漏');
  const constraints = await rows(`SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,k.conname`, [TABLES]);
  const triggers = await rows(`SELECT c.relname AS table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition,
    pg_get_functiondef(t.tgfoid) AS function_definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname=ANY($1::text[]) ORDER BY c.relname,t.tgname`, [TABLES]);
  ensure(triggers.some(t => t.table_name === 'scenario_revisions' && t.tgname === 'scenario_revision_immutable' &&
    ['O', 'A'].includes(t.tgenabled)), '情境revision不可覆寫trigger未啟用');
  const settings = await rows('SELECT * FROM scenario_tag_settings ORDER BY singleton');
  ensure(settings.length === 1 && typeof settings[0].kind === 'string', '真實情境tag kind缺失');
  const scenarios = await rows('SELECT * FROM learning_scenarios ORDER BY scenario_key');
  const revisions = await rows('SELECT * FROM scenario_revisions ORDER BY scenario_key,revision');
  const links = await rows('SELECT * FROM scenario_word_links ORDER BY scenario_key,revision,entry_guid');
  const scenarioTags = await rows('SELECT * FROM scenario_tags ORDER BY scenario_key,tag_id');
  const tags = await rows('SELECT * FROM tags ORDER BY id');
  const entries = await rows('SELECT * FROM wordbank_entries ORDER BY guid');
  const audio = await rows('SELECT * FROM wordbank_audio ORDER BY asset_guid');
  const affected = new Set(inputs.delta.map(e => e.guid)), audioGuids = new Set(inputs.manifest.entries.map(e => e.assetGuid));
  return { identity, migrations, schema, constraints, triggers, settings, scenarios, revisions, links, scenarioTags, tags,
    wordbank: { ...summary(entries), unrelated: summary(entries.filter(e => !affected.has(e.guid))),
      affectedRows: entries.filter(e => affected.has(e.guid)),
      supportRows: entries.filter(e => inputs.refs.includes(e.guid) && !inputs.targetGuids.includes(e.guid)),
      autumnCollisions: entries.filter(e => e.guid === AUTUMN.guid || e.source_id === AUTUMN.id || e.word.trim().toLowerCase() === AUTUMN.word) },
    audio: { ...summary(audio), unrelated: summary(audio.filter(a => !audioGuids.has(a.asset_guid))),
      targetRows: audio.filter(a => audioGuids.has(a.asset_guid)) } };
}
export async function snapshot(pool: Pick<Pool, 'connect'>, inputs: Inputs): Promise<State> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = await captureState(client, inputs);
    await client.query('COMMIT'); return state;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
async function assertRoots(roots: Roots): Promise<void> {
  for (const root of Object.values(roots)) {
    const info = await lstat(root);
    ensure(info.isDirectory() && !info.isSymbolicLink() && await realpath(root) === root, '媒體volume根目錄不可為symlink');
  }
}
async function fileState(roots: Roots, root: FileState['root'], relativePath: string): Promise<FileState> {
  try {
    const bytes = await readSafe(roots[root], relativePath);
    return { root, relativePath, exists: true, bytes: bytes.length, sha256: scenarioHash(bytes) };
  } catch (error) { if (errorCode(error) === 'ENOENT') return { root, relativePath, exists: false }; throw error; }
}
export async function inspectFiles(inputs: Inputs, state: State, roots = ROOTS): Promise<FileState[]> {
  await assertRoots(roots);
  const files = new Map<string, FileState>();
  const check = async (root: FileState['root'], asset: { relativePath: string; bytes: number; sha256: string }, required: boolean) => {
    const actual = await fileState(roots, root, asset.relativePath);
    ensure(!required || actual.exists, `既有情境媒體缺失：${asset.relativePath}`);
    ensure(!actual.exists || actual.bytes === Number(asset.bytes) && actual.sha256 === asset.sha256,
      `正式媒體異hash／bytes，拒絕覆寫：${asset.relativePath}`);
    files.set(`${root}:${asset.relativePath}`, actual);
  };
  for (const a of inputs.manifest.entries) await check('audioDir', { ...a, sha256: inputs.audioHashes[a.assetGuid] }, false);
  for (const p of inputs.packages) {
    await check('imageDir', p.media.image, false); await check('audioDir', p.media.audio, false);
  }
  for (const revision of state.revisions.filter(r => !isTargetKey(r.scenario_key))) {
    ensure(scenarioRevisionHash(revision.content, revision.media) === revision.content_hash, '既有情境content hash失配');
    await check('imageDir', revision.media.image, true); await check('audioDir', revision.media.audio, true);
  }
  return [...files.values()].sort((a, b) => `${a.root}:${a.relativePath}`.localeCompare(`${b.root}:${b.relativePath}`));
}
export function audioComparable(row: Row): Row {
  return { asset_guid: row.asset_guid, entry_guid: row.entry_guid, kind: row.kind, relative_path: row.relative_path,
    model: row.model, voice: row.voice, instruct: row.instruct, language: row.language, text_hash: row.text_hash,
    duration_seconds: Number(row.duration_seconds), bytes: Number(row.bytes), generated_at: new Date(row.generated_at).toISOString() };
}
export function expectedAudio(inputs: Inputs, asset: WordbankAudioManifest['entries'][number]): Row {
  const p = inputs.manifest.profile;
  return audioComparable({ asset_guid: asset.assetGuid, entry_guid: asset.entryGuid, kind: asset.kind, relative_path: asset.relativePath,
    model: p.model, voice: p.voice, instruct: p.instruct, language: p.lang_code, text_hash: asset.textHash,
    duration_seconds: asset.durationSeconds, bytes: asset.bytes, generated_at: asset.generatedAt });
}
export function expectedEntries(inputs: Inputs, baseline: State): WordbankEntry[] {
  const old = new Map(baseline.wordbank.affectedRows.map(r => [r.guid, entryFromRow(r)]));
  return inputs.delta.map(d => old.has(d.guid) ? mergeWordbankEntry(old.get(d.guid)!, d) : d);
}
export function validateInitial(inputs: Inputs, state: State): Row {
  ensure(!state.scenarios.some(r => isTargetKey(r.scenario_key)) && !state.revisions.some(r => isTargetKey(r.scenario_key)), '新批key已存在；請用原baseline接續');
  ensure(state.wordbank.autumnCollisions.length === 0, 'autumn GUID／id9253／word碰撞');
  ensure(state.wordbank.affectedRows.length === 13 && inputs.targetGuids.every(g => state.wordbank.affectedRows.some(r => r.guid === g)), '正式13舊詞缺失');
  const expected = expectedEntries(inputs, state), byGuid = new Map(expected.map(e => [e.guid, e]));
  for (const d of inputs.delta) {
    const e = byGuid.get(d.guid)!;
    ensure(e.id === d.id && e.word === d.word, `舊詞GUID／id／word不符：${d.word}`);
    for (const kind of ['explains', 'examples'] as const) for (const child of d[kind]) {
      ensure(equal(e[kind].find(x => x.guid === child.guid), child), `既有子項與本批delta衝突：${d.word}`);
    }
  }
  validateWordbankAudioManifest(inputs.manifest, expected);
  for (const row of state.audio.targetRows) {
    const asset = inputs.manifest.entries.find(a => a.assetGuid === row.asset_guid)!;
    ensure(equal(audioComparable(row), expectedAudio(inputs, asset)), `既有音訊metadata衝突：${row.asset_guid}`);
  }
  const formal = new Map([...state.wordbank.affectedRows, ...state.wordbank.supportRows].map(r => [r.guid, entryFromRow(r)]));
  const canonical = new Map(inputs.canonical.map(e => [e.guid, e]));
  const supportDifferences = inputs.refs.filter(g => !inputs.targetGuids.includes(g)).flatMap(g => {
    const current = formal.get(g), source = canonical.get(g)!;
    ensure(current || g === AUTUMN.guid, `非本批可補的故事支援詞缺失：${g}`);
    ensure(!current || current.word === source.word, `故事支援詞GUID／word失配：${g}`);
    const fields = current ? Object.keys(source).filter(f => !equal((current as unknown as Row)[f], (source as unknown as Row)[f])) : ['missing'];
    return fields.length ? [{ guid: g, word: source.word, fields }] : [];
  });
  for (const p of inputs.packages) for (const t of p.content.targets) {
    const e = byGuid.get(t.entryGuid)!;
    ensure(e.level.list === t.list && e.parts_of_speech.includes(t.teachingPos), '正式詞性／分級與guide不符');
  }
  return { deltaEntries: 14, oldEntries: 13, newEntry: AUTUMN, explanationAdditions: 16, exampleAdditions: 16,
    targetAudio: 123, existingMetadata: state.audio.targetRows.length, missingMetadata: 123 - state.audio.targetRows.length,
    supportDifferences, scenarios: inputs.packages.map(p => ({ key: p.content.scenarioKey, revision: 1,
      learningMode: p.content.learningMode, targetCount: p.content.targetCount,
      contentHash: scenarioRevisionHash(p.content, p.media), media: p.media })),
    tagKind: state.settings[0].kind, createsTags: false, publishes: false, deploys: false };
}
export function sealBaseline(value: Omit<Baseline, 'baselineContentHash'>): Baseline {
  return { ...value, baselineContentHash: digest(value) };
}
export async function preflight(pool: Pick<Pool, 'connect'>, inputs: Inputs, roots = ROOTS): Promise<Baseline> {
  const checkedAt = new Date().toISOString();
  const state = await snapshot(pool, inputs), plan = validateInitial(inputs, state);
  const files = await inspectFiles(inputs, state, roots);
  return sealBaseline({ version: 1, batch: 'time-prepositions-r1', checkedAt, inputHashes: inputs.inputHashes, state, files, plan,
    backupRecordContract: { backup: 'data/backups/time-prepositions-production/YYYYMMDD-HHMMSS',
      checkedAt: '備份驗證完成的ISO時間，須晚於baseline.checkedAt', identity: IDENTITY,
      baselineSha256: 'baseline原始檔案SHA256', inputHashesSha256: digest(inputs.inputHashes),
      sha256: { 'db.dump': 'SHA256', 'audio.tgz': 'SHA256', 'images.tgz': 'SHA256' },
      bytes: { 'db.dump': '正整數', 'audio.tgz': '正整數', 'images.tgz': '正整數' },
      dbDumpFullParse: true, gzipIntegrity: true, tarFullListing: true, restoreTest: false } });
}

export function validateBaseline(value: Row, inputs: Inputs): asserts value is Baseline {
  const { baselineContentHash, ...body } = value;
  ensure(value.version === 1 && value.batch === 'time-prepositions-r1' &&
    typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt)) &&
    value.baselineContentHash === digest(body), 'baseline格式／內容hash失配');
  ensure(equal(value.inputHashes, inputs.inputHashes), '本批輸入hash已漂移，請重新preflight／審閱／備份');
  ensure(equal(value.state?.identity, IDENTITY) && Array.isArray(value.files), 'baseline身分／檔案基準不符');
  ensure(equal(validateInitial(inputs, value.state), value.plan), 'baseline計畫不是本批唯讀結果');
}
/** 原始列保留時間欄位；只允許13舊詞 updated_at 隨 shared merge 更新。 */
export function validateProgress(inputs: Inputs, baseline: Baseline, current: State, complete = false): void {
  const before = baseline.state;
  for (const key of ['identity', 'migrations', 'schema', 'constraints', 'triggers', 'settings'] as const) {
    ensure(equal(current[key], before[key]), `正式${key}與baseline不同`);
  }
  for (const key of ['scenarios', 'revisions', 'links', 'scenarioTags'] as const) {
    ensure(equal(current[key].filter(r => !isTargetKey(r.scenario_key)), before[key]), `既有非目標${key}被改動`);
  }
  for (const old of before.tags) ensure(equal(current.tags.find(t => t.id === old.id), old), '既有tag被移除或更動');
  const addedTags = current.tags.filter(t => !before.tags.some(old => old.id === t.id));
  ensure(addedTags.every(t => t.kind === before.settings[0].kind && t.label === '語法情境' &&
    current.scenarioTags.some(st => isTargetKey(st.scenario_key) && st.tag_id === t.id)), '出現非本批授權的新tag');
  // 此driver不建立／取代tags；允許主對話稍後透過真admin API替兩個新場加分類。
  ensure(equal(current.wordbank.unrelated, before.wordbank.unrelated), '本批以外字庫被改動（含其他phonics增量）');
  const expected = expectedEntries(inputs, before), original = new Map(before.wordbank.affectedRows.map(r => [r.guid, r]));
  for (const entry of expected) {
    const row = current.wordbank.affectedRows.find(r => r.guid === entry.guid), old = original.get(entry.guid);
    if (!row) { ensure(!complete && !old && entry.guid === AUTUMN.guid, '必要字庫詞條缺失'); continue; }
    const actual = entryFromRow(row);
    ensure(equal(actual, entry) || !complete && old && equal(row, old), `字庫不是baseline或本批merge結果：${entry.word}`);
    if (old) {
      const { id, ...fields } = entry;
      ensure(equal(row, old) || equal(row, { ...old, ...fields, source_id: id, updated_at: row.updated_at }),
        `舊詞本批以外欄位被更動：${entry.word}`);
    }
  }
  const autumn = current.wordbank.affectedRows.find(r => r.guid === AUTUMN.guid);
  ensure(current.wordbank.count === before.wordbank.count + (autumn ? 1 : 0) &&
    current.wordbank.affectedRows.length === 13 + (autumn ? 1 : 0), '字庫新增數量超出本批');
  ensure(current.wordbank.autumnCollisions.length === (autumn ? 1 : 0) &&
    current.wordbank.autumnCollisions.every(r => equal(entryFromRow(r), expected.find(e => e.guid === AUTUMN.guid))), 'autumn GUID／id／word碰撞');
  ensure(equal(current.audio.unrelated, before.audio.unrelated), '本批以外音訊metadata被改動');
  for (const old of before.audio.targetRows) {
    ensure(equal(current.audio.targetRows.find(a => a.asset_guid === old.asset_guid), old), '既有音訊metadata被改動');
  }
  for (const row of current.audio.targetRows) {
    const asset = inputs.manifest.entries.find(a => a.assetGuid === row.asset_guid);
    ensure(asset && equal(audioComparable(row), expectedAudio(inputs, asset)), '本批音訊metadata不符manifest');
  }
  ensure(current.audio.count === before.audio.count + current.audio.targetRows.length - before.audio.targetRows.length,
    '音訊metadata數量超出本批');
  if (complete) ensure(current.audio.targetRows.length === 123, '123段音訊metadata未完整');
  for (const p of inputs.packages) {
    const key = p.content.scenarioKey, revisions = current.revisions.filter(r => r.scenario_key === key);
    const scenario = current.scenarios.find(r => r.scenario_key === key);
    ensure(revisions.length <= 1, '本批出現額外revision');
    if (!revisions.length) {
      ensure(!complete && !scenario && !current.links.some(r => r.scenario_key === key) &&
        !current.scenarioTags.some(r => r.scenario_key === key), '本批revision缺失／出現不完整情境');
      continue;
    }
    const r = revisions[0];
    ensure(r.revision === 1 && equal(r.content, p.content) && equal(r.media, p.media) &&
      r.content_hash === scenarioRevisionHash(p.content, p.media), '同key／r1已有異content／media hash，拒絕覆寫');
    ensure(scenario && ((r.status === 'draft' && r.published_at === null && scenario.published_revision === null) ||
      (r.status === 'published' && r.published_at !== null && scenario.published_revision === 1)), '本批狀態／發布指標不一致');
    const expectedLinks = new Map([...p.content.targets, ...p.content.story.sentences.flatMap(s => s.wordLinks)].map(r => [r.entryGuid, r.word]));
    const actualLinks = current.links.filter(r => r.scenario_key === key);
    ensure(actualLinks.length === expectedLinks.size && actualLinks.every(r => r.revision === 1 && expectedLinks.get(r.entry_guid) === r.word), '本批情境字庫關聯失配');
  }
}
export async function verifyInputHashes(root: string, hashes: Record<string, string>): Promise<void> {
  for (const [file, expected] of Object.entries(hashes)) {
    ensure(scenarioHash(await readSafe(root, file)) === expected, `本批輸入在操作期間漂移：${file}`);
  }
}
async function verifyPreservedFiles(baseline: Baseline, files: FileState[]): Promise<void> {
  for (const old of baseline.files.filter(f => f.exists)) {
    ensure(equal(files.find(f => f.root === old.root && f.relativePath === old.relativePath), old), 'baseline既有媒體被改動');
  }
}
async function streamHash(root: string, relative: string): Promise<{ sha256: string; bytes: number }> {
  const file = await safeFile(root, relative), h = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) { h.update(chunk); bytes += chunk.length; }
  return { sha256: h.digest('hex'), bytes };
}
/** 備份由主對話建立／完整解析，本driver再驗原始baseline綁定與三個備份實體hash，不做還原。 */
export function validateBackupRecordFields(record: Row, baselineBytes: Buffer, baseline: Baseline): void {
  ensure(equal(record.identity, baseline.state.identity) && record.baselineSha256 === scenarioHash(baselineBytes) &&
    record.inputHashesSha256 === digest(baseline.inputHashes), '備份紀錄未綁定此baseline／輸入／DB');
  ensure(typeof record.checkedAt === 'string' && Date.parse(record.checkedAt) >= Date.parse(baseline.checkedAt) &&
    Date.parse(record.checkedAt) <= Date.now() + 60000, '備份驗證時間無效或早於baseline');
  ensure(record.dbDumpFullParse === true && record.gzipIntegrity === true && record.tarFullListing === true,
    '備份缺少DB dump完整解析／gzip／tar完整驗證');
  ensure(typeof record.backup === 'string' &&
    (/^data\/backups\/time-prepositions-production\/[0-9]{8}-[0-9]{6}$/.test(record.backup) ||
      /^data\/scenario-import-backups\/time-prepositions[a-zA-Z0-9_/-]*$/.test(record.backup)) &&
    !record.backup.split('/').some((x: string) => !x || x === '.' || x === '..'), '備份目錄必須限定本批data/backups/time-prepositions-production/時間戳或原本批備份目錄');
  for (const name of ['db.dump', 'audio.tgz', 'images.tgz']) {
    ensure(/^[a-f0-9]{64}$/.test(record.sha256?.[name] ?? '') && Number.isSafeInteger(record.bytes?.[name]) && record.bytes[name] > 0,
      `備份缺少hash／bytes：${name}`);
  }
}
export async function validateBackupRecord(root: string, file: string, baselineBytes: Buffer, baseline: Baseline): Promise<Row> {
  const record = await readJson(root, file);
  validateBackupRecordFields(record, baselineBytes, baseline);
  for (const name of ['db.dump', 'audio.tgz', 'images.tgz']) {
    const actual = await streamHash(root, `${record.backup}/${name}`);
    ensure(actual.sha256 === record.sha256[name] && actual.bytes === record.bytes[name], `備份實體hash／bytes失配：${name}`);
  }
  return { record: file, sha256: scenarioHash(await readSafe(root, file)), backup: record.backup,
    checkedAt: record.checkedAt, dbDumpFullParse: true, gzipIntegrity: true, tarFullListing: true, restoreTest: record.restoreTest === true };
}
/** shared repo每次BEGIN後、首次寫入前，在同一連線內鎖住本批相關表並重驗baseline。
 * 防止外部寫入落在check與merge之間；鎖只維持各repo交易，不啟停任何服務。
 * 這個最小pool介面只供下方已檢視的 shared withTransaction/importScenarioRevision 使用。
 */
export function guardedPool(pool: Pick<Pool, 'connect'>, inputs: Inputs, baseline: Baseline,
  required: { wordbank?: boolean; audio?: boolean } = {}): DbPool {
  return { connect: async () => {
    const client = await pool.connect();
    return new Proxy(client, { get(target, key) {
      if (key === 'query') return async (...args: any[]) => {
        const result = await (target.query as (...args: any[]) => Promise<any>)(...args);
        if (args[0] === 'BEGIN') {
          await target.query("SET LOCAL lock_timeout = '5s'");
          await target.query("SET LOCAL statement_timeout = '120s'");
          await assertIdentity(target);
          await target.query(`LOCK TABLE ${TABLES.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
          const state = await captureState(target, inputs);
          validateProgress(inputs, baseline, state);
          if (required.wordbank) ensureWordsComplete(inputs, baseline, state);
          if (required.audio) ensure(state.audio.targetRows.length === 123, '情境匯入前123段音訊metadata未完整');
        }
        return result;
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } } as unknown as DbPool;
}
export async function insertMissingAudio(pool: DbPool, inputs: Inputs): Promise<{ inserted: number; reused: number }> {
  return withTransaction(pool, async tx => {
    const entries = (await tx.query('SELECT * FROM wordbank_entries WHERE guid=ANY($1::uuid[]) FOR SHARE',
      [inputs.targetGuids])).rows.map(entryFromRow);
    validateWordbankAudioManifest(inputs.manifest, entries);
    let inserted = 0;
    for (const asset of inputs.manifest.entries) {
      const expected = expectedAudio(inputs, asset);
      const existing = (await tx.query('SELECT * FROM wordbank_audio WHERE asset_guid=$1', [asset.assetGuid])).rows[0];
      if (existing) { ensure(equal(audioComparable(existing), expected), '既有音訊metadata衝突，拒絕UPDATE'); continue; }
      const fields = Object.keys(expected), values = Object.values(expected);
      const result = await tx.query(`INSERT INTO wordbank_audio (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})
        ON CONFLICT (asset_guid) DO NOTHING RETURNING asset_guid`, values);
      ensure(result.rows.length === 1, '音訊metadata競爭，停止並readback後接續'); inserted++;
    }
    return { inserted, reused: inputs.manifest.entries.length - inserted };
  });
}
export async function postcheck(pool: Pick<Pool, 'connect'>, inputs: Inputs, baseline: Baseline, roots = ROOTS): Promise<Row> {
  validateBaseline(baseline, inputs);
  const state = await snapshot(pool, inputs);
  validateProgress(inputs, baseline, state, true);
  const files = await inspectFiles(inputs, state, roots);
  await verifyPreservedFiles(baseline, files);
  const plannedPaths = [
    ...inputs.manifest.entries.map(a => ['audioDir', a.relativePath]),
    ...inputs.packages.flatMap(p => [['imageDir', p.media.image.relativePath], ['audioDir', p.media.audio.relativePath]]),
  ];
  ensure(plannedPaths.every(([root, relative]) => files.some(f => f.root === root && f.relativePath === relative && f.exists)), '本批123詞音／2圖／2旁白未完整入volume');
  for (const p of inputs.packages) await verifyScenarioAssets(p.content, p.media, roots);
  return { batch: baseline.batch, checkedAt: new Date().toISOString(), identity: state.identity, passed: true,
    baselineContentHash: baseline.baselineContentHash, inputHashesSha256: digest(inputs.inputHashes),
    oldScenesUnchanged: true, oldTagsUnchanged: true, unrelatedWordbankUnchanged: true, originalAudioMetadataUnchanged: true,
    wordbank: { count: state.wordbank.count, sha256: state.wordbank.sha256, deltaVerified: 14, unrelated: state.wordbank.unrelated },
    audio: { count: state.audio.count, sha256: state.audio.sha256, verifiedBatchAssets: 123, unrelated: state.audio.unrelated },
    scenarios: inputs.packages.map(p => {
      const r = state.revisions.find(r => r.scenario_key === p.content.scenarioKey)!;
      return { scenarioKey: r.scenario_key, revision: r.revision, status: r.status, contentHash: r.content_hash,
        publishedRevision: state.scenarios.find(s => s.scenario_key === r.scenario_key)!.published_revision,
        tags: state.scenarioTags.filter(t => t.scenario_key === r.scenario_key) };
    }), filesVerified: plannedPaths.length, publicationPerformed: false, taxonomyWritesPerformed: false,
    deploymentPerformed: false, generationPerformed: false, humanListeningVerified: false, mobileVerified: false };
}
function ensureWordsComplete(inputs: Inputs, baseline: Baseline, state: State): void {
  ensure(expectedEntries(inputs, baseline.state).every(e => {
    const row = state.wordbank.affectedRows.find(r => r.guid === e.guid); return row && equal(entryFromRow(row), e);
  }), '14筆字庫merge readback不符，停止');
}
async function apply(pool: Pick<Pool, 'connect'>, inputs: Inputs, baseline: Baseline, roots = ROOTS, root = ROOT): Promise<Row> {
  const log = (message: string) => process.stderr.write(`${message}\n`);
  validateBaseline(baseline, inputs);
  await verifyInputHashes(root, baseline.inputHashes);
  const before = await snapshot(pool, inputs);
  validateProgress(inputs, baseline, before);
  const files = await inspectFiles(inputs, before, roots);
  await verifyPreservedFiles(baseline, files);
  const guarded = guardedPool(pool, inputs, baseline);
  const expected = expectedEntries(inputs, baseline.state);
  let wordbank: Row = { skipped: true, reason: '14詞已為相同merge結果' };
  if (!expected.every(e => {
    const row = before.wordbank.affectedRows.find(r => r.guid === e.guid); return row && equal(entryFromRow(row), e);
  })) {
    log('套用限定14筆字庫delta');
    wordbank = await importWordbankEntries(guarded, inputs.delta);
  }
  const merged = await snapshot(pool, inputs);
  validateProgress(inputs, baseline, merged);
  ensureWordsComplete(inputs, baseline, merged);
  validateWordbankAudioManifest(inputs.manifest, merged.wordbank.affectedRows.map(entryFromRow));
  log('複製／重用123段詞音；同路徑異hash拒絕');
  let copied = 0;
  for (const asset of inputs.manifest.entries) {
    const source = `${path.posix.dirname(MANIFEST)}/${asset.relativePath}`, bytes = await readSafe(root, source);
    ensure(scenarioHash(bytes) === inputs.audioHashes[asset.assetGuid], '詞音來源在複製前漂移');
    if (await exclusiveCopy(roots.audioDir, asset.relativePath, bytes)) copied++;
  }
  // 只INSERT缺失metadata；對有效原有列完全不發UPDATE。
  log('只補缺失音訊metadata');
  const metadata = await insertMissingAudio(guardedPool(pool, inputs, baseline, { wordbank: true }), inputs);
  const imports: Row[] = [];
  for (const p of inputs.packages) {
    await verifyInputHashes(root, baseline.inputHashes);
    log(`匯入／重用 ${p.content.scenarioKey} r1`);
    const result = await importScenarioRevision(guardedPool(pool, inputs, baseline, { wordbank: true, audio: true }),
      p.content, p.media, roots, async () => {
      const owned: Array<() => Promise<void>> = [];
      const cleanup = async () => { for (const remove of owned.reverse()) await remove(); };
      try {
        for (const [directory, asset, source] of [[roots.imageDir, p.media.image, p.imagePath],
          [roots.audioDir, p.media.audio, p.audioPath]] as const) {
          const bytes = await readSafe(root, source);
          const remove = await copyScenarioAsset(directory, asset, bytes); if (remove) owned.push(remove);
        }
        return cleanup;
      } catch (error) { await cleanup(); throw error; }
    });
    imports.push(result);
  }
  await verifyInputHashes(root, baseline.inputHashes);
  const readback = await postcheck(pool, inputs, baseline, roots);
  return { ...readback, stage: 'draft-import-complete', wordbankImport: wordbank,
    audioCopy: { copied, reused: 123 - copied }, audioMetadata: metadata, imports };
}

export async function run(options: Options): Promise<void> {
  const inputs = await loadInputs();
  let baseline: Baseline | undefined, backup: Row | undefined;
  if (options.baseline) {
    const bytes = await readSafe(ROOT, options.baseline);
    const parsed = JSON.parse(bytes.toString()); validateBaseline(parsed, inputs); baseline = parsed;
    if (options.mode === 'apply') backup = await validateBackupRecord(ROOT, options.backupRecord!, bytes, baseline!);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  ensure(databaseUrl, '須由宿主明確傳入DATABASE_URL；不讀.env');
  const url = new URL(databaseUrl);
  ensure(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === 'db' &&
    (url.port || '5432') === '5432' && url.pathname === '/english_learning' && !url.search && !url.hash, 'DATABASE_URL目標不符');
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10000,
    application_name: 'time-prepositions-production' });
  pool.on('error', () => process.stderr.write('正式DB閒置連線發生錯誤；未輸出連線設定\n'));
  try {
    const result = options.mode === 'preflight' ? await preflight(pool, inputs)
      : options.mode === 'apply' ? { ...await apply(pool, inputs, baseline!), backup }
        : await postcheck(pool, inputs, baseline!);
    console.log(JSON.stringify(result, null, 2));
  } finally { await pool.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => run(parseOptions(process.argv.slice(2)))).catch(error => {
    process.stderr.write(`${redact(error instanceof Error ? error.message : String(error))}\n`); process.exitCode = 1;
  });
}
