// 真實 CLI＋隔離 PostgreSQL schema＋loopback 假 Gradio；不使用 LAN／正式 DB。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPool } from '../shared/src/db.ts';
import { resolveTestDatabaseUrl } from '../shared/src/testing.ts';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const model = 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice';
const sha256 = text => createHash('sha256').update(text).digest('hex');

function sineWav() {
  const sampleRate = 24000, samples = 4800;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 2000), 44 + i * 2);
  return bytes;
}

async function runCliFixture(sentences = false) {
  // 先經共用保護函式驗證 _test，再建立只供本測試使用的 schema。
  const testUrl = resolveTestDatabaseUrl();
  const admin = createPool(testUrl);
  const schema = `word_replace_e2e_${randomUUID().replaceAll('-', '')}`;
  const isolatedUrl = new URL(testUrl);
  isolatedUrl.searchParams.set('options', `-csearch_path=${schema}`);
  const pool = createPool(isolatedUrl.href);
  const temporary = await mkdtemp(join(tmpdir(), 'word-replacement-cli-'));
  const workDir = join(temporary, 'batch'), audioDir = join(temporary, 'audio');
  const posts = [], unexpectedRequests = [];
  const wav = sineWav();
  let origin;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, origin);
    const json = value => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    try {
      if (request.method === 'GET' && url.pathname === '/config') {
        json({ components: [
          { type: 'markdown', props: { value: `Checkpoint: \`${model}\`` } },
          { type: 'dropdown', props: { choices: ['English', 'Chinese'] } },
          { type: 'dropdown', props: { choices: ['Serena', 'Vivian'] } },
        ], dependencies: [{ api_name: 'run_instruct' }] });
      } else if (request.method === 'POST' && url.pathname === '/gradio_api/call/v2/run_instruct') {
        let body = '';
        for await (const chunk of request) body += chunk;
        posts.push(JSON.parse(body));
        json({ event_id: `event_${posts.length}` });
      } else if (request.method === 'GET' && /^\/gradio_api\/call\/run_instruct\/event_\d+$/.test(url.pathname)) {
        const eventId = url.pathname.split('/').at(-1);
        const file = { path: `/tmp/gradio/e2e/${eventId}.wav`, mime_type: 'audio/wav',
          is_stream: false, meta: { _type: 'gradio.FileData' } };
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(`event: complete\ndata: ${JSON.stringify([file, 'Success'])}\n\n`);
      } else if (request.method === 'GET' && url.pathname.startsWith('/gradio_api/file=')) {
        response.writeHead(200, { 'Content-Type': 'audio/wav' }); response.end(wav);
      } else {
        unexpectedRequests.push(`${request.method} ${url.pathname}`);
        response.writeHead(404); response.end('unexpected request');
      }
    } catch (error) {
      unexpectedRequests.push(error.message);
      response.writeHead(500); response.end('fake server error');
    }
  });
  let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await admin.query(`CREATE TABLE ${schema}.wordbank_entries (LIKE public.wordbank_entries INCLUDING ALL)`);
    await admin.query(`CREATE TABLE ${schema}.wordbank_audio (LIKE public.wordbank_audio INCLUDING ALL)`);
    const bank = randomUUID(), apple = randomUUID(), example = randomUUID(), explanation = randomUUID(), extraExample = randomUUID();
    await pool.query(`INSERT INTO wordbank_entries (guid, source_id, word, level) VALUES
      ($1, 1, 'bank', '{"list":"basic"}'), ($2, 2, 'apple', '{"list":"expert"}')`, [bank, apple]);
    const oldPath = `wordbank/old/${bank}.mp3`;
    for (const [assetGuid, kind, text] of [[bank, 'word', 'bank'], [example, 'example', 'The bank is open.'],
      [explanation, 'explanation', 'A place for keeping money.']]) {
      await pool.query(`INSERT INTO wordbank_audio
        (asset_guid, entry_guid, kind, relative_path, model, voice, instruct, language,
         text_hash, duration_seconds, bytes, generated_at)
        VALUES ($1,$2,$3,$4,'old-model','old-voice','old instruction','English',$5,1,123,'2026-10-01T00:00:00Z')`,
      [assetGuid, bank, kind, `wordbank/old/${assetGuid}.mp3`, sha256(text)]);
    }
    if (sentences) {
      await pool.query('UPDATE wordbank_entries SET examples=$2::jsonb, explains=$3::jsonb WHERE guid=$1',
        [bank, JSON.stringify([{ guid: example, en: 'The bank is open.', zh: '銀行開著。' }, { guid: randomUUID(), en: ' ' }]),
          JSON.stringify([{ guid: explanation, en: 'A place for keeping money.' }])]);
      await pool.query('UPDATE wordbank_entries SET examples=$2::jsonb WHERE guid=$1',
        [apple, JSON.stringify([{ guid: extraExample, en: 'I eat an apple.' }])]);
    }
    const preservedWhere = sentences ? "kind='word'" : "kind<>'word'";
    const beforeOther = (await pool.query(`SELECT * FROM wordbank_audio WHERE ${preservedWhere} ORDER BY asset_guid`)).rows;
    const oldBytes = Buffer.from('Existing recording must stay unchanged.');
    await mkdir(dirname(join(audioDir, oldPath)), { recursive: true });
    await writeFile(join(audioDir, oldPath), oldBytes);
    const oldExamplePath = `wordbank/old/${example}.mp3`;
    await writeFile(join(audioDir, oldExamplePath), oldBytes);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
    const cli = async (...args) => exec(process.execPath,
      ['--import', 'tsx', 'scripts/replace-wordbank-words.mjs', ...args, '--work-dir', workDir],
      { cwd: root, timeout: 45_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, DATABASE_URL: isolatedUrl.href, AUDIO_DIR: audioDir, WORD_BANK_REAL_TTS: '1' } });

    const command = (...args) => cli(...args, ...(sentences ? ['--kinds', 'example,explanation'] : []));
    const planned = await command('plan', '--origin', origin);
    assert.match(planned.stdout, sentences ? /共 3 筆字庫音訊/ : /共 2 個單字/);
    const plan = JSON.parse(await readFile(join(workDir, 'plan.json'), 'utf8'));
    assert.deepEqual(plan.jobs.map(job => [job.text, job.kind]), sentences ? [['The bank is open.', 'example'], ['A place for keeping money.', 'explanation'], ['I eat an apple.', 'example']] : [['bank', 'word'], ['apple', 'word']]);
    assert.equal(plan.version, sentences ? 2 : 1);
    if (sentences) {
      const originalPlan = await readFile(join(workDir, 'plan.json'), 'utf8');
      await assert.rejects(cli('plan'), /kinds 與現有 plan 不同/);
      await assert.rejects(cli('status'), /kinds 與現有 plan 不同/);
      await assert.rejects(cli('run', '--apply', '--kinds', 'word'), /kinds 與現有 plan 不同/);
      assert.equal(await readFile(join(workDir, 'plan.json'), 'utf8'), originalPlan);
      assert.equal(posts.length, 0);
    }
    assert.equal(posts.length, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM wordbank_audio')).rows[0].count, 3);

    const converted = await command('run', '--apply', '--retry-unknown');
    assert.match(converted.stdout, sentences ? /1 \/ 3 - \[example\] The bank is open/ : /1 \/ 2 - bank/);
    assert.match(converted.stdout, sentences ? /3 \/ 3 - \[example\] I eat an apple/ : /2 \/ 2 - apple/);
    assert.match(converted.stdout, sentences ? /"applied": 3/ : /"applied": 2/);
    assert.deepEqual(posts.map(body => [body.text, body.lang_disp, body.spk_disp]),
      plan.jobs.map(job => [job.text, 'English', 'Serena']));
    for (const job of plan.jobs) {
      const row = (await pool.query('SELECT * FROM wordbank_audio WHERE asset_guid=$1', [job.assetGuid])).rows[0];
      assert.equal(row.kind, job.kind);
      assert.equal(row.model, model);
      assert.equal(row.voice, 'Serena');
      assert.equal(row.relative_path, job.relativePath);
      assert.equal(row.text_hash, sha256(job.text));
      const file = join(audioDir, row.relative_path);
      const bytes = await readFile(file);
      assert.notDeepEqual(bytes.subarray(0, 4), Buffer.from('RIFF'));
      assert.equal(Number(row.bytes), bytes.length);
      const probe = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', file]);
      assert.ok(JSON.parse(probe.stdout).streams.some(stream => stream.codec_name === 'mp3'));
    }
    assert.deepEqual((await pool.query(`SELECT * FROM wordbank_audio WHERE ${preservedWhere} ORDER BY asset_guid`)).rows, beforeOther);
    assert.deepEqual(await readFile(join(audioDir, oldPath)), oldBytes);

    assert.deepEqual(await readFile(join(audioDir, oldExamplePath)), oldBytes);
    const resumed = await command('run', '--apply');
    assert.equal(posts.length, plan.total, '續跑不應再 POST 產音');
    assert.match(resumed.stdout, /"generated": 0/);
    assert.match(resumed.stdout, new RegExp(`\"skipped\": ${plan.total}`));
    const status = await command('status');
    assert.match(status.stdout, new RegExp(`\"total\": ${plan.total}`));
    assert.match(status.stdout, new RegExp(`\"applied\": ${plan.total}`));
    const csv = await readFile(join(workDir, 'status.csv'), 'utf8');
    assert.match(csv, /bank/); assert.match(csv, /apple/);
    assert.equal(csv.split('\n').filter(line => line.includes('applied')).length, plan.total);
    if (sentences) {
      await pool.query('UPDATE wordbank_entries SET explains=$2::jsonb WHERE guid=$1', [bank, JSON.stringify([{ guid: explanation, en: 'Changed after apply.' }])]);
      await assert.rejects(command('run', '--apply'), /Command failed/);
      const report = JSON.parse(await readFile(join(workDir, 'report.json'), 'utf8'));
      assert.match(report.failed[0].error, /GUID 或文字變更/);
      assert.equal(posts.length, plan.total, '已套用且來源變更時仍不得重新產音');
    }
    assert.deepEqual(unexpectedRequests, []);
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
    await pool.end();
    try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await admin.end(); await rm(temporary, { recursive: true, force: true }); }
  }
 }

test('CLI plan／run --apply／status 完整整合，續跑零重產且保留例句、解釋與舊檔', { timeout: 90_000 }, () => runCliFixture());
test('CLI選英文例句與解釋：kind隔離、補缺／重產、錯種類拒絕、續跑及來源改動保護', { timeout: 90_000 }, () => runCliFixture(true));
