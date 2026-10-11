// 容器內入口；正式寫入均另列 task，既有 CLI 負責 transaction／draft import。
import path from 'node:path';
import {readFile, realpath, lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createPool, ScenarioContentSchema, WordbankAudioManifestSchema, WordbankEntrySchema,
  validateWordbankAudioManifest, scenarioCanonicalJson, scenarioRevisionHash, verifyScenarioAssets,
  wordbankTextHash} from '@el/shared';
import {validateScenarioPackage} from '../check-scenario-package.mjs';
import {parseOptions, safeFile, hash, assertManifestScope, assertRevisionBaseline, exclusiveCopy} from './import-safety.mjs';

const ROOT = '/app';
const roots = {imageDir: '/data/images', audioDir: '/data/audio'};
function decode(file) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], {encoding: 'utf8'});
  if (result.error || result.status !== 0) throw Error('MP3 完整解碼失敗');
}
function cli(file, args) {
  // 原有 CLI 輸出只保留必要結果，連線字串如意外出現在錯誤中會遮蔽。
  const result = spawnSync('node', ['--import', 'tsx', file, ...args], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  for (const value of [result.stdout, result.stderr]) if (value) process.stdout.write(value.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[資料庫連線已遮蔽]'));
  if (result.error || result.status !== 0) throw Error('既有匯入 CLI 未成功；先核對結果再重跑');
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const pkg = JSON.parse(await readFile(await safeFile(ROOT, options.package), 'utf8'));
  const baseline = options.baseline ? JSON.parse(await readFile(await safeFile(ROOT, options.baseline), 'utf8')) : null;
  const check = await validateScenarioPackage(pkg, {repoRoot: ROOT});
  if (!check.valid || !check.publishReady) throw Error('套件未通過完整離線預檢，停止此場操作');
  const content = ScenarioContentSchema.parse(Object.fromEntries(['schemaVersion', 'scenarioKey', 'revision', 'titleZh', 'vocabularyFilter', 'targetCount', 'targets', 'story'].map(k => [k, pkg[k]])));
  let manifest;
  let manifestRoot;
  if (options.manifest) {
    const file = await safeFile(ROOT, options.manifest);
    manifestRoot = path.dirname(file);
    manifest = WordbankAudioManifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    assertManifestScope(manifest, content);
  }
  for (const root of Object.values(roots)) {
    if ((await realpath(root)) !== root || !(await lstat(root)).isDirectory()) throw Error('媒體 root 並非已確認的實際 volume 根目錄');
  }
  decode(await safeFile(ROOT, pkg.assets.storyAudio.path));
  const pool = createPool(process.env.DATABASE_URL);
  let identity;
  let entries;
  let audios;
  let revisions;
  let pointer;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      identity = (await client.query('SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port')).rows[0];
      if (identity.database !== 'english_learning' || identity.address !== '172.18.0.4/32' || identity.port !== 5432) throw Error('實際 DB 身分與授權查核結果不同，停止操作');
      const tables = (await client.query("SELECT to_regclass('learning_scenarios') AS scenarios, to_regclass('scenario_revisions') AS revisions, to_regclass('scenario_word_links') AS links")).rows[0];
      if (!tables.scenarios || !tables.revisions || !tables.links) throw Error('情境 migration 未備妥；此工具不執行 migration');
      const migrations = (await client.query('SELECT name FROM pgmigrations ORDER BY id')).rows;
      if (!migrations.some(m => m.name === '1791504000000_scenarios')) throw Error('情境 migration ledger 缺少必要紀錄；先唯讀查明，不自動套用');
      const refs = [...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)];
      entries = (await client.query('SELECT guid, source_id AS id, word, parts_of_speech, definition, explains, examples, level, category, scenario FROM wordbank_entries WHERE guid=ANY($1::uuid[])', [[...new Set(refs.map(r => r.entryGuid))]])).rows.map(r => WordbankEntrySchema.parse(r));
      const byGuid = new Map(entries.map(e => [e.guid, e]));
      for (const ref of refs) {
        const entry = byGuid.get(ref.entryGuid);
        if (!entry || entry.word !== ref.word || !content.vocabularyFilter.levels.includes(entry.level.list)) throw Error(`正式字庫 GUID／單字／分級不符：${ref.word}`);
      }
      for (const target of content.targets) {
        const entry = byGuid.get(target.entryGuid);
        if (entry.level.list !== target.list || !entry.parts_of_speech.includes(target.teachingPos)) throw Error(`正式目標字詞詞性／級別不符：${target.word}`);
      }
      if (manifest) validateWordbankAudioManifest(manifest, entries);
      audios = (await client.query('SELECT * FROM wordbank_audio WHERE entry_guid=ANY($1::uuid[])', [content.targets.map(t => t.entryGuid)])).rows;
      revisions = (await client.query('SELECT * FROM scenario_revisions WHERE scenario_key=$1 ORDER BY revision', [content.scenarioKey])).rows;
      pointer = (await client.query('SELECT published_revision FROM learning_scenarios WHERE scenario_key=$1', [content.scenarioKey])).rows[0]?.published_revision ?? null;
      assertRevisionBaseline(content, revisions, pointer, baseline);
      await client.query('COMMIT');
    } finally { client.release(); }

    // 所有來源先核對，再進入任何複製或 metadata 寫入。
    const prepared = [];
    for (const asset of manifest?.entries ?? []) {
      const source = await safeFile(manifestRoot, asset.relativePath);
      const bytes = await readFile(source);
      if (bytes.length !== asset.bytes) throw Error(`來源音檔大小不符：${asset.assetGuid}`);
      decode(source);
      let destination;
      try { destination = await safeFile(roots.audioDir, asset.relativePath); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (destination) {
        const existing = await readFile(destination);
        if (existing.length !== bytes.length || hash(existing) !== hash(bytes)) throw Error(`既有音檔與本場來源不同，拒絕覆寫：${asset.assetGuid}`);
      }
      prepared.push({asset, bytes, destination, sha256: hash(bytes)});
    }
    const byGuid = new Map(entries.map(e => [e.guid, e]));
    const audioMap = new Map(audios.map(a => [a.asset_guid, a]));
    const assets = [];
    for (const target of content.targets) {
      const entry = byGuid.get(target.entryGuid);
      const required = [{guid: entry.guid, kind: 'word', en: entry.word},
        ...entry.explains.filter(x => x.en.trim()).map(x => ({...x, kind: 'explanation'})),
        ...entry.examples.filter(x => x.en.trim()).map(x => ({...x, kind: 'example'}))];
      for (const asset of required) {
        const metadata = audioMap.get(asset.guid);
        const metadataValid = !!metadata && metadata.entry_guid === entry.guid && metadata.kind === asset.kind && metadata.text_hash === wordbankTextHash(asset.en);
        let valid = false;
        let fileHash;
        if (metadataValid) {
          try {
            const file = await safeFile(roots.audioDir, metadata.relative_path);
            const bytes = await readFile(file);
            if (bytes.length === Number(metadata.bytes)) { decode(file); valid = true; fileHash = hash(bytes); }
          } catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        assets.push({word: target.word, assetGuid: asset.guid, kind: asset.kind, valid, sha256: fileHash, planned: prepared.some(p => p.asset.assetGuid === asset.guid)});
      }
    }
    const missing = assets.filter(a => !a.valid);
    if (missing.some(a => !a.planned) || (['scenario', 'postcheck'].includes(options.task) && missing.length)) throw Error(`目標字庫仍缺有效錄音 ${missing.length} 段；先完成本場 copy-audio／audio-metadata`);
    if (options.task === 'check') {
      cli('scripts/import-scenario.ts', ['--package', options.package, '--check-database']);
      console.log(JSON.stringify({task: options.task, scenarioKey: content.scenarioKey, revision: content.revision, identity, revisions: revisions.map(r => ({revision: r.revision, status: r.status, contentHash: r.content_hash})), publishedRevision: pointer, assets, manifestCount: prepared.length}, null, 2));
    } else if (options.task === 'copy-audio') {
      let copied = 0;
      for (const p of prepared) if (await exclusiveCopy(roots.audioDir, p.asset.relativePath, p.bytes)) copied++;
      console.log(JSON.stringify({task: options.task, scenarioKey: content.scenarioKey, copied, reused: prepared.length - copied, total: prepared.length}));
    } else if (options.task === 'audio-metadata') {
      if (prepared.some(p => !p.destination)) throw Error('manifest 音檔未全部複製至正式 volume');
      cli('scripts/import-vocabulary-audio.ts', [options.manifest]);
    } else if (options.task === 'scenario') {
      cli('scripts/import-scenario.ts', ['--package', options.package, '--apply', '--confirm-database', 'db:5432/english_learning', '--confirm-server', '172.18.0.4/32:5432/english_learning', '--image-dir', roots.imageDir, '--audio-dir', roots.audioDir]);
    } else {
      const revision = revisions.find(r => r.revision === content.revision);
      if (!revision || revision.status !== 'draft' || revision.published_at !== null || scenarioCanonicalJson(revision.content) !== scenarioCanonicalJson(content) || revision.content_hash !== scenarioRevisionHash(content, revision.media)) throw Error('指定 draft revision 內容／hash／狀態不符');
      await verifyScenarioAssets(content, revision.media, roots);
      if (revision.media.image.sha256 !== pkg.assets.baseImage.sha256 || revision.media.audio.sha256 !== pkg.assets.storyAudio.sha256) throw Error('版本媒體與原套件 hash 不符');
      decode(await safeFile(roots.audioDir, revision.media.audio.relativePath));
      const actual = (await pool.query('SELECT entry_guid, word FROM scenario_word_links WHERE scenario_key=$1 AND revision=$2', [content.scenarioKey, content.revision])).rows;
      const expected = new Map([...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)].map(r => [r.entryGuid, r.word]));
      if (actual.length !== expected.size || actual.some(r => expected.get(r.entry_guid) !== r.word)) throw Error('情境字庫關聯不完整或錯配');
      console.log(JSON.stringify({task: options.task, scenarioKey: content.scenarioKey, revision: content.revision, status: revision.status, publishedRevision: pointer, contentHash: revision.content_hash, media: revision.media, links: actual.length, targetAudioCount: assets.length, missing: 0}, null, 2));
    }
  } finally { await pool.end(); }
}
main().catch(e => { console.error(String(e.message).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[資料庫連線已遮蔽]')); process.exitCode = 1; });
