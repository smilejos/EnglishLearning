// 唯讀查核本批隔離預覽 API；不匯入、不生成、不發布。
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--browse'), '只接受單一 --browse 或不帶參數');
const browse = args[0] === '--browse';
const origin = 'http://127.0.0.1:5180';
const sha = data => createHash('sha256').update(data).digest('hex');
const scenarios = [];
const entries = new Map();
const clips = new Set();
async function request(relative, status = 200, options) {
  assert(relative.startsWith('/') && !relative.startsWith('//'));
  const response = await fetch(`${origin}${relative}`, { ...options, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, relative);
  return response;
}
for (const suffix of ['basics', 'extended']) {
  const pkg = JSON.parse(await readFile(new URL(`docs/scenarios/packages/time-prepositions-${suffix}-r1/scenario.json`, root)));
  const detail = await (await request(`/scenarios/${pkg.scenarioKey}/revisions/1`)).json();
  assert.equal(detail.learningMode, 'illustrated-guide');
  assert.equal(detail.status, browse ? 'published' : 'draft');
  assert.deepEqual(detail.targets, pkg.targets);
  assert.deepEqual(detail.story, pkg.story);
  const image = await request(detail.image.url);
  assert.equal(sha(Buffer.from(await image.arrayBuffer())), pkg.assets.baseImage.sha256);
  const audio = await request(detail.storyAudio.url);
  const audioBytes = Buffer.from(await audio.arrayBuffer());
  assert.equal(sha(audioBytes), pkg.assets.storyAudio.sha256);
  const range = await request(detail.storyAudio.url, 206, { headers: { Range: 'bytes=0-15' } });
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), audioBytes.subarray(0, 16));
  for (const target of detail.targets) {
    const entry = await (await request(`/wordbank/entries/${target.entryGuid}`)).json();
    assert.equal(entry.guid, target.entryGuid);
    assert.equal(entry.word, target.word);
    assert(entry.partsOfSpeech.includes('prep'));
    assert.equal(entry.level.list, target.list);
    const urls = [entry.wordAudioUrl, ...entry.explains.map(item => item.audioUrl), ...entry.examples.map(item => item.audioUrl)];
    assert(urls.every(Boolean), `${target.word} 有缺音`);
    urls.forEach(url => clips.add(url));
    entries.set(entry.guid, entry.word);
  }
  scenarios.push({ scenarioKey: pkg.scenarioKey, revision: 1, targets: detail.targets.length,
    imageHashMatched: true, storyHashMatched: true, storyRangeSupported: true });
}
for (const url of clips) {
  const response = await request(url);
  assert((response.headers.get('content-type') ?? '').includes('audio/'), url);
  assert((await response.arrayBuffer()).byteLength > 0, url);
}
const publicList = await (await request('/scenarios')).json();
let categoryId, categoryUrl;
if (browse) {
  assert.deepEqual(publicList.scenarios.map(item => item.scenarioKey).sort(), scenarios.map(item => item.scenarioKey).sort(), '公開清單須恰好為本批兩組');
  const { kind } = await (await request('/scenarios/taxonomy/tag-kind')).json();
  for (const item of publicList.scenarios) {
    assert.equal(item.status, 'published');
    assert.equal(item.revision, 1);
    const tags = item.tags.filter(tag => tag.kind === kind && tag.label === '語法情境');
    assert.equal(tags.length, 1, `${item.scenarioKey} 須有唯一語法情境分類`);
    assert(Number.isSafeInteger(tags[0].id) && tags[0].id > 0);
    categoryId ??= tags[0].id;
    assert.equal(tags[0].id, categoryId, '兩組須共用同一分類');
  }
  categoryUrl = `http://127.0.0.1:5181/#/scenarios?category=${categoryId}`;
} else {
  assert(!publicList.scenarios.some(item => scenarios.some(s => s.scenarioKey === item.scenarioKey)));
}
const adminList = await (await request('/scenarios?includeDrafts=true')).json();
for (const scene of scenarios) {
  const summary = adminList.scenarios.find(item => item.scenarioKey === scene.scenarioKey);
  assert.equal(summary?.targetCounts.prep, scene.targets);
  assert.equal(summary.learningMode, 'illustrated-guide');
  assert.equal(summary.status, browse ? 'published' : 'draft');
  if (browse) assert(summary.tags.some(tag => tag.id === categoryId && tag.label === '語法情境'));
}
assert.equal(entries.size, 13);
assert.equal(clips.size, 123);
const report = { checkedAt: new Date().toISOString(), scope: '隔離 _test API 唯讀查核；不代替瀏覽器操作或人工試聽',
  scenarios, uniqueTargetCards: entries.size, targetCardOccurrences: 14, availableWordbankClips: clips.size,
  ...(browse ? { status: 'published', publicListContainsExactlyBatch: true, sharedGrammarTagMatched: true, categoryId, categoryUrl } : { draftAbsentFromPublicList: true }), adminPrepCountsMatched: true };
const reportFile = browse ? 'category-verification.json' : 'api-verification.json';
await writeFile(new URL(`docs/scenarios/preparation/time-prepositions/${reportFile}`, root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
