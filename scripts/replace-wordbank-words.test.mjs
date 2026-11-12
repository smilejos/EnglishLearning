import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, preflightQwen, WORD_PROFILE, DEFAULT_ORIGIN, main, replacementWorkDir } from './replace-wordbank-words.mjs';
import { resumeQwenGradioMp3, synthesizeQwenGradioMp3 } from './scenarios/qwen-gradio-client.mjs';

const plan = { origin: DEFAULT_ORIGIN, profile: WORD_PROFILE };
const file = { path: '/tmp/gradio/word/audio.mp3' };
const mp3 = Buffer.from('ID3mock-mp3');
const sse = () => new Response(`event: complete\ndata: ${JSON.stringify([file, 'Success'])}\n\n`,
  { headers: { 'Content-Type': 'text/event-stream' } });

test('CLI預設plan、只run可apply、profile只能在plan固定', () => {
  assert.deepEqual(parseOptions([]), { command: 'plan' });
  assert.equal(parseOptions(['run', '--apply', '--retry-unknown'])['retry-unknown'], true);
  assert.throws(() => parseOptions(['status', '--apply']), /僅適用 run/);
  assert.throws(() => parseOptions(['run', '--origin', DEFAULT_ORIGIN]), /plan 時固定/);
  assert.throws(() => parseOptions(['plan', '--voice']), /缺少值/);
  assert.deepEqual(parseOptions(['plan', '--kinds', 'explanation,example']).kinds, ['example', 'explanation']);
  for (const kinds of ['', 'example,example', 'translation', 'word,'])
    assert.throws(() => parseOptions(['plan', '--kinds', kinds]), /kinds|缺少值/);
});

test('run沒有真實TTS旗標時，連DB／server之前即拒絕', async () => {
  await assert.rejects(main(['run', '--apply'], {}), /WORD_BANK_REAL_TTS=1/);
});

test('Qwen preflight只GET config並核對真實模型、聲線、語言與API', async () => {
  let calls = 0;
  const config = { components: [{ type: 'markdown', props: { value: `Checkpoint: \`${WORD_PROFILE.model}\`` } },
    { props: { choices: [['Serena', 'Serena'], ['English', 'English']] } }], dependencies: [{ api_name: 'run_instruct' }] };
  const fetchImpl = async (url, options) => {
    calls++; assert.equal(url, `${DEFAULT_ORIGIN}/config`); assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return Response.json(config);
  };
  await preflightQwen(plan, fetchImpl);
  config.components[0].props.value = 'Checkpoint: `another-model`';
  await assert.rejects(preflightQwen(plan, fetchImpl), /與 plan 不符/);
  assert.equal(calls, 2);
});

test('queued恢復只GET event與音檔，等待持久化ready才開始下載', async () => {
  const calls = [], stages = [];
  let readySaved = false;
  const result = await resumeQwenGradioMp3({ origin: DEFAULT_ORIGIN, eventId: 'existing_123',
    onEvent: async event => {
      stages.push(event.stage);
      if (event.stage === 'ready') { await Promise.resolve(); readySaved = true; }
    },
    fetchImpl: async (url, options) => {
      calls.push(url); assert.equal(options.method, 'GET');
      if (calls.length === 1) return sse();
      assert.equal(readySaved, true);
      return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
    } });
  assert.deepEqual(result, mp3);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /run_instruct\/existing_123$/);
  assert.deepEqual(stages, ['ready', 'complete']);
});

test('queued紀錄寫入失敗停止網路流程，保留event ID供修復', async () => {
  let calls = 0;
  await assert.rejects(synthesizeQwenGradioMp3({ origin: DEFAULT_ORIGIN, text: 'bank', profile: WORD_PROFILE,
    fetchImpl: async () => { calls++; return Response.json({ event_id: 'saved-on-server' }); },
    onEvent: async () => { await Promise.resolve(); throw new Error('disk full'); },
  }), error => error.message === 'disk full' && error.gradioEventId === 'saved-on-server');
  assert.equal(calls, 1);
});

test('恢復失敗保留event與FileData；不改成重新產音', async () => {
  let calls = 0;
  await assert.rejects(resumeQwenGradioMp3({ origin: DEFAULT_ORIGIN, eventId: 'existing_123',
    fetchImpl: async (_, options) => { assert.equal(options.method, 'GET'); return ++calls === 1 ? sse() : new Response('', { status: 404 }); },
  }), error => error.gradioEventId === 'existing_123' && error.gradioFileData.path === file.path);
  assert.equal(calls, 2);
  await assert.rejects(resumeQwenGradioMp3({ origin: DEFAULT_ORIGIN, eventId: '../bad', fetchImpl: () => assert.fail('不應連線') }), /無效/);
});

 test('非word預設目錄與word隔離，種類順序正規化，明確work-dir優先', () => {
  const env = { WORD_REPLACEMENT_WORK_DIR: '/workspace/data/wordbank-word-replacement/qwen-lan-1.7b' };
  assert.equal(replacementWorkDir(parseOptions(['run']), env), env.WORD_REPLACEMENT_WORK_DIR);
  for (const command of ['plan', 'run', 'status']) {
    assert.equal(replacementWorkDir(parseOptions([command, '--kinds', 'explanation,example']), env),
      `${env.WORD_REPLACEMENT_WORK_DIR}-example-explanation`);
  }
  assert.equal(replacementWorkDir(parseOptions(['run', '--kinds', 'example', '--work-dir', '/custom']), env), '/custom');
});
