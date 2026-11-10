// 正式 QA：固定同源、僅 GET 本批已知資源；不部署、不匯入、不生成、不直接連 DB。
// 完整驗收：node scripts/scenarios/verify-time-prepositions-production.mjs
// apply 前僅核對前台：同上加 --static-only。報告獨立保存，絕不覆蓋 preview report。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ORIGIN = 'http://127.0.0.1:8090';
const ROOT = new URL('../../', import.meta.url);
const SNAPSHOT = new URL('file:///tmp/englishlearning-time-prepositions-formal-before-html/');
const BATCH = 'docs/scenarios/preparation/time-prepositions/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonFile = async relative => JSON.parse(await readFile(new URL(relative, ROOT), 'utf8'));
const check = (condition, message) => assert(condition, message);
const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message);

// 所有 response URL 必須在 package／manifest／首頁 JS 的明確白名單內；拒絕 redirect。
export function createReader(paths, fetchImpl = globalThis.fetch) {
  const allowed = new Set(paths);
  return async (relative, status = 200, range = false) => {
    check(allowed.has(relative) && relative.startsWith('/') && !relative.startsWith('//'), '拒絕非本批白名單路徑');
    const url = new URL(relative, ORIGIN);
    check(url.origin === ORIGIN && url.pathname + url.search === relative && !url.hash, '拒絕跨 origin 或非正規 URL');
    const response = await fetchImpl(url.href, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Cache-Control': 'no-cache', ...(range ? { Range: 'bytes=0-15' } : {}) },
    });
    equal(response.status, status, `${relative} HTTP 狀態不符`);
    return response;
  };
}

export function bundleEvidence(js) {
  const toggle = js.match(/onClick:\(\)=>\{([$A-Za-z_][\w$]*)\(!([$A-Za-z_][\w$]*)\),([$A-Za-z_][\w$]*)\(!1\)\},children:\2\?"隱藏單字":"顯示單字"/);
  check(toggle, 'bundle 缺少單字切換／收起位置的 handler');
  const state = toggle[2].replace(/\$/g, '\\$');
  const evidence = {
    illustratedGuide: js.includes('learningMode') && js.includes('"illustrated-guide"'),
    guideExplanation: js.includes('圖解學習：圖中包含教學文字，可點選標籤查詞、聆聽教材。'),
    guideResetsRecall: /learningMode==="illustrated-guide"&&[$\w]+\(!1\)/.test(js),
    hideShowToggleAndLocationReset: true,
    overlayUsesWordVisibility: new RegExp(`&&${state}&&![\\w$]+&&.{0,100}children:\\[.{0,100}className:"scenario-arrows"`).test(js),
    wordLabels: js.includes('className:`scenario-label') && js.includes('單字卡'),
  };
  for (const [name, passed] of Object.entries(evidence)) check(passed, `bundle 靜態證據缺漏：${name}`);
  return { ...evidence, proofType: '靜態程式證據；非瀏覽器真實點擊' };
}

export async function verifyStatic() {
  const read = createReader(['/', '/me']);
  const me = await (await read('/me')).json();
  equal(me.user?.role, 'admin', '/me 必須為 admin；不記錄身分內容');
  const htmlBytes = Buffer.from(await (await read('/')).arrayBuffer());
  const localHtml = await readFile(new URL('index.html', SNAPSHOT));
  equal(sha(htmlBytes), sha(localHtml), '公開首頁與既有靜態快照不同，請先查明 runtime 漂移');
  const html = htmlBytes.toString('utf8');
  const assets = [...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[A-Za-z0-9_-]+\.js)"/g)].map(match => match[1]);
  equal(assets.length, 1, '預期單一入口 JS；前台結構改變須重新檢視');
  const asset = assets[0];
  const bytes = Buffer.from(await (await createReader([asset])(asset)).arrayBuffer());
  const local = await readFile(new URL(asset.slice(1), SNAPSHOT));
  equal(sha(bytes), sha(local), '公開 JS 與已複製靜態快照不符');
  const sources = {};
  for (const relative of ['web-learner/src/ScenarioLearning.tsx', 'web-learner/src/scenarioTypes.ts', 'web-learner/src/ScenarioWordCard.tsx']) {
    sources[relative] = sha(await readFile(new URL(relative, ROOT)));
  }
  return { role: 'admin', emailRecorded: false, htmlSha256: sha(htmlBytes),
    bundle: { url: asset, bytes: bytes.length, sha256: sha(bytes), snapshotMatched: true, ...bundleEvidence(bytes.toString('utf8')) },
    repoSourceHashes: sources, repoSourceHashesProveCompiledIdentity: false };
}

export async function loadInputs() {
  const packages = await Promise.all(['basics', 'extended'].map(suffix => jsonFile(`docs/scenarios/packages/time-prepositions-${suffix}-r1/scenario.json`)));
  const delta = await jsonFile(`${BATCH}wordbank-additions.json`);
  const manifest = await jsonFile('data/scenario-wordbank-audio/time-prepositions/manifest.json');
  equal(packages.map(p => p.scenarioKey), ['time-prepositions-basics', 'time-prepositions-extended'], '限定本批兩 key');
  equal(packages.map(p => p.revision), [1, 1], '限定 revision 1');
  equal(packages.map(p => p.targetCount), [3, 11], '本批目標數漂移');
  const targets = new Set(packages.flatMap(p => p.targets.map(t => t.entryGuid)));
  equal(targets.size, 13, '預期13個不同目標');
  equal(delta.entries.length, 14, '預期14筆字庫 delta');
  equal(new Set(delta.entries.map(e => e.guid)).size, 14, 'delta GUID 重複');
  equal(delta.entries.filter(e => targets.has(e.guid)).length, 13, 'delta 須包含13個目標');
  equal(delta.entries.filter(e => !targets.has(e.guid)).map(e => e.word), ['autumn'], '唯一支援新詞須為 autumn');
  equal(manifest.entries.length, 123, '預期123段目標詞音');
  equal(new Set(manifest.entries.map(a => a.assetGuid)).size, 123, 'manifest GUID 重複');
  for (const asset of manifest.entries) {
    check(targets.has(asset.entryGuid), 'manifest 不得包含非目標音訊');
    check(/^wordbank\/[A-Za-z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(asset.relativePath), 'manifest 路徑不安全');
    check(asset.relativePath.endsWith(`/${asset.assetGuid}.mp3`), 'manifest GUID／檔名不符');
    check(/^[a-f0-9]{64}$/.test(asset.sha256), '正式 bytehash 查核需要 manifest sha256');
    equal(sha(asset.text.trim()), asset.textHash, 'manifest 文字 hash 不符');
  }
  return { packages, delta, manifest };
}

export async function verifyProduction(inputs, fetchImpl = globalThis.fetch) {
  const { packages, delta, manifest } = inputs;
  const mediaPath = (pkg, kind) => `/scenarios/${pkg.scenarioKey}/revisions/1/media/${kind}`;
  const read = createReader(['/scenarios', '/scenarios/taxonomy/tag-kind',
    ...packages.flatMap(p => [`/scenarios/${p.scenarioKey}`, `/scenarios/${p.scenarioKey}/revisions/1`, mediaPath(p, 'image'), mediaPath(p, 'audio')]),
    ...delta.entries.map(e => `/wordbank/entries/${e.guid}`),
    ...manifest.entries.map(a => `/audio/${a.relativePath}`)], fetchImpl);
  const json = async route => (await read(route)).json();
  const publicList = await json('/scenarios');
  check(Array.isArray(publicList.scenarios), '公開清單格式不符');
  const { kind } = await json('/scenarios/taxonomy/tag-kind');
  check(typeof kind === 'string' && kind.length > 0, '情境分類維度缺失');
  const scenes = [];
  let categoryId;
  for (const pkg of packages) {
    const summary = publicList.scenarios.filter(s => s.scenarioKey === pkg.scenarioKey);
    equal(summary.length, 1, `${pkg.scenarioKey} 必須公開且唯一`);
    const item = summary[0];
    equal(item.status, 'published', '公開狀態不符');
    equal(item.revision, 1, '公開 revision 不符');
    equal(item.learningMode, 'illustrated-guide', '清單 learningMode 不符');
    equal(item.targetCount, pkg.targetCount, '清單目標數不符');
    equal(item.targetCounts, { n: 0, adj: 0, v: 0, prep: pkg.targetCount }, 'prep 計數不符');
    const tags = (item.tags ?? []).filter(t => t.kind === kind && t.label === '語法情境');
    equal(tags.length, 1, '須有唯一語法情境標籤');
    check(Number.isSafeInteger(tags[0].id) && tags[0].id > 0, '分類 ID 無效');
    categoryId ??= tags[0].id;
    equal(tags[0].id, categoryId, '兩場須共用正式動態標籤');
    const detail = await json(`/scenarios/${pkg.scenarioKey}`);
    const revision = await json(`/scenarios/${pkg.scenarioKey}/revisions/1`);
    equal(detail, revision, '公開指標與指定 revision 不同');
    equal(detail.status, 'published', 'detail 未發布');
    for (const field of ['schemaVersion', 'scenarioKey', 'revision', 'titleZh', 'vocabularyMode', 'learningMode', 'vocabularyFilter', 'targetCount', 'targets', 'story']) {
      equal(detail[field], pkg[field], `${pkg.scenarioKey} ${field} 與定稿不符`);
    }
    equal(detail.image.url, mediaPath(pkg, 'image'), '圖片 URL 不符');
    equal(detail.storyAudio.url, mediaPath(pkg, 'audio'), '旁白 URL 不符');
    const media = {};
    for (const [name, asset] of [['image', pkg.assets.baseImage], ['audio', pkg.assets.storyAudio]]) {
      const route = mediaPath(pkg, name);
      const response = await read(route);
      check((response.headers.get('content-type') ?? '').startsWith(`${name}/`), `${name} MIME 不符`);
      const bytes = Buffer.from(await response.arrayBuffer());
      equal(sha(bytes), asset.sha256, `${pkg.scenarioKey} ${name} bytehash 不符`);
      if (asset.bytes !== undefined) equal(bytes.length, asset.bytes, `${name} bytes 不符`);
      const range = await read(route, 206, true);
      equal(range.headers.get('content-range'), `bytes 0-15/${bytes.length}`, `${name} Content-Range 不符`);
      equal(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 16), `${name} Range 位元組不符`);
      media[name] = { sha256: sha(bytes), bytes: bytes.length, hashMatched: true, rangeMatched: true };
    }
    scenes.push({ scenarioKey: pkg.scenarioKey, revision: 1, status: 'published', targets: detail.targets.length, media });
  }
  const entries = new Map();
  const targetGuids = new Set(packages.flatMap(p => p.targets.map(t => t.entryGuid)));
  const assetsByGuid = new Map(manifest.entries.map(a => [a.assetGuid, a]));
  const checked = new Set();
  const additions = [];
  for (const incoming of delta.entries) {
    const entry = await json(`/wordbank/entries/${incoming.guid}`);
    equal(entry.guid, incoming.guid, '詞卡 GUID 不符');
    equal(entry.word, incoming.word, '詞卡字詞不符');
    for (const pos of incoming.parts_of_speech) check(entry.partsOfSpeech.includes(pos), '詞性缺失');
    if (incoming.definition) equal(entry.definition, incoming.definition, '新增詞釋義不符');
    if (incoming.level) equal(entry.level, incoming.level, '新增詞分級不符');
    for (const target of packages.flatMap(p => p.targets).filter(t => t.entryGuid === entry.guid)) equal(entry.level.list, target.list, '目標真實分級不符');
    for (const field of ['explains', 'examples']) {
      for (const addition of incoming[field]) {
        const matches = entry[field].filter(x => x.guid === addition.guid);
        equal(matches.length, 1, '新增 explain/example GUID 缺失或重複');
        for (const key of field === 'examples' ? ['en', 'zh'] : ['en']) equal(matches[0][key], addition[key], `新增 ${field} ${key} 不符`);
        // autumn 不在目標音訊授權的123段內；只檢查文字，不要求新增音。
        if (targetGuids.has(entry.guid)) check(matches[0].audioUrl, '新增時間語意缺音');
      }
    }
    if (targetGuids.has(entry.guid)) {
      const clips = [{ guid: entry.guid, kind: 'word', en: entry.word, audioUrl: entry.wordAudioUrl },
        ...entry.explains.map(x => ({ ...x, kind: 'explanation' })), ...entry.examples.map(x => ({ ...x, kind: 'example' }))];
      for (const clip of clips) {
        const asset = assetsByGuid.get(clip.guid);
        check(asset && asset.entryGuid === entry.guid && asset.kind === clip.kind, '詞卡音訊與本批 manifest 不符／出現額外子項');
        equal(clip.en.trim(), asset.text, '詞卡音訊文字不符');
        equal(clip.audioUrl, `/audio/${asset.relativePath}`, '詞卡音訊 URL 不符');
        check(!checked.has(asset.assetGuid), '詞卡音訊 GUID 重複');
        const response = await read(clip.audioUrl);
        check((response.headers.get('content-type') ?? '').startsWith('audio/'), '詞音 MIME 不符');
        const bytes = Buffer.from(await response.arrayBuffer());
        equal(bytes.length, asset.bytes, '詞音大小不符');
        equal(sha(bytes), asset.sha256, '詞音 bytehash 不符');
        checked.add(asset.assetGuid);
      }
    }
    entries.set(entry.guid, entry.word);
    additions.push({ word: incoming.word, entryGuid: incoming.guid, explains: incoming.explains.length,
      examples: incoming.examples.length, textMatched: true, targetAudioMatched: targetGuids.has(entry.guid),
      ...(targetGuids.has(entry.guid) ? {} : { audioScope: '非目標支援詞；未要求音訊' }) });
  }
  equal(checked.size, 123, '目標音訊數不符');
  equal(entries.size, 14, '13目標＋autumn 應為14詞');
  return { scenarios: scenes, categoryId, categoryKind: kind, categoryUrl: `${ORIGIN}/#/scenarios?category=${categoryId}`,
    targetCardOccurrences: 14, uniqueTargetCards: targetGuids.size, availableWordbankClips: checked.size,
    wordbankAudioByteHashesMatched: true, additions,
    publicList: { total: publicList.scenarios.length, batchIncluded: true,
      otherPublishedKeys: publicList.scenarios.filter(s => !packages.some(p => p.scenarioKey === s.scenarioKey)).map(s => s.scenarioKey).sort() },
    existingScenarioPreservation: { status: 'pending-driver-baseline-after-comparison', expectedExistingScenarios: 13,
      note: '本腳本不掃其他 key、不驗既有13場完整性；由主對話 driver 比對 baseline/after。' } };
}

async function main() {
  const args = process.argv.slice(2);
  check(args.length === 0 || (args.length === 1 && args[0] === '--static-only'), '只接受 --static-only 或無參數');
  const staticOnly = args.length === 1;
  const report = { checkedAt: new Date().toISOString(), origin: ORIGIN, mode: staticOnly ? 'static-only' : 'after-apply',
    scope: '固定 origin GET 查核；不呼叫 API mutation、不直接連 DB、不啟動服務。',
    manual: { desktopClicks: 'pending', mobile: 'pending', listeningReview: 'pending', readerRoleAuthorization: 'pending' } };
  let failed = false;
  try {
    const inputs = staticOnly ? null : await loadInputs();
    report.static = await verifyStatic();
    if (inputs) report.production = await verifyProduction(inputs);
    report.status = staticOnly ? 'static-evidence-passed' : 'api-checks-passed';
  } catch (error) {
    failed = true;
    report.status = 'failed';
    // 不輸出 response body、/me user、email、headers 或連線設定。
    report.error = String(error.message).split('\n')[0].replace(/postgres(?:ql)?:\/\/\S+/g, '[連線已遮蔽]');
  }
  const directory = new URL(`${BATCH}production-verification/`, ROOT);
  await mkdir(directory, { recursive: true });
  const file = new URL(`${report.checkedAt.replace(/[:.]/g, '-')}-${report.mode}-${randomUUID()}.json`, directory);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, report: fileURLToPath(file),
    ...(report.production ? { categoryUrl: report.production.categoryUrl, cards: 13, clips: 123 } : {}),
    ...(failed ? { error: report.error } : {}) }, null, 2));
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => { console.error('正式 QA 報告無法保存；未輸出身分或連線內容。'); process.exitCode = 1; });
}
