import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createQwenGradioFetch, downloadQwenGradioMp3, synthesizeQwenGradioMp3, validateQwenGradioOrigin, wavToMp3 } from './qwen-gradio-client.mjs';
import { generateBatch, planAudio } from '../generate-wordbank-audio.mjs';

const ORIGIN = 'http://192.168.1.124:8000';
const PROFILE = { model: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', voice: 'Serena',
  instruct: 'Speak warmly and clearly.', lang_code: 'English', response_format: 'mp3' };
const FILE = { path: '/tmp/gradio/abc/audio.wav', url: `${ORIGIN}/gradio_api/file=/tmp/gradio/abc/audio.wav`,
  mime_type: 'audio/wav', is_stream: false, meta: { _type: 'gradio.FileData' } };
const mp3 = Buffer.from('ID3mock-audio');

function wav() {
  const samples = 2400, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 24000) * 1000), 44 + i * 2);
  return bytes;
}

function events(text, chunks = [text]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

function fixture({ file = FILE, sse, audio = wav(), contentType = 'audio/wav', audioResponse, split = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (calls.length === 1) return new Response(JSON.stringify({ event_id: 'event_123' }), { headers: { 'Content-Type': 'application/json' } });
    if (calls.length === 2) {
      const stream = sse ?? `event: heartbeat\ndata: null\n\nevent: generating\ndata: [null,"working"]\n\nevent: complete\ndata: ${JSON.stringify([file, 'Success 已完成'])}\n\n`;
      const encoded = new TextEncoder().encode(split ? stream.replaceAll('\n', '\r\n') : stream);
      const chunks = [];
      for (let i = 0; i < encoded.length; i += 11) chunks.push(encoded.subarray(i, i + 11));
      return events(stream, split ? chunks : [stream]);
    }
    if (calls.length === 3) return audioResponse ?? new Response(audio, { headers: { 'Content-Type': contentType } });
    throw new Error('unexpected network call');
  };
  return { calls, fetchImpl };
}

test('v2物件請求、分塊SSE complete、同來源檔案下載與WAV轉MP3', async () => {
  const f = fixture({ split: true });
  const statuses = [];
  let conversions = 0;
  const result = await synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
    fetchImpl: f.fetchImpl, onEvent: value => statuses.push(value), convertWavToMp3: async (bytes, { signal }) => {
      conversions++; assert.deepEqual(bytes, wav()); assert.ok(signal instanceof AbortSignal); return mp3;
    } });
  assert.deepEqual(result, mp3);
  assert.equal(conversions, 1);
  assert.equal(f.calls[0].url, `${ORIGIN}/gradio_api/call/v2/run_instruct`);
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { text: 'Hello.', lang_disp: 'English', spk_disp: 'Serena', instruct: PROFILE.instruct });
  assert.equal(f.calls[1].url, `${ORIGIN}/gradio_api/call/run_instruct/event_123`);
  assert.equal(f.calls[2].url, FILE.url);
  assert.equal(f.calls[0].options.signal, f.calls[2].options.signal);
  assert.deepEqual(statuses.map(value => value.stage), ['queued', 'ready', 'complete']);
  assert.deepEqual(statuses[1].file, FILE);
});

test('FileData只有server path時產生同來源file路由；已是MP3不重轉檔', async () => {
  const f = fixture({ file: { ...FILE, url: null }, audio: mp3, contentType: 'audio/mpeg' });
  const bytes = await synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl,
    convertWavToMp3: () => { throw new Error('must not convert MP3'); } });
  assert.deepEqual(bytes, mp3);
  assert.equal(f.calls[2].url, `${ORIGIN}/gradio_api/file=%2Ftmp%2Fgradio%2Fabc%2Faudio.wav`);
});

test('Windows absolute-drive FileData可只GET恢復下載，保留同origin/file限制', async () => {
  for (const file of [
    { ...FILE, path: 'C:/Users/tts/AppData/Local/Temp/gradio/hash/audio.wav', url: `${ORIGIN}/gradio_api/file=C:/Users/tts/AppData/Local/Temp/gradio/hash/audio.wav` },
    { ...FILE, path: 'C:\\Users\\tts\\AppData\\Local\\Temp\\gradio\\hash\\audio.wav', url: `${ORIGIN}/gradio_api/file=C%3A%5CUsers%5Ctts%5CAppData%5CLocal%5CTemp%5Cgradio%5Chash%5Caudio.wav` },
    { ...FILE, path: 'D:\\Cache\\gradio\\hash\\audio.wav', url: null },
  ]) {
    const requests = [];
    const result = await downloadQwenGradioMp3({ origin: ORIGIN, file, fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
    } });
    assert.deepEqual(result, mp3); assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'GET');
    assert.equal(new URL(requests[0].url).origin, ORIGIN);
    assert.ok(new URL(requests[0].url).pathname.startsWith('/gradio_api/file='));
  }
});

test('Windows UNC、drive-relative、traversal、ADS、裝置路徑及相對路徑仍拒絕', async () => {
  for (const serverPath of ['\\\\server\\share\\audio.wav', '\\\\?\\C:\\Cache\\audio.wav', 'C:audio.wav',
    'C:/tmp/../secret.wav', 'C:\\tmp\\..\\secret.wav', 'C:/tmp/.. /secret.wav',
    'C:/tmp/audio.wav::$DATA', 'C:/tmp/NUL.wav', 'gradio/hash/audio.wav', 'file:///C:/tmp/audio.wav']) {
    let calls = 0;
    await assert.rejects(downloadQwenGradioMp3({ origin: ORIGIN, file: { ...FILE, url: `${ORIGIN}/gradio_api/file=${serverPath}` },
      fetchImpl: async () => { calls++; } }), /逃逸路徑/);
    assert.equal(calls, 0);
  }
});

test('URL驗證失敗前先報ready完整FileData，error也可供恢復診斷', async () => {
  const file = { ...FILE, url: `${ORIGIN}/gradio_api/file=gradio/relative/audio.wav` };
  const f = fixture({ file });
  const notices = [];
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl,
    onEvent: event => notices.push(event) }), error => error.gradioEventId === 'event_123' &&
      error.gradioFileData.url === file.url && /逃逸路徑/.test(error.message));
  assert.deepEqual(notices.map(event => event.stage), ['queued', 'ready']);
  assert.deepEqual(notices[1].file, file);
  assert.equal(f.calls.length, 2);
});

test('error/cancel事件及無complete不得當成成功或下載音訊', async () => {
  for (const name of ['error', 'cancelled', 'canceled']) {
    const f = fixture({ sse: `event: ${name}\ndata: "model failed"\n\n` });
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl }), new RegExp(name));
    assert.equal(f.calls.length, 2);
  }
  const f = fixture({ sse: 'event: heartbeat\ndata: null\n\n' });
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl }), /沒有 complete/);
});

test('complete錯誤狀態與缺FileData不假成功', async () => {
  for (const data of [[FILE, 'Error: generation failed'], [null, 'Success']]) {
    const f = fixture({ sse: `event: complete\ndata: ${JSON.stringify(data)}\n\n` });
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl }), /失敗|缺音訊/);
    assert.equal(f.calls.length, 2);
  }
});

test('跨來源、file scheme、任意路由與file外部代理網址一律不下載', async () => {
  for (const url of ['http://evil.example/audio.wav', 'file:///tmp/audio.wav',
    `${ORIGIN}/admin`, `${ORIGIN}/gradio_api/file=https://evil.example/audio.wav`,
    `${ORIGIN}/gradio_api/file=%2Ftmp%2F..%2Fsecret.wav`]) {
    const f = fixture({ file: { ...FILE, url } });
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl }), /下載僅允許|逃逸路徑/);
    assert.equal(f.calls.length, 2);
  }
});

test('拒絕HTTP 200文字、空音訊、錯誤binary與失敗轉檔', async () => {
  for (const [audio, contentType] of [[Buffer.from('{"error":"failed"}'), 'application/json'],
    [Buffer.alloc(0), 'audio/wav'], [Buffer.from('not-audio'), 'audio/wav']]) {
    const f = fixture({ audio, contentType });
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl }), /不是音訊|錯誤或不支援/);
  }
  const f = fixture();
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl: f.fetchImpl,
    convertWavToMp3: async () => Buffer.from('bad converter output') }), /有效MP3/);
});

test('caller取消會停止等待SSE，且保留已提交event_id供審計', async () => {
  const controller = new AbortController();
  let calls = 0, cancelled = false;
  const fetchImpl = async () => ++calls === 1
    ? new Response('{"event_id":"queued_1"}')
    : new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const promise = synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, fetchImpl, signal: controller.signal });
  setTimeout(() => controller.abort(new DOMException('user cancelled', 'AbortError')), 5);
  await assert.rejects(promise, error => error.name === 'AbortError' && error.gradioEventId === 'queued_1');
  assert.equal(calls, 2); assert.equal(cancelled, true);
});

test('timeout涵蓋不理會signal的fetch與SSE等待', async () => {
  // ref timer keeps the test process alive while AbortSignal.timeout uses an unref timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
      timeoutMs: 10, fetchImpl: () => new Promise(() => {}) }), { name: 'TimeoutError' });
    let calls = 0;
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE, timeoutMs: 10,
      fetchImpl: async () => ++calls === 1 ? new Response('{"event_id":"event1"}')
        : new Response(new ReadableStream({}), { headers: { 'Content-Type': 'text/event-stream' } }) }), { name: 'TimeoutError' });
    assert.equal(calls, 2);
  } finally { clearTimeout(keepAlive); }
});

test('明示origin與真實profile必填；建構適配器本身沒有網路/生成副作用', () => {
  for (const value of [undefined, '', 'https://example.com', 'http://8.8.8.8:8000', 'http://192.168.1.124:8000/path',
    'file:///tmp/qwen', 'http://user:secret@192.168.1.124:8000', 'http://169.254.169.254'])
    assert.throws(() => validateQwenGradioOrigin(value));
  for (const value of [ORIGIN, 'http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000', 'https://10.0.0.2:8000'])
    assert.ok(validateQwenGradioOrigin(value));
  assert.throws(() => createQwenGradioFetch({ origin: ORIGIN }), /profile/);
  assert.throws(() => createQwenGradioFetch({ origin: ORIGIN, profile: { ...PROFILE, provenance: 'not a profile field' } }), /profile/);
  let calls = 0;
  assert.equal(typeof createQwenGradioFetch({ origin: ORIGIN, profile: PROFILE, fetchImpl: () => { calls++; } }), 'function');
  assert.equal(calls, 0);
});

test('已取消的呼叫不送POST；檔案下載逾時也會取消body', async () => {
  const stopped = new AbortController(); stopped.abort();
  let calls = 0;
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
    signal: stopped.signal, fetchImpl: async () => { calls++; } }), { name: 'AbortError' });
  assert.equal(calls, 0);
  let cancelled = false;
  const f = fixture({ audioResponse: new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'audio/wav' } }) });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
      timeoutMs: 10, fetchImpl: f.fetchImpl }), { name: 'TimeoutError' });
    assert.equal(f.calls.length, 3); assert.equal(cancelled, true);
  } finally { clearTimeout(keepAlive); }
});

test('拒絕redirect回應、HTTP錯誤及無效event_id，不假成功', async () => {
  const redirected = new Response('unexpected');
  Object.defineProperty(redirected, 'redirected', { value: true });
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
    fetchImpl: async () => redirected }), /重新導向/);
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
    fetchImpl: async () => new Response('failed', { status: 503 }) }), /HTTP 503/);
  await assert.rejects(synthesizeQwenGradioMp3({ origin: ORIGIN, text: 'Hello.', profile: PROFILE,
    fetchImpl: async () => new Response('{"event_id":"../bad"}') }), /event_id/);
});

test('generateBatch fetch介面驗證endpoint與模型profile，回傳audio/mpeg', async () => {
  const f = fixture({ audio: mp3, contentType: 'audio/mpeg' });
  const adapter = createQwenGradioFetch({ origin: ORIGIN, profile: PROFILE, fetchImpl: f.fetchImpl });
  const request = { method: 'POST', body: JSON.stringify({ ...PROFILE, input: 'Hello.', stream: false }) };
  await assert.rejects(adapter('http://127.0.0.1:8000', request), /endpoint/);
  await assert.rejects(adapter(ORIGIN, { ...request, body: JSON.stringify({ ...PROFILE, model: 'wrong-model', input: 'Hello.', stream: false }) }), /profile/);
  const response = await adapter(ORIGIN, request);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp3);
  assert.equal(f.calls.length, 3);
});

test('ffmpeg實際轉換合成PCM fixture，未呼叫任何TTS', async () => {
  const result = await wavToMp3(wav());
  const probe = spawnSync('ffprobe', ['-v', 'error', '-i', 'pipe:0', '-show_entries', 'stream=codec_name', '-of', 'json'], { input: result });
  assert.equal(probe.status, 0);
  assert.equal(JSON.parse(probe.stdout.toString()).streams[0].codec_name, 'mp3');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(wavToMp3(wav(), { signal: controller.signal }), { name: 'AbortError' });
});

test('可接既有generateBatch，manifest保存實際1.7B profile並可續跑重用', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'qwen-gradio-adapter-test-'));
  const f = fixture();
  const jobs = planAudio({ entries: [{ guid: '11111111-1111-5111-8111-111111111111', word: 'hello', level: { list: 'basic' }, examples: [] }] }, 'all', PROFILE, ['word']);
  const options = { jobs, outputDir, profile: PROFILE, endpoint: ORIGIN,
    fetchImpl: createQwenGradioFetch({ origin: ORIGIN, profile: PROFILE, fetchImpl: f.fetchImpl }), retries: 0, log() {} };
  try {
    const result = await generateBatch(options);
    assert.equal(result.generated, 1); assert.deepEqual(result.failed, []);
    const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.profile, PROFILE);
    assert.equal(manifest.entries[0].assetGuid, jobs[0].assetGuid);
    assert.equal((await generateBatch(options)).skipped, 1);
    assert.equal(f.calls.length, 3);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});
