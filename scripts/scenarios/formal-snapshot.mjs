// 僅由單次容器讀取正式 DB／audio，stdout 為無連線憑證的 JSON。
import {createPool} from '@el/shared';
import {lstat} from 'node:fs/promises';
import {safeFile} from './import-safety.mjs';

const pool = createPool(process.env.DATABASE_URL);
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query('SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port')).rows[0];
    if (identity.database !== 'english_learning' || identity.address !== '172.18.0.4/32' || identity.port !== 5432) throw Error('正式 DB 身分與已確認目標不同');
    const migrations = (await client.query('SELECT name,run_on FROM pgmigrations ORDER BY id')).rows;
    const entries = (await client.query("SELECT guid,source_id AS id,word,parts_of_speech,definition,explains,examples,level,category,scenario FROM wordbank_entries WHERE level->>'list' IN ('basic','advance') ORDER BY source_id")).rows;
    const audio = (await client.query('SELECT * FROM wordbank_audio')).rows;
    for (const asset of audio) {
      asset.fileExists = false; asset.bytesValid = false;
      if (!/^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(asset.relative_path)) continue;
      try {
        const file = await safeFile('/data/audio', asset.relative_path);
        const info = await lstat(file);
        asset.fileExists = true; asset.bytesValid = info.size === Number(asset.bytes);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    const revisions = (await client.query('SELECT scenario_key,revision,status,content_hash,created_at,published_at FROM scenario_revisions ORDER BY scenario_key,revision')).rows;
    const pointers = (await client.query('SELECT scenario_key,published_revision FROM learning_scenarios ORDER BY scenario_key')).rows;
    await client.query('COMMIT');
    console.log(JSON.stringify({checkedAt: new Date().toISOString(), identity, migrations, entries, audio, revisions, pointers}));
  } finally { client.release(); }
} catch (e) { console.error(String(e.message).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, '[已遮蔽]')); process.exitCode = 1; }
finally { await pool.end(); }
