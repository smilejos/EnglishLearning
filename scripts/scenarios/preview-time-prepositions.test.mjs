import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// 在 VM 注入所有 IO；不連 DB、不開 port、不讀教材／媒體或寫驗證成果。
const require = createRequire(import.meta.url);
const scriptUrl = new URL('./preview-time-prepositions.ts', import.meta.url);
const source = (await readFile(scriptUrl, 'utf8')).replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText.replace('main().catch(', 'return main().catch(');
const keys = ['time-prepositions-basics', 'time-prepositions-extended'];
const packageArgs = ['--package', 'basics.json', '--package', 'extended.json'];

async function preview({ args = [], database = 'english_learning_test', existing = false,
  invalidUrl = false, failSecond = false, wrongKey = false, failImport = false } = {}) {
  const events = [], output = [], errors = [];
  const entries = Array.from({ length: 13 }, (_, i) => ({ guid: `g${i}` }));
  const packages = keys.map((scenarioKey, i) => ({
    scenarioKey: wrongKey && i === 1 ? 'other-guide' : scenarioKey, revision: 1,
    learningMode: 'illustrated-guide', targetCount: i ? 11 : 3,
    targets: (i ? [...entries.slice(3), entries[0]] : entries.slice(0, 3)).map(e => ({ entryGuid: e.guid })),
    story: { textEn: 'story', sentences: [] },
    assets: { baseImage: { path: 'image', sha256: 'hash' }, storyAudio: { path: i ? 'audio2' : 'audio1', sha256: 'hash', textSha256: 'hash' } },
  }));
  const manifest = { profile: {}, entries: Array.from({ length: 123 }, (_, i) => ({
    entryGuid: entries[i % 13].guid, relativePath: `clip${i}`, bytes: 1, durationSeconds: 1,
  })) };
  const pool = { query: async () => { events.push('identity'); return { rows: [{ database }] }; }, end: async () => {} };
  const tags = new Map(keys.map(key => [key, [{ id: 7, kind: '改名後維度', label: '既有分類' },
    ...(existing ? [{ id: 9, kind: '改名後維度', label: '語法情境' }] : [])]]));
  const shared = {
    createPool: () => { events.push('pool'); return pool; }, parseWordbankDocument: x => x,
    scenarioSafePath: async (_, relative) => relative, scenarioHash: () => 'hash',
    WordbankAudioManifestSchema: { parse: x => x }, validateWordbankAudioManifest: () => {},
    importWordbankEntries: async () => events.push('wordbank'), importWordbankAudioManifest: async () => {},
    copyScenarioAsset: async () => {}, validateScenarioMedia: content => events.push(`check:${content.scenarioKey}`),
    importScenarioRevision: async (_, content) => {
      events.push(`import:${content.scenarioKey}`);
      if (failImport && content.scenarioKey === keys[1]) throw Error('second import failed');
      return { status: existing ? 'published' : 'draft' };
    },
    getScenarioTagKind: async () => { events.push('kind'); return '改名後維度'; },
    getOrCreateTag: async (_, kind, label) => { assert.equal(kind, '改名後維度'); assert.equal(label, '語法情境'); events.push('tag'); return { id: 9 }; },
    listScenarios: async (_, drafts) => { assert.equal(drafts, true); return keys.map(scenarioKey => ({ scenarioKey, tags: tags.get(scenarioKey) })); },
    setScenarioTags: async (_, key, ids) => { assert.deepEqual(Array.from(ids), [7, 9]); events.push(`classify:${key}`); return []; },
    publishScenarioRevision: async (_, key, revision) => { assert.equal(revision, 1); events.push(`publish:${key}`); return { status: 'published' }; },
  };
  const mocks = {
    '@el/shared': shared,
    '@el/shared/testing': { resolveTestDatabaseUrl: () => { events.push('resolver'); if (invalidUrl) throw Error('invalid test URL'); return 'mock-test-url'; } },
    'node:fs/promises': {
      readFile: async file => {
        if (file.endsWith('vocabulary-database.json')) return JSON.stringify(entries);
        if (file.endsWith('basics.json')) return JSON.stringify(packages[0]);
        if (file.endsWith('extended.json')) return JSON.stringify(packages[1]);
        if (file.endsWith('manifest.json')) return JSON.stringify(manifest);
        if (failSecond && file === 'audio2') throw Error('second media failed');
        return Buffer.from('x');
      }, mkdir: async () => {}, mkdtemp: async () => '/mock-preview', rm: async () => {}, copyFile: async () => {},
    },
    sharp: () => ({ metadata: async () => ({ format: 'png', width: 1, height: 1 }) }),
    '../../api/src/app': { buildApp: () => ({ listen: async () => events.push('listen'), close: async () => {} }) },
    '../import-scenario': { contentFromScenarioPackage: x => x },
    '../generate-wordbank-audio.mjs': { DEFAULT_PROFILE: {}, validateMp3: async () => ({ bytes: 1, durationSeconds: 1 }), planAudio: () => [] },
    '../check-scenario-package.mjs': { validateScenarioPackage: async () => ({ valid: true, publishReady: true }) },
  };
  const run = new vm.Script(`(async function(require, exports, process, console) { ${compiled}\n})`).runInNewContext({ Buffer, URL });
  const fakeProcess = { argv: ['node', 'preview', ...packageArgs, ...args], once: () => {} };
  await run(name => {
    if (name in mocks) return mocks[name];
    assert(['node:path', 'node:os', 'node:url'].includes(name), name);
    return require(name);
  }, {}, fakeProcess, { log: value => output.push(JSON.parse(value)), error: error => errors.push(String(error)) });
  return { events, output, errors, code: fakeProcess.exitCode };
}

test('預設維持 draft，不分類或發布', async () => {
  const result = await preview();
  assert.deepEqual(result.errors, []);
  assert.equal(result.output[0].status, 'draft');
  assert(!('categoryId' in result.output[0]));
  assert(!result.events.includes('tag'));
});
test('--browse 讀實際維度、保留其他 tag，兩套匯入後才分類發布', async () => {
  const result = await preview({ args: ['--browse'] });
  assert.deepEqual(result.errors, []);
  assert(result.events.indexOf('identity') < result.events.indexOf('wordbank'));
  assert(result.events.indexOf(`import:${keys[1]}`) < result.events.indexOf('tag'));
  assert(result.events.indexOf(`classify:${keys[1]}`) < result.events.indexOf(`publish:${keys[0]}`));
  assert.equal(result.output[0].categoryId, 9);
  assert.equal(result.output[0].categoryUrl, 'http://127.0.0.1:5181/#/scenarios?category=9');
  assert.equal(result.output[0].status, 'published');
});
test('--browse 可重用已發布版本與同 tag；預設仍拒絕已發布版本', async () => {
  assert.deepEqual((await preview({ args: ['--browse'], existing: true })).errors, []);
  const result = await preview({ existing: true });
  assert.equal(result.code, 1);
  assert(result.errors[0].includes('published'));
  assert(!result.events.includes('tag'));
});
for (const options of [{ database: 'english_learning' }, { invalidUrl: true }]) {
  test(`--browse 拒絕正式目標：${JSON.stringify(options)}`, async () => {
    const result = await preview({ args: ['--browse'], ...options });
    assert.equal(result.code, 1);
    assert(!result.events.includes('wordbank'));
    assert(!result.events.includes('tag'));
  });
}
for (const options of [{ failSecond: true }, { failImport: true }, { wrongKey: true }]) {
  test(`--browse 前置失敗不分類發布：${JSON.stringify(options)}`, async () => {
    const result = await preview({ args: ['--browse'], ...options });
    assert.equal(result.code, 1);
    assert(!result.events.includes('tag'));
    assert(!result.events.includes('listen'));
  });
}
for (const args of [['--browse', '--browse'], ['--unknown']]) {
  test(`拒絕錯誤參數 ${args.join(' ')}`, async () => {
    const result = await preview({ args });
    assert.equal(result.code, 1);
    assert(!result.events.includes('pool'));
  });
}

const verifierUrl = new URL('./verify-time-prepositions-preview.mjs', import.meta.url);
const verifier = (await readFile(verifierUrl, 'utf8')).replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(verifierUrl.href));
async function verify({ browse = false, mismatch = false, extra = false, corrupt = false } = {}) {
  const writes = [], calls = [];
  const bytes = Buffer.from('mock-media-data-for-range');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const entries = Array.from({ length: 13 }, (_, i) => ({ guid: `g${i}`, word: `w${i}`,
    partsOfSpeech: ['prep'], level: { list: 'basic' }, wordAudioUrl: `/audio/${i}/0`,
    explains: Array.from({ length: i < 6 ? 9 : 8 }, (_, j) => ({ audioUrl: `/audio/${i}/${j + 1}` })), examples: [],
  }));
  const packages = keys.map((scenarioKey, i) => ({ scenarioKey,
    targets: (i ? [...entries.slice(3), entries[0]] : entries.slice(0, 3))
      .map(entry => ({ entryGuid: entry.guid, word: entry.word, list: 'basic' })),
    story: { sentences: [] }, assets: { baseImage: { sha256: hash }, storyAudio: { sha256: hash } },
  }));
  const summaries = packages.map((pkg, i) => ({ scenarioKey: pkg.scenarioKey, revision: 1,
    learningMode: 'illustrated-guide', status: browse ? 'published' : 'draft', targetCounts: { prep: pkg.targets.length },
    tags: [{ id: mismatch && i ? 10 : 9, kind: '改名後維度', label: '語法情境' }],
  }));
  // VM JSON 與 Response.json 分屬不同 realm，僅統一比較物件的 prototype。
  const vmAssert = Object.assign((...args) => assert(...args), assert, {
    deepEqual: (actual, expected, message) => assert.deepEqual(
      JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message),
  });
  const run = new vm.Script(`(async () => { ${verifier}\n})()`).runInNewContext({
    assert: vmAssert, createHash, Buffer, URL, AbortSignal,
    process: { argv: ['node', 'verify', ...(browse ? ['--browse'] : [])] }, console: { log: () => {} },
    readFile: async url => JSON.stringify(packages[url.pathname.includes('basics') ? 0 : 1]),
    writeFile: async (url, data) => writes.push({ path: url.pathname, report: JSON.parse(data) }),
    fetch: async (url, options) => {
      const path = new URL(url).pathname; calls.push(path);
      let value;
      if (path === '/scenarios/taxonomy/tag-kind') value = { kind: '改名後維度' };
      else if (path === '/scenarios') value = { scenarios: url.includes('?') ? summaries : browse ? [...summaries, ...(extra ? [{ scenarioKey: 'other' }] : [])] : [] };
      else if (path.startsWith('/scenarios/')) {
        const index = path.includes('basics') ? 0 : 1;
        value = { ...packages[index], ...summaries[index], image: { url: '/image' }, storyAudio: { url: '/story' } };
      } else if (path.startsWith('/wordbank/entries/')) value = entries.find(entry => path.endsWith(`/${entry.guid}`));
      else if (options.headers?.Range) return new Response(bytes.subarray(0, 16), { status: 206 });
      else return new Response(corrupt && path === '/image' ? 'bad-hash' : bytes, { headers: { 'Content-Type': 'audio/mpeg' } });
      return Response.json(value);
    },
  });
  await run;
  return { writes, calls };
}
test('verify 預設保留歷史 draft 報告位置與 13 詞卡／123 音檢查', async () => {
  const { writes } = await verify();
  assert.equal(writes.length, 1);
  assert(writes[0].path.endsWith('/api-verification.json'));
  assert.equal(writes[0].report.uniqueTargetCards, 13);
  assert.equal(writes[0].report.availableWordbankClips, 123);
});
test('verify --browse 檢查公開兩組、同分類，另存分類報告', async () => {
  const { writes } = await verify({ browse: true });
  assert.equal(writes.length, 1);
  assert(writes[0].path.endsWith('/category-verification.json'));
  assert.equal(writes[0].report.categoryId, 9);
  assert.equal(writes[0].report.categoryUrl, 'http://127.0.0.1:5181/#/scenarios?category=9');
  assert.equal(writes[0].report.availableWordbankClips, 123);
  assert(writes[0].report.scenarios.every(scene => scene.storyRangeSupported));
});
for (const options of [{ mismatch: true }, { extra: true }, { corrupt: true }]) {
  test(`verify --browse 拒絕分類／清單／hash 異常 ${JSON.stringify(options)}`, async () => {
    await assert.rejects(verify({ browse: true, ...options }), options.mismatch ? /兩組須共用同一分類/ : options.extra ? /公開清單須恰好為本批兩組/ : { code: 'ERR_ASSERTION', operator: 'strictEqual' });
  });
}
