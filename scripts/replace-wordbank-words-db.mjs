// 字庫音訊替換的 DB 邊界：只更新選定資產，不搬移或刪除既有錄音。
import { createHash } from 'node:crypto';
import { normalizeAudioKinds } from './replace-wordbank-words-core.mjs';

const fields = ['assetGuid', 'entryGuid', 'kind', 'relativePath', 'model', 'voice', 'instruct',
  'language', 'textHash', 'durationSeconds', 'bytes', 'generatedAt'];
export function audioMetadata(row) {
  if (!row) return null;
  return { assetGuid: row.asset_guid, entryGuid: row.entry_guid, kind: row.kind,
    relativePath: row.relative_path, model: row.model, voice: row.voice, instruct: row.instruct,
    language: row.language, textHash: row.text_hash, durationSeconds: Number(row.duration_seconds),
    bytes: Number(row.bytes), generatedAt: new Date(row.generated_at).toISOString() };
}
export function sameAudioMetadata(a, b) {
  if (!a || !b) return a === b;
  return fields.every(key => key === 'generatedAt'
    ? new Date(a[key]).toISOString() === new Date(b[key]).toISOString()
    : a[key] === b[key]);
}
export async function databaseIdentity(pool) {
  const result = await pool.query(`SELECT current_database() AS database,
    inet_server_addr()::text AS address, inet_server_port() AS port`);
  return result.rows[0];
}
export function assertDatabaseIdentity(actual, expected) {
  if (['database', 'address', 'port'].some(key => actual[key] !== expected[key]))
    throw new Error('資料庫目標與 plan 不同，停止替換；請核對連線與原批次清單');
}
const validGuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function sourceText(entry, job) {
  if (!entry) throw new Error(`字庫已刪除或文字變更：${job.text}`);
  if (job.kind === 'word') {
    if (job.assetGuid !== job.entryGuid || typeof entry.word !== 'string' || entry.word.trim() !== job.text)
      throw new Error(`字庫已刪除或文字變更：${job.text}`);
  } else {
    const items = entry[job.kind === 'example' ? 'examples' : 'explains'];
    const matches = Array.isArray(items) ? items.filter(item => item?.guid === job.assetGuid) : [];
    if (job.assetGuid === job.entryGuid || matches.length !== 1 || typeof matches[0].en !== 'string' || matches[0].en.trim() !== job.text)
      throw new Error(`字庫例句／解釋 GUID 或文字變更：${job.text}`);
  }
}
export async function snapshotWordbank(pool, kinds = ['word']) {
  const selected = normalizeAudioKinds(kinds);
  const legacy = selected.length === 1 && selected[0] === 'word';
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const target = await databaseIdentity(client);
    const result = await client.query(`SELECT e.guid, e.word, ${legacy ? '' : 'e.examples, e.explains,'} row_to_json(a) AS audio
      FROM wordbank_entries e LEFT JOIN wordbank_audio a ON a.asset_guid = e.guid
      ORDER BY e.source_id, e.guid`);
    const allAudio = legacy ? [] : (await client.query('SELECT * FROM wordbank_audio ORDER BY asset_guid')).rows;
    const audioByGuid = new Map(allAudio.map(row => [row.asset_guid, row]));
    const entryGuids = new Set(result.rows.map(row => row.guid));
    const seen = new Set();
    const entries = result.rows.map(row => {
      if (selected.includes('word') && row.audio && (row.audio.kind !== 'word' || row.audio.entry_guid !== row.guid))
        throw new Error(`整詞 GUID 對應異常：${row.guid}`);
      const entry = { guid: row.guid, word: row.word, previous: selected.includes('word') ? audioMetadata(row.audio) : null };
      if (!legacy) {
        entry.assets = [];
        for (const kind of selected.filter(kind => kind !== 'word')) {
          const items = row[kind === 'example' ? 'examples' : 'explains'];
          if (!Array.isArray(items)) throw new Error(`字庫 ${kind} 資料格式錯誤：${row.guid}`);
          for (const item of items) {
            if (!item || !validGuid.test(item.guid) || typeof item.en !== 'string' || seen.has(item.guid) || entryGuids.has(item.guid))
              throw new Error(`字庫例句／解釋 GUID 無效、重複或與詞條衝突：${row.guid}`);
            seen.add(item.guid);
            if (!item.en.trim()) continue;
            const previous = audioByGuid.get(item.guid);
            if (previous && (previous.entry_guid !== row.guid || previous.kind !== kind))
              throw new Error(`音訊 GUID 對應的單字或種類異常：${item.guid}`);
            entry.assets.push({ assetGuid: item.guid, kind, text: item.en.trim(), previous: audioMetadata(previous) });
          }
        }
      }
      return entry;
    });
    await client.query('COMMIT');
    return { target, entries };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
export function wordReplacementStore(pool) {
  return {
    async verifySource(job) {
      const entry = await pool.query('SELECT word, examples, explains FROM wordbank_entries WHERE guid=$1', [job.entryGuid]);
      sourceText(entry.rows[0], job);
    },
    async readCurrent(job) {
      const result = await pool.query('SELECT * FROM wordbank_audio WHERE asset_guid = $1', [job.assetGuid]);
      return audioMetadata(result.rows[0]);
    },
    async applyOne(job, asset, previous) {
      const textHash = createHash('sha256').update(job.text.trim()).digest('hex');
      if (!['word', 'example', 'explanation'].includes(job.kind) ||
        (job.kind === 'word' ? job.assetGuid !== job.entryGuid : job.assetGuid === job.entryGuid) || asset.kind !== job.kind ||
        fields.some(key => asset[key] === undefined) || asset.assetGuid !== job.assetGuid ||
        asset.entryGuid !== job.entryGuid || asset.relativePath !== job.relativePath ||
        asset.textHash !== textHash || !Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0 ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0)
        throw new Error('替換僅接受與清單文字、GUID、種類、路徑一致的字庫音訊');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const entry = await client.query('SELECT word, examples, explains FROM wordbank_entries WHERE guid = $1 FOR UPDATE', [job.entryGuid]);
        sourceText(entry.rows[0], job);
        const existing = await client.query('SELECT * FROM wordbank_audio WHERE asset_guid = $1 FOR UPDATE', [job.assetGuid]);
        const current = audioMetadata(existing.rows[0]);
        if (current && (current.kind !== job.kind || current.entryGuid !== job.entryGuid))
          throw new Error(`音訊 GUID 已被其他單字或種類占用：${job.assetGuid}`);
        if (sameAudioMetadata(current, asset)) { await client.query('COMMIT'); return; }
        if (!sameAudioMetadata(current, previous)) throw new Error(`錄音已被其他操作更新：${job.text}；保留現況，未覆蓋`);
        const values = [asset.assetGuid, asset.entryGuid, asset.kind, asset.relativePath, asset.model, asset.voice,
          asset.instruct, asset.language, asset.textHash, asset.durationSeconds, asset.bytes, asset.generatedAt];
        const result = current
          ? await client.query(`UPDATE wordbank_audio SET entry_guid=$2, kind=$3, relative_path=$4,
              model=$5, voice=$6, instruct=$7, language=$8, text_hash=$9, duration_seconds=$10,
              bytes=$11, generated_at=$12 WHERE asset_guid=$1 AND kind=$3`, values)
          : await client.query(`INSERT INTO wordbank_audio
              (asset_guid, entry_guid, kind, relative_path, model, voice, instruct, language,
               text_hash, duration_seconds, bytes, generated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`, values);
        if (result.rowCount !== 1) throw new Error(`錄音同時變更，停止替換：${job.text}`);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
}
