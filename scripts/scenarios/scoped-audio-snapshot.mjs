// 指定目標字庫的唯讀音檔盤點；由既有 Docker 適配器呼叫，絕不生成或寫正式資料。
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { createPool } from '@el/shared';
import { planAudio, validateMp3 } from '../generate-wordbank-audio.mjs';
import { safeFile, hash } from './import-safety.mjs';

const [requestFile, ...rest] = process.argv.slice(2);
if (!requestFile || rest.length || !/^data\/scenario-preparation\/[a-zA-Z0-9_./-]+\.json$/.test(requestFile))
  throw Error('須指定單一安全 data/scenario-preparation JSON 請求檔');
const request = JSON.parse(await readFile(await safeFile('/app', requestFile), 'utf8'));
const source = JSON.parse(await readFile('source/vocabulary-database.json', 'utf8'));
const byGuid = new Map(source.entries.map(entry => [entry.guid, entry]));
if (!/^[a-z][a-z0-9-]{0,79}$/.test(request.scenarioKey ?? '') || !Array.isArray(request.targets) ||
    !request.targets.length || request.targets.length > 29 ||
    new Set(request.targets.map(target => target.entryGuid)).size !== request.targets.length)
  throw Error('情境 key／目標數量／GUID 不符');
for (const target of request.targets) {
  const entry = byGuid.get(target.entryGuid);
  if (!entry || entry.word !== target.word || !entry.parts_of_speech.includes(target.teachingPos))
    throw Error(`目標與來源字庫不符：${target.word}`);
}
const pool = createPool(process.env.DATABASE_URL);
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query('SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port')).rows[0];
    if (identity.database !== 'english_learning' || identity.address !== '172.18.0.4/32' || identity.port !== 5432)
      throw Error('正式 DB 身分與已確認目標不同');
    const guids = request.targets.map(target => target.entryGuid);
    const entries = (await client.query('SELECT guid,source_id AS id,word,parts_of_speech,definition,explains,examples,level,category,scenario FROM wordbank_entries WHERE guid=ANY($1::uuid[]) ORDER BY source_id', [guids])).rows;
    const metadata = (await client.query('SELECT * FROM wordbank_audio WHERE entry_guid=ANY($1::uuid[]) ORDER BY asset_guid', [guids])).rows;
    const missingEntryGuids = guids.filter(guid => !entries.some(entry => entry.guid === guid));
    const sourceDifferences = [];
    for (const entry of entries) {
      const expected = byGuid.get(entry.guid);
      for (const field of ['id', 'word', 'parts_of_speech', 'definition', 'explains', 'examples', 'level', 'category', 'scenario']) {
        if (!isDeepStrictEqual(entry[field], expected[field])) sourceDifferences.push({entryGuid: entry.guid, word: entry.word, field});
      }
    }
    const jobs = planAudio({entries}, 'all');
    const byAsset = new Map(metadata.map(asset => [asset.asset_guid, asset]));
    const assets = [];
    const missingJobs = [];
    for (const job of jobs) {
      const asset = byAsset.get(job.assetGuid);
      const result = {assetGuid: job.assetGuid, entryGuid: job.entryGuid, kind: job.kind, textHash: job.textHash,
        valid: false, metadataMatches: false, fileExists: false, bytesValid: false, fullyDecoded: false};
      if (!asset) result.reason = 'missing-metadata';
      else if (asset.entry_guid !== job.entryGuid || asset.kind !== job.kind || asset.text_hash !== job.textHash)
        result.reason = 'metadata-content-mismatch';
      else {
        result.metadataMatches = true;
        result.relativePath = asset.relative_path;
        try {
          if (!/^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(asset.relative_path)) throw Error('不安全的音檔路徑');
          const file = await safeFile('/data/audio', asset.relative_path);
          const bytes = await readFile(file);
          result.fileExists = true;
          result.bytes = bytes.length;
          result.sha256 = hash(bytes);
          result.bytesValid = bytes.length === Number(asset.bytes);
          if (!result.bytesValid) result.reason = 'metadata-bytes-mismatch';
          else {
            const decoded = await validateMp3(file);
            result.fullyDecoded = true;
            result.durationSeconds = decoded.durationSeconds;
            result.valid = true;
          }
        } catch (error) {
          result.reason = error.code === 'ENOENT' ? 'missing-file' : 'file-validation-failed';
          result.error = error.message;
        }
      }
      assets.push(result);
      if (!result.valid) missingJobs.push({...job, missingReason: result.reason});
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({checkedAt: new Date().toISOString(), scenarioKey: request.scenarioKey,
      scope: 'existing-targets-only', identity, requestedTargetCount: request.targets.length, entries,
      missingEntryGuids, sourceDifferences, metadata, assets, plannedAssetCount: jobs.length,
      validAssetCount: assets.filter(asset => asset.valid).length, missingAssetCount: missingJobs.length,
      missingJobs, generationPerformed: false, databaseWritesPerformed: false}, null, 2));
  } finally { client.release(); }
} catch (error) {
  console.error(String(error.message).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[已遮蔽]'));
  process.exitCode = 1;
} finally { await pool.end(); }
