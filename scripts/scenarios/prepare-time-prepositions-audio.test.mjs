// 全部使用隔離假字庫；不連 DB／TTS、不讀正式音檔、不寫專案資料。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { localEndpoint, parseOptions, prepare } from './prepare-time-prepositions-audio.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = ['--package', 'first.json', '--package', 'second.json'];
async function fixture(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'time-audio-unit-')));
  try {
    await mkdir(path.join(directory, 'scripts/scenarios'), { recursive: true });
    await mkdir(path.join(directory, 'source'));
    for (const file of ['scripts/scenarios/prepare-time-prepositions-audio.mjs', 'scripts/generate-wordbank-audio.mjs'])
      await copyFile(path.join(root, file), path.join(directory, file));
    const entries = Array.from({ length: 13 }, (_, i) => ({
      guid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      word: `word${i}`, level: { list: 'basic' }, examples: [], explains: [],
    }));
    const target = e => ({ word: e.word, entryGuid: e.guid, list: e.level.list });
    const packages = [
      { scenarioKey: 'time-first', revision: 1, targetCount: 3, targets: entries.slice(0, 3).map(target) },
      { scenarioKey: 'time-second', revision: 1, targetCount: 11, targets: [entries[0], ...entries.slice(3)].map(target) },
    ];
    await writeFile(path.join(directory, 'source/vocabulary-database.json'), JSON.stringify({ entries }));
    await writeFile(path.join(directory, 'first.json'), JSON.stringify(packages[0]));
    await writeFile(path.join(directory, 'second.json'), JSON.stringify(packages[1]));
    const tool = await import(pathToFileURL(path.join(directory, 'scripts/scenarios/prepare-time-prepositions-audio.mjs')));
    await run({ directory, tool, packages });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('endpoint 僅接受無憑證的 loopback HTTP', () => {
  for (const url of ['https://127.0.0.1:8000/', 'http://example.com/', 'http://127.0.0.1.example.com/',
    'http://user:password@localhost:8000/', 'http://localhost:8000/?token=x'])
    assert.throws(() => localEndpoint(url), /loopback/);
  for (const url of ['http://127.0.0.1:8000/v1/audio/speech', 'http://localhost:8000/', 'http://[::1]:8000/'])
    assert.equal(localEndpoint(url), url);
});

test('缺少 opt-in 在讀檔／呼叫 fetch／寫檔前即拒絕生成', async () => {
  const original = process.env.SCENARIO_REAL_TTS;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    delete process.env.SCENARIO_REAL_TTS;
    globalThis.fetch = async () => { calls++; throw Error('不得呼叫網路'); };
    assert.throws(() => parseOptions([...args, '--generate']), /SCENARIO_REAL_TTS/);
    await assert.rejects(prepare({ packages: ['not-present'], generate: true }), /SCENARIO_REAL_TTS/);
    await fixture(async ({ directory }) => {
      const before = await readdir(directory, { recursive: true });
      const result = spawnSync(process.execPath, ['scripts/scenarios/prepare-time-prepositions-audio.mjs', ...args, '--generate'], {
        cwd: directory, encoding: 'utf8', env: { ...process.env, SCENARIO_REAL_TTS: '' },
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /SCENARIO_REAL_TTS/);
      assert.deepEqual(await readdir(directory, { recursive: true }), before);
    });
    assert.equal(calls, 0);
  } finally {
    if (original === undefined) delete process.env.SCENARIO_REAL_TTS; else process.env.SCENARIO_REAL_TTS = original;
    globalThis.fetch = originalFetch;
  }
});

test('預設 plan 驗證14詞次／13唯一詞，完全不寫檔或呼叫fetch；單場可選', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw Error('不得呼叫網路'); };
    await fixture(async ({ directory, tool }) => {
      const before = await readdir(directory, { recursive: true });
      const sourceBefore = await readFile(path.join(directory, 'source/vocabulary-database.json'), 'utf8');
      const report = await tool.prepare(tool.parseOptions(args));
      assert.equal(report.mode, 'plan');
      assert.equal(report.targetOccurrences, 14);
      assert.equal(report.uniqueTargets, 13);
      assert.equal(report.total, 13);
      assert.equal(report.missing, 13);
      assert.equal(report.reused, 0);
      assert.deepEqual(report.scenes.map(s => s.targets), [3, 11]);
      const selected = await tool.prepare(tool.parseOptions([...args, '--scene', 'time-first']));
      assert.equal(selected.scenes.length, 1);
      assert.equal(selected.total, 3);
      assert.deepEqual(await readdir(directory, { recursive: true }), before);
      assert.equal(await readFile(path.join(directory, 'source/vocabulary-database.json'), 'utf8'), sourceBefore);
    });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('場數／詞數／唯一GUID／未知場次 guard', async () => {
  assert.throws(() => parseOptions([]), /兩個 --package/);
  assert.throws(() => parseOptions(args.slice(0, 2)), /兩個 --package/);
  await fixture(async ({ directory, tool, packages }) => {
    await assert.rejects(tool.prepare(tool.parseOptions([...args, '--scene', 'unknown'])), /未符合/);
    const second = packages[1];
    second.targetCount = 10;
    await writeFile(path.join(directory, 'second.json'), JSON.stringify(second));
    await assert.rejects(tool.prepare(tool.parseOptions(args)), /目標數不合法/);
    second.targetCount = 11;
    second.targets[1] = second.targets[0];
    await writeFile(path.join(directory, 'second.json'), JSON.stringify(second));
    await assert.rejects(tool.prepare(tool.parseOptions(args)), /13唯一詞/);
    assert.equal((await readdir(directory)).includes('data'), false);
  });
});
