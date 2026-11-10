// 全部 HTTP 以假 fetch 回覆；不連正式 API、不啟動服務、不寫 DB。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ORIGIN, createReader, bundleEvidence, loadInputs, verifyProduction } from './verify-time-prepositions-production.mjs';

const root = new URL('../../', import.meta.url);
const inputs = await loadInputs();
const audioRoot = new URL('data/scenario-wordbank-audio/time-prepositions/', root);
const payloads = new Map();
for (const asset of inputs.manifest.entries) payloads.set(`/audio/${asset.relativePath}`, await readFile(new URL(asset.relativePath, audioRoot)));
for (const pkg of inputs.packages) {
  for (const [kind, asset] of [['image', pkg.assets.baseImage], ['audio', pkg.assets.storyAudio]]) {
    payloads.set(`/scenarios/${pkg.scenarioKey}/revisions/1/media/${kind}`, await readFile(new URL(asset.path, root)));
  }
}

function fixture({ others = ['existing-published'], edit = () => {} } = {}) {
  const replies = new Map();
  const requests = [];
  const summaries = [];
  for (const pkg of inputs.packages) {
    const detail = { ...Object.fromEntries(['schemaVersion', 'scenarioKey', 'revision', 'titleZh', 'vocabularyMode', 'learningMode', 'vocabularyFilter', 'targetCount', 'targets', 'story'].map(k => [k, structuredClone(pkg[k])])),
      status: 'published', image: { url: `/scenarios/${pkg.scenarioKey}/revisions/1/media/image`, width: 1672, height: 941 },
      storyAudio: { url: `/scenarios/${pkg.scenarioKey}/revisions/1/media/audio` } };
    replies.set(`/scenarios/${pkg.scenarioKey}`, detail);
    replies.set(`/scenarios/${pkg.scenarioKey}/revisions/1`, structuredClone(detail));
    summaries.push({ scenarioKey: pkg.scenarioKey, revision: 1, status: 'published', learningMode: 'illustrated-guide', targetCount: pkg.targetCount,
      targetCounts: { n: 0, v: 0, adj: 0, prep: pkg.targetCount }, tags: [{ id: 47, kind: '情境', label: '語法情境' }] });
  }
  replies.set('/scenarios', { scenarios: [...others.map(scenarioKey => ({ scenarioKey, status: 'published' })), ...summaries] });
  replies.set('/scenarios/taxonomy/tag-kind', { kind: '情境' });
  for (const incoming of inputs.delta.entries) {
    const clips = inputs.manifest.entries.filter(a => a.entryGuid === incoming.guid);
    const target = inputs.packages.flatMap(p => p.targets).find(t => t.entryGuid === incoming.guid);
    const item = { guid: incoming.guid, word: incoming.word, definition: incoming.definition ?? '既有中文釋義', partsOfSpeech: incoming.parts_of_speech,
      level: incoming.level ?? { list: target.list }, wordAudioUrl: clips.find(a => a.kind === 'word') ? `/audio/${clips.find(a => a.kind === 'word').relativePath}` : null };
    for (const [field, kind] of [['explains', 'explanation'], ['examples', 'example']]) {
      item[field] = clips.filter(a => a.kind === kind).map(a => ({ guid: a.assetGuid, en: a.text, ...(kind === 'example' ? { zh: '既有翻譯' } : {}), audioUrl: `/audio/${a.relativePath}` }));
      for (const addition of incoming[field]) {
        const existing = item[field].find(x => x.guid === addition.guid);
        if (existing) Object.assign(existing, addition);
        else item[field].push({ ...addition, audioUrl: null });
      }
    }
    replies.set(`/wordbank/entries/${incoming.guid}`, item);
  }
  edit(replies);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, ORIGIN);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    const route = parsed.pathname + parsed.search;
    requests.push(route);
    if (replies.has(route)) return Response.json(replies.get(route));
    const bytes = payloads.get(route);
    assert(bytes, `不允許未規劃資源 ${route}`);
    const headers = { 'Content-Type': route.endsWith('/image') ? 'image/png' : 'audio/mpeg' };
    if (options.headers.Range) return new Response(bytes.subarray(0, 16), { status: 206, headers: { ...headers, 'Content-Range': `bytes 0-15/${bytes.length}` } });
    return new Response(bytes, { headers });
  };
  return { fetchImpl, requests };
}

test('保留其他13場或其公開子集；只讀本批兩場與14個字庫 GUID', async () => {
  for (const count of [0, 4, 13]) {
    const others = Array.from({ length: count }, (_, i) => `original-${i}`);
    const fake = fixture({ others });
    const result = await verifyProduction(inputs, fake.fetchImpl);
    assert.equal(result.publicList.total, count + 2);
    assert.deepEqual(result.publicList.otherPublishedKeys, others.sort());
    assert.equal(result.categoryUrl, `${ORIGIN}/#/scenarios?category=47`);
    assert.equal(result.uniqueTargetCards, 13);
    assert.equal(result.availableWordbankClips, 123);
    assert.equal(result.existingScenarioPreservation.status, 'pending-driver-baseline-after-comparison');
    assert.equal(fake.requests.filter(p => p.startsWith('/wordbank/entries/')).length, 14);
    assert(!fake.requests.some(p => p.includes('/original-') || p.includes('includeDrafts')));
  }
});

test('拒絕未發布及缺少本批公開情境', async () => {
  for (const edit of [r => { r.get('/scenarios').scenarios.pop(); }, r => { r.get('/scenarios').scenarios.at(-1).status = 'draft'; }]) {
    await assert.rejects(verifyProduction(inputs, fixture({ edit }).fetchImpl));
  }
});

test('拒絕兩場分類 ID 不一致', async () => {
  await assert.rejects(verifyProduction(inputs, fixture({ edit: r => { r.get('/scenarios').scenarios.at(-1).tags[0].id = 3; } }).fetchImpl), /共用正式動態標籤/);
});

test('拒絕新增時間 explain 或 example 中文與定稿不同', async () => {
  const incoming = inputs.delta.entries[0];
  for (const [field, property] of [['explains', 'en'], ['examples', 'zh']]) {
    const fake = fixture({ edit: r => { r.get(`/wordbank/entries/${incoming.guid}`)[field].find(x => x.guid === incoming[field][0].guid)[property] = '錯誤內容'; } });
    await assert.rejects(verifyProduction(inputs, fake.fetchImpl), /新增/);
  }
});

test('拒絕詞卡新增語意沒有 audio URL', async () => {
  const incoming = inputs.delta.entries[0];
  const fake = fixture({ edit: r => { r.get(`/wordbank/entries/${incoming.guid}`).explains.find(x => x.guid === incoming.explains[0].guid).audioUrl = null; } });
  await assert.rejects(verifyProduction(inputs, fake.fetchImpl), /新增時間語意缺音/);
});

test('拒絕旁白錯誤 Range header', async () => {
  const fake = fixture();
  await assert.rejects(verifyProduction(inputs, async (url, options) => {
    const response = await fake.fetchImpl(url, options);
    if (options.headers.Range && url.endsWith('/audio')) response.headers.set('Content-Range', 'bytes 0-15/1');
    return response;
  }), /Content-Range/);
});

test('拒絕同大小但內容變更的詞音', async () => {
  const fake = fixture();
  await assert.rejects(verifyProduction(inputs, async (url, options) => {
    const response = await fake.fetchImpl(url, options);
    if (url.includes('/audio/wordbank/')) {
      const bytes = Buffer.from(await response.arrayBuffer());
      bytes[bytes.length - 1] ^= 1;
      return new Response(bytes, { headers: response.headers });
    }
    return response;
  }), /詞音 bytehash/);
});

test('同源白名單拒絕未知 key、外部 URL 與 redirect，所有請求明確 GET', async () => {
  let count = 0;
  const read = createReader(['/scenarios'], async (_url, options) => {
    count++;
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    return new Response('redirect', { status: 302 });
  });
  for (const route of ['/scenarios/unknown', 'https://example.com/', '//example.com/', '/scenarios?includeDrafts=true']) await assert.rejects(read(route), /白名單/);
  assert.equal(count, 0);
  await assert.rejects(read('/scenarios'), /HTTP 狀態/);
});

test('只有隱藏按鈕文案不能當作邏輯驗證成功', () => {
  assert.throws(() => bundleEvidence('隱藏單字 顯示單字 illustrated-guide'), /handler/);
  assert.throws(() => bundleEvidence('onClick:()=>{b(!N),w(!1)},children:N?"隱藏單字":"顯示單字"'), /靜態證據/);
});
