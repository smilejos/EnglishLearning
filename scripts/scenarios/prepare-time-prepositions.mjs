#!/usr/bin/env node
// 純離線備料：不讀 .env、不連 DB、不呼叫生成服務；只擁有本批四個路徑及十三詞子項。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarioStoryTokens, validateScenarioWordLinkSpans } from '../../shared/src/scenario-word-links.mjs';
import { validateScenarioPackage } from '../check-scenario-package.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const preparation = 'docs/scenarios/preparation/time-prepositions';
const sourcePath = 'source/vocabulary-database.json';
const namespace = '5aa9fb1e-a703-519e-83a1-290af6e0b8e4';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
async function optionalJson(relative) {
  try { return await readJson(relative); } catch (error) { if (error.code !== 'ENOENT') throw error; return undefined; }
}
async function save(relative, value) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  const text = typeof value === 'string' ? value : json(value);
  let old;
  try { old = await readFile(path.join(root, relative), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (old !== text) await writeFile(path.join(root, relative), text);
}
function uuid5(name) {
  const bytes = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 每詞恰好追加一則 explain 與一組中英 example；不覆寫原定義／GUID／分級。
const supplements = [
  ['in', 'Use in with years, months, seasons, and parts of a day. In two hours can mean two hours from now.', 'We play in the morning.', '我們在早上玩。'],
  ['on', 'Use on with days, dates, and a part of a specific day, such as on Monday morning.', 'We meet on Monday.', '我們在星期一見面。'],
  ['at', 'Use at with clock times, noon, midnight, and night.', 'We eat at noon.', '我們在中午吃飯。'],
  ['before', 'Before a time or event means earlier than that time or event.', 'Wash your hands before lunch.', '午餐前洗手。'],
  ['after', 'After a time or event means later than that time or event.', 'We play after lunch.', '我們在午餐後玩。'],
  ['from', 'From marks the start of a time period, often paired with to for the end.', 'We work from nine to five.', '我們從九點工作到五點。'],
  ['to', 'To marks the end of a time period in expressions such as from nine to five.', 'The shop is open from nine to five.', '這家店從九點營業到五點。'],
  ['by', 'By a time means no later than that time; something may finish earlier.', 'Finish by five.', '最晚五點完成。'],
  ['until', 'Until a time means an action or state continues up to that time.', 'Work until five.', '持續工作到五點。'],
  ['for', 'For with a length of time tells how long an action or state lasts.', 'I read for two hours.', '我讀書讀了兩小時。'],
  ['since', 'Since marks a starting time in the past for an action or state continuing to a later time.', 'I have been here since Monday.', '我從星期一起就一直在這裡。'],
  ['during', 'During means at some time in a period or event; it does not tell how long an action lasts.', 'We talk during the meeting.', '我們在會議期間交談。'],
  ['within', 'Within a length of time means before or at the end of that period, not later.', 'I will be back within two hours.', '我會在兩小時內回來。'],
];

// 主對話明確追加授權：保留圖上 autumn，補一個未分級支援詞。
function ensureAutumn(source, recorded) {
  const word = 'autumn';
  const matches = source.entries.filter(entry => entry.word.toLowerCase() === word);
  if (matches.length > 1) throw new Error('autumn 詞條重複，須人工核對');
  const guid = uuid5('scenarios:time-prepositions:word:autumn');
  if (matches.length === 1 && matches[0].guid !== guid) return null; // 若正式來源已有，直接重用。
  const id = recorded?.entries.find(entry => entry.word === word)?.id ?? 9253;
  const explains = [
    'Autumn is the season between summer and winter.',
    'In autumn, leaves on many trees turn yellow, orange, or red.',
    'We use in before autumn when we talk about this season.',
  ];
  const examples = [
    ['Leaves fall in autumn.', '樹葉在秋天落下。'],
    ['We walk in the park in autumn.', '我們在秋天到公園散步。'],
    ['Autumn comes after summer.', '秋天在夏天之後到來。'],
  ];
  const entry = { id, guid, word, parts_of_speech: ['n'], definition: '秋天；夏季與冬季之間的季節。',
    level: { cefr: null, tw_7000: null, list: null }, category: [], scenario: [],
    explains: explains.map(en => ({ guid: uuid5(`scenarios:time-prepositions:explain:${JSON.stringify([word, en])}`), en })),
    examples: examples.map(([en, zh]) => ({ guid: uuid5(`scenarios:time-prepositions:example:${JSON.stringify([word, en, zh])}`), en, zh })) };
  if (!matches.length) {
    if (source.entries.some(item => item.id === id || item.guid === guid)) throw new Error('autumn id／GUID 已占用，拒絕覆寫');
    source.entries.push(structuredClone(entry));
  } else if (json(matches[0]) !== json(entry)) throw new Error('autumn 已有內容不同，須人工審閱，不自動覆寫');
  return entry;
}

// 只接受逐項人工審閱的文法屈折形；優先於同形異義詞 means（手段，名詞）。
const aliases = {
  years: 'year', months: 'month', seasons: 'season', parts: 'part', days: 'day', dates: 'date',
  words: 'word', means: 'mean', shows: 'show', tells: 'tell', hours: 'hour', been: 'be',
  started: 'start', continues: 'continue', working: 'work', happens: 'happen', lasts: 'last',
  phrases: 'phrase', these: 'this', us: 'we', earlier: 'early', later: 'late',
};

const basicsSentences = [
  ['Look at three words: in, on, and at.', '看看這三個字：in、on 和 at。'],
  ['Use in with years, months, and seasons.', '年、月和季節使用 in。'],
  ['We say in winter and in autumn.', '我們說 in winter（在冬天）和 in autumn（在秋天）。'],
  ['We also say in 2024 and in April.', '我們也說 in 2024（在二〇二四年）和 in April（在四月）。'],
  ['For parts of the day, say in the morning, in the afternoon, and in the evening.', '一天中的時段可以說 in the morning（在早上）、in the afternoon（在下午）和 in the evening（在傍晚或晚上）。'],
  ['Now, on.', '接著是 on。'],
  ['Use on with days and dates.', '星期和日期使用 on。'],
  ['Say on Monday and on December 25.', '說 on Monday（在星期一）和 on December 25（在十二月二十五日）。'],
  ['We also say on my birthday.', '我們也說 on my birthday（在我的生日當天）。'],
  ['For a morning on one day, say on Monday morning.', '指定某一天的早上時，可以說 on Monday morning（在星期一早上）。'],
  ['Next, at.', '接著是 at。'],
  ['Use at with a time on the clock.', '時鐘上的時間點使用 at。'],
  ['Say at five in the afternoon and at seven in the morning.', '說 at five in the afternoon（在下午五點）和 at seven in the morning（在早上七點），對應圖上的 at 5:00 p.m. 和 at 7:00 a.m.。'],
  ['We also say at noon, at midnight, and at night.', '我們也說 at noon（在中午）、at midnight（在午夜）和 at night（在夜晚）。'],
  ['These words help us talk about time.', '這些字幫助我們表達時間。'],
  ['Some time words do not need in, on, or at.', '有些時間表達不用加 in、on 或 at。'],
  ['Say this morning and next Monday.', '說 this morning（今天早上）和 next Monday（下星期一）。'],
  ['Also say last year and every day.', '也可以說 last year（去年）和 every day（每天）。'],
  ['Do not put in, on, or at before these four time phrases.', '這四種時間片語前面不加 in、on 或 at。'],
];
const extendedSentences = [
  ['Look at more words for time.', '看看更多表達時間的字。'],
  ['Before lunch means earlier than lunch.', 'before lunch 表示在午餐之前。'],
  ['After lunch means later than lunch.', 'after lunch 表示在午餐之後。'],
  ['From and to show the start and end.', 'from 和 to 分別指出起點和終點。'],
  ['Say from nine in the morning to five in the afternoon.', '說 from nine in the morning to five in the afternoon，表示從早上九點到下午五點。'],
  ['Finish by five means finish at five or earlier.', 'Finish by five 表示最晚五點完成，也可以提早完成。'],
  ['Work until five means keep working up to five.', 'Work until five 表示持續工作到五點。'],
  ['By shows when to finish, but until shows how long to keep working.', 'by 指出完成期限，until 則指出持續工作到何時。'],
  ['For two hours tells us how long.', 'for two hours 告訴我們持續多久：兩小時。'],
  ['I have been here since Monday.', '我從星期一起就一直在這裡。'],
  ['Since Monday tells us when the time started.', 'since Monday 告訴我們開始的時間是星期一。'],
  ['It continues from Monday to now.', '這個狀態從星期一持續到現在。'],
  ['We can talk during the meeting.', '我們可以在會議期間交談。'],
  ['During tells us when, but for tells us how long.', 'during 說明在哪段期間內，for 則說明持續多久。'],
  ['I will be back in two hours.', '我會在兩小時後回來。'],
  ['Here, in two hours means two hours from now.', '這裡的 in two hours 表示從現在算起兩小時後。'],
  ['I will be back within two hours.', '我會在兩小時內回來。'],
  ['Within two hours means no later than two hours from now.', 'within two hours 表示最晚在從現在算起的兩小時內。'],
  ['I can be back earlier, too.', '我也可以提早回來。'],
];

const scenes = [
  {
    key: 'time-prepositions-basics', title: '時間介系詞圖解：IN／ON／AT',
    image: 'output/imagegen/time-prepositions/01-in-on-at-landscape-v2.png',
    sentences: basicsSentences,
    targets: [
      ['in', .17, .17, '年、月、季節與一般時段：in 2024、in April、in winter、in autumn，以及 in the morning／afternoon／evening。指定某一天的早上改用 on Monday morning；夜晚慣用 at night。本圖以類別建立概念，不只依時間長短判斷。'],
      ['on', .50, .17, '星期、特定日期或特定的一天：on Monday、on December 25、on my birthday。指定某天的時段也用 on，例如 on Monday morning；一般早上則用 in the morning。'],
      ['at', .84, .17, '明確時間點及固定用法：at 5:00 p.m.（下午五點）、at 7:00 a.m.（早上七點）、at noon（中午）、at midnight（午夜）、at night（夜晚）。一般早午晚用 in the morning／afternoon／evening。'],
    ],
  },
  {
    key: 'time-prepositions-extended', title: '時間介系詞圖解：先後、持續與期限',
    image: 'output/imagegen/time-prepositions/02-more-time-prepositions-landscape-v2.png',
    sentences: extendedSentences,
    targets: [
      ['before', .09, .215, '在某時間或事件之前：before lunch（午餐前），比午餐早；與 after lunch（午餐後）對照。'],
      ['after', .255, .215, '在某時間或事件之後：after lunch（午餐後），比午餐晚；與 before lunch（午餐前）對照。'],
      ['from', .41, .215, '指出一段時間的起點，常與 to 配對：from nine in the morning to five in the afternoon（從早上九點到下午五點）。圖中 from 9:00 a.m. 是起點。'],
      ['to', .585, .215, '指出 from…to… 時間範圍的終點：from nine in the morning to five in the afternoon（從早上九點到下午五點）。本圖 to 5:00 p.m. 是終點，不是「距離五點還差幾分」的用法。'],
      ['by', .69, .215, '最晚在指定時間完成，包含提前完成：Finish by five／Finish by 5:00 p.m.（最晚下午五點完成）。不是一直做事到五點；持續到五點用 until。'],
      ['until', .69, .405, '動作或狀態持續到指定時間：Work until five／Work until 5:00 p.m.（持續工作到下午五點）。與 by 的完成期限不同；till 也可表達此義，本場不另列目標。'],
      ['for', .11, .665, '接時間長度，回答持續多久：for two hours（持續兩小時）。不指出起點；since 指起點，during 指在哪段期間內。'],
      ['since', .28, .665, '接過去起點，表示持續到參照時間；本例用現在完成式：I have been here since Monday.（我從星期一起就一直在這裡。）圖中 Monday → now 表示從星期一延續到現在。'],
      ['during', .435, .665, '在某個期間或事件內：during the meeting（在會議期間）。不單靠此詞判定活動持續多久，也不表示一定整場都在做；與 for two hours 的時間長度不同。'],
      ['in', .57, .665, '在本圖未來句 I will be back in two hours. 中，in two hours 指從現在算起「兩小時後」回來。與第一張圖 in April 等期間用法不同；也與 within 的「最晚兩小時內」有別。'],
      ['within', .775, .665, '在指定長度的時間內、不晚於終點：I will be back within two hours.（我會在兩小時內回來。）可以提早，也可以在兩小時的期限到達時回來；與 in two hours（兩小時後）對照。'],
    ],
  },
];

function uniqueEntry(source, word) {
  const entries = source.entries.filter(entry => entry.word.toLowerCase() === word.toLowerCase());
  if (entries.length !== 1) throw new Error(`詞條 ${word} 有 ${entries.length} 筆，須人工決定；不自動新增或猜測 GUID`);
  return entries[0];
}
function additionsFor(source, autumn) {
  return { entries: [...supplements.map(([word, explain, en, zh]) => {
    const entry = uniqueEntry(source, word);
    if (!entry.parts_of_speech.includes('prep')) throw new Error(`${word} 缺真實 prep 詞性`);
    return { id: entry.id, guid: entry.guid, word: entry.word, parts_of_speech: ['prep'],
      explains: [{ guid: uuid5(`scenarios:time-prepositions:explain:${JSON.stringify([word, explain])}`), en: explain }],
      examples: [{ guid: uuid5(`scenarios:time-prepositions:example:${JSON.stringify([word, en, zh])}`), en, zh }] };
  }), ...(autumn ? [autumn] : [])] };
}
function mergeAdditions(source, additions) {
  let added = 0;
  for (const incoming of additions.entries) {
    const entry = uniqueEntry(source, incoming.word);
    if (entry.guid !== incoming.guid || entry.id !== incoming.id) throw new Error(`${incoming.word} 識別漂移`);
    for (const kind of ['explains', 'examples']) {
      for (const item of incoming[kind]) {
        const previous = entry[kind].find(candidate => candidate.guid === item.guid);
        if (previous && json(previous) !== json(item)) throw new Error(`${item.guid} 已存在但內容不同，拒絕覆寫`);
        if (!previous) { entry[kind].push(item); added++; }
      }
    }
  }
  // 統計由完整來源重算；沒有新增詞，不改 metadata 或任何非目標詞。
  source.statistics.total_examples = source.entries.reduce((sum, entry) => sum + entry.examples.length, 0);
  source.statistics.total_explains = source.entries.reduce((sum, entry) => sum + entry.explains.length, 0);
  source.statistics.total_entries = source.entries.length;
  for (const [statKey, levelKey] of [['entries_by_list', 'list'], ['entries_by_cefr', 'cefr'], ['entries_by_tw_7000', 'tw_7000']]) {
    const counts = source.statistics[statKey];
    for (const key of Object.keys(counts)) counts[key] = source.entries.filter(entry => String(entry.level?.[levelKey] ?? null) === key).length;
  }
  return added;
}
function buildStory(source, scene) {
  const targetGuids = new Set(scene.targets.map(([word]) => uniqueEntry(source, word).guid));
  const sentences = scene.sentences.map(([en, zh], index) => {
    const wordLinks = scenarioStoryTokens(en).map(token => {
      const lemma = aliases[token[0].toLowerCase()] ?? token[0];
      const entry = uniqueEntry(source, lemma);
      return { surface: token[0], word: entry.word, entryGuid: entry.guid,
        isTarget: targetGuids.has(entry.guid), start: token.index, end: token.index + token[0].length };
    });
    const issues = validateScenarioWordLinkSpans(en, wordLinks, true);
    if (issues.length) throw new Error(`${scene.key} 第 ${index + 1} 句：${issues.join('；')}`);
    return { id: `s${String(index + 1).padStart(2, '0')}`, en, zh, wordLinks };
  });
  const links = sentences.flatMap(sentence => sentence.wordLinks);
  for (const guid of targetGuids) if (!links.some(link => link.entryGuid === guid)) throw new Error(`故事缺少 ${guid}`);
  return { language: 'en', translationLanguage: 'zh-Hant', textEn: sentences.map(s => s.en).join(' '),
    textZh: sentences.map(s => s.zh).join(''), sentences };
}
async function buildPackage(source, scene) {
  const imageBytes = await readFile(path.join(root, scene.image));
  if (imageBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || imageBytes.readUInt32BE(16) !== 1672 || imageBytes.readUInt32BE(20) !== 941) {
    throw new Error(`${scene.image} 應為使用者認可的 1672×941 PNG，拒絕裁切或重產`);
  }
  const image = { path: scene.image, sha256: sha256(imageBytes) };
  const story = buildStory(source, scene);
  const targets = scene.targets.map(([word, x, y, senseZh]) => {
    const entry = uniqueEntry(source, word);
    return { word: entry.word, entryGuid: entry.guid, list: entry.level?.list ?? null, teachingPos: 'prep', senseZh,
      interaction: { label: { x, y }, object: { x, y } } };
  });
  const pkg = { schemaVersion: 1, scenarioKey: scene.key, revision: 1, status: 'draft', titleZh: scene.title,
    learningMode: 'illustrated-guide', vocabularyMode: 'user-specified',
    vocabularyFilter: { system: 'list', levels: [...new Set(targets.map(t => t.list).filter(Boolean))] },
    targetCount: targets.length, targets, story,
    assets: { referenceImage: image, baseImage: { ...image, reviewed: true, containsVocabularyText: true }, storyAudio: null },
    generationPlan: {
      baseImage: { status: 'reuse-user-approved', width: 1672, height: 941, generationRequired: false },
      storyAudio: { status: 'pending-local-tts', language: 'en', textSha256: sha256(story.textEn), voice: 'Serena',
        method: 'local Qwen3-TTS', generated: false, noteZh: '僅待產音計畫；本工具不呼叫本機或遠端生成服務。' },
      wordbankAudio: { reuseExisting: true, status: 'pending-availability-check',
        entryGuids: targets.map(t => t.entryGuid), noteZh: '尚未查正式音訊 metadata／實體檔案，不推定缺音數。' },
    },
    contentReview: { status: 'offline-prepared-awaiting-ui-and-audio-review', explicitGrammarMappings: aliases,
      noteZh: '圖解底圖含答案，不提供回想；每詞一入口。索引為句內 UTF-16，不是音訊時間。',
      ...(scene.key.endsWith('basics') ? { vocabularyNoteZh: '旁白保留圖上 in autumn；支援詞 autumn 以完整離線增量補入 canonical，分級三欄 null。日期保留 December 25；數字不是既有 tokenizer 的字母 token。' } : {}) },
  };
  let old;
  try { old = await readJson(`docs/scenarios/packages/${scene.key}-r1/scenario.json`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (old?.assets?.storyAudio) {
    const audio = old.assets.storyAudio;
    if (audio.textSha256 !== sha256(story.textEn)) throw new Error(`${scene.key} 已有旁白與目前故事不同，拒絕覆寫`);
    // 由現行 checker 核對安全路徑、實體檔案 hash、語言與 textSha256。
    pkg.assets.storyAudio = audio;
    if (old.generationPlan?.storyAudio) pkg.generationPlan.storyAudio = old.generationPlan.storyAudio;
    const check = await validateScenarioPackage(pkg, { repoRoot: root });
    if (!check.valid) throw new Error(`${scene.key} 既有旁白／套件不符：${check.errors.join('；')}`);
  }
  if (old) {
    // 既有教材只核對核心內容，不重建生成／人工審閱 metadata。
    for (const key of ['schemaVersion', 'scenarioKey', 'revision', 'status', 'titleZh', 'learningMode',
      'vocabularyMode', 'vocabularyFilter', 'targetCount', 'targets', 'story']) {
      if (json(old[key]) !== json(pkg[key])) throw new Error(`${scene.key}.${key} 與定稿內容不同，拒絕覆寫`);
    }
    for (const kind of ['referenceImage', 'baseImage']) for (const key of ['path', 'sha256']) {
      if (old.assets?.[kind]?.[key] !== pkg.assets[kind][key]) throw new Error(`${scene.key}.${kind}.${key} 與認可圖不同`);
    }
    return { ...old, ...pkg, assets: old.assets,
      generationPlan: old.generationPlan ?? pkg.generationPlan, contentReview: old.contentReview ?? pkg.contentReview };
  }
  return pkg;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--check', '--records-only'].includes(arg)) || args.length > 1) throw new Error('用法：node scripts/scenarios/prepare-time-prepositions.mjs [--check | --records-only]');
  const checkOnly = args.includes('--check');
  const recordsOnly = args.includes('--records-only');
  const source = await readJson(sourcePath);
  const originalEntryCount = source.entries.length;
  const oldAdditionPath = `${preparation}/wordbank-additions.json`;
  let recorded;
  try { recorded = await readJson(oldAdditionPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const autumn = ensureAutumn(source, recorded);
  const additions = additionsFor(source, autumn);
  // 主對話已審閱授權：原十三詞增量原封不動，只允許追加 autumn。
  if (recorded && json(recorded) !== json(additions) &&
      !(recorded.entries.length === 13 && json(recorded.entries) === json(additions.entries.slice(0, 13)))) {
    throw new Error('已記錄的增量與工具不同，須人工審閱，不自動改寫歷史');
  }
  const added = mergeAdditions(source, additions);
  const packages = await Promise.all(scenes.map(scene => buildPackage(source, scene)));
  if (checkOnly || recordsOnly) {
    if (source.entries.length !== originalEntryCount) throw new Error('canonical 缺 autumn 支援詞；先執行備料');
    if (added) throw new Error(`canonical 缺 ${added} 筆子項；先執行備料`);
    if (!recorded) throw new Error('缺 wordbank-additions.json');
    for (const pkg of packages) {
      const actual = await readJson(`docs/scenarios/packages/${pkg.scenarioKey}-r1/scenario.json`);
      if (json(actual) !== json(pkg)) throw new Error(`${pkg.scenarioKey} 套件與可重跑備料不同`);
    }
  } else {
    // 全部 GUID 與素材檢查成功才寫；先保存單次增量，再合併 canonical。
    await save(oldAdditionPath, additions);
    await save(sourcePath, source);
    for (const pkg of packages) {
      const destination = `docs/scenarios/packages/${pkg.scenarioKey}-r1/scenario.json`;
      let old;
      try { old = await readJson(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await save(destination, pkg);
    }
  }
  const checks = [];
  for (const pkg of packages) {
    const result = await validateScenarioPackage(pkg, { repoRoot: root });
    checks.push({ scenarioKey: pkg.scenarioKey, packageSha256: sha256(json(pkg)), textSha256: sha256(pkg.story.textEn),
      sentenceCount: pkg.story.sentences.length, tokenCount: scenarioStoryTokens(pkg.story.textEn).length,
      targetCount: pkg.targetCount, result });
  }
  const previousBatch = await optionalJson(`${preparation}/batch.json`);
  const previousVerification = await optionalJson(`${preparation}/verification.json`);
  const finalStatus = await optionalJson(`${preparation}/final-status.json`);
  // 正式授權與執行結果以 final-status.production 為準；部署獲授權不等於本輪重建。
  const production = finalStatus?.production;
  const authorization = production?.authorization;
  const evidenceRefs = [];
  for (const file of finalStatus?.artifactPaths ?? []) {
    const bytes = await readFile(path.join(root, file));
    evidenceRefs.push({ path: file, sha256: sha256(bytes) });
  }
  const previousGenerationPlan = await optionalJson(`${preparation}/generation-plan.json`);
  const generationPlan = { ...previousGenerationPlan,
    status: previousGenerationPlan?.status ?? (packages.every(pkg => pkg.assets.storyAudio) ? 'technically-complete-awaiting-human-review' : 'audio-incomplete'),
    stories: packages.map(pkg => ({ ...previousGenerationPlan?.stories?.find(item => item.scenarioKey === pkg.scenarioKey),
      scenarioKey: pkg.scenarioKey, generated: Boolean(pkg.assets.storyAudio),
      status: previousGenerationPlan?.stories?.find(item => item.scenarioKey === pkg.scenarioKey)?.status ??
        (pkg.assets.storyAudio ? 'generated-awaiting-listening-review' : 'pending-local-tts'),
      asset: pkg.assets.storyAudio, textSha256: sha256(pkg.story.textEn) })),
    ...(finalStatus ? { targetAudio: finalStatus.targetAudio, artifactRefs: evidenceRefs,
      production: finalStatus.production, preview: finalStatus.preview } : {}) };
  const batch = { batchKey: 'time-prepositions', titleZh: '時間介系詞圖解', vocabularyMode: 'user-specified',
    learningMode: 'illustrated-guide', sceneCount: 2,
    authorization: { ...previousBatch?.authorization, offlineMaterials: true, localTts: true,
      generationThisTask: Boolean(finalStatus?.generationThisTask ?? previousBatch?.authorization?.generationThisTask),
      productionDatabase: Boolean(authorization?.productionDatabase ?? production?.databaseWritten),
      draftImport: Boolean(authorization?.draftImport ?? production?.draftImported),
      publish: Boolean(authorization?.publish ?? production?.published),
      deploy: Boolean(authorization?.deploy ?? production?.deployed),
      testDraftImport: finalStatus?.preview?.historical?.draftsImported ?? finalStatus?.preview?.draftsImported ?? false, migrations: false },
    wordbank: { ...previousBatch?.wordbank,
      reusedUniqueTargetEntries: 13, newEntryCount: autumn ? 1 : 0, explanationsAdded: autumn ? 16 : 13, examplesAdded: autumn ? 16 : 13,
      canonicalMerge: 'offline-only', productionImport: production?.databaseWritten ? 'completed-partial-delta' : 'not-performed', additionsPath: oldAdditionPath },
    recallEnabled: false, quotaNoteZh: '指定介系詞教材，不適用 n／adj／v 配額。',
    scenes: packages.map((pkg, index) => ({ ...previousBatch?.scenes?.find(scene => scene.scenarioKey === pkg.scenarioKey),
      order: index + 1, scenarioKey: pkg.scenarioKey, titleZh: pkg.titleZh,
      coreActivityZh: index === 0 ? '讀圖認識年、月、季節、日期、時刻及不用介系詞的表達' : '讀圖比較先後、起訖、期限、持續與多久之後',
      originalWords: scenes[index].targets.map(([word]) => word), revision: 1,
      posCounts: { n: 0, adj: 0, v: 0, prep: pkg.targetCount },
      packagePath: `docs/scenarios/packages/${pkg.scenarioKey}-r1/scenario.json`,
      mediaSource: pkg.assets.baseImage,
      status: production?.published ? 'published-production-awaiting-human-review' : previousBatch?.scenes?.find(scene => scene.scenarioKey === pkg.scenarioKey)?.status ??
        (pkg.assets.storyAudio ? 'technically-ready-for-preview-awaiting-human-review-and-production-import' : 'offline-prepared-audio-missing'),
      evidencePath: `${preparation}/verification.json` })) };
  const preservedBatch = { ...previousBatch, ...batch,
    ...(finalStatus ? { finalStatusPath: `${preparation}/final-status.json`,
      generationPlanPath: `${preparation}/generation-plan.json`, technicalValidation: finalStatus.technicalValidation,
      production: finalStatus.production, classification: finalStatus.classification,
      preview: finalStatus.preview, humanReview: previousBatch?.humanReview ?? finalStatus.humanReview,
      independentReview: previousBatch?.independentReview ?? finalStatus.independentReview } : {}) };
  const verification = { ...previousVerification,
    scopeZh: production?.published
      ? '離線素材與正式匯入／發布／API證據；_test預覽已失效，非完整人工品質驗收'
      : '離線套件／canonical／媒體與主對話技術驗證；含 _test 預覽，非正式 DB 或完整人工品質驗收',
    newEntryCount: autumn ? 1 : 0, uniqueSupplementedEntries: 13, childItemCount: autumn ? 32 : 26,
    checks: checks.map(check => ({ ...previousVerification?.checks?.find(item => item.scenarioKey === check.scenarioKey), ...check })),
    ...(finalStatus ? { finalStatusPath: `${preparation}/final-status.json`, artifactRefs: evidenceRefs,
      technicalValidation: finalStatus.technicalValidation, preview: finalStatus.preview, production: finalStatus.production,
      independentReview: previousVerification?.independentReview ?? finalStatus.independentReview } : {}) };
  if (checkOnly && finalStatus) {
    for (const check of checks) {
      const stored = previousVerification?.checks?.find(item => item.scenarioKey === check.scenarioKey);
      for (const key of Object.keys(check)) if (json(stored?.[key]) !== json(check[key])) throw new Error(`${check.scenarioKey} verification.${key} 過期，請 --records-only 更新`);
    }
    if (json(await optionalJson(`${preparation}/generation-plan.json`)) !== json(generationPlan)) throw new Error('generation-plan 與實際成果不同，請 --records-only 更新');
    const manifest = await readJson('data/scenario-wordbank-audio/time-prepositions/manifest.json');
    if (manifest.entries.length !== finalStatus.targetAudio.uniqueClips) throw new Error('manifest 詞音數與最終紀錄不同');
    const acoustic = await readJson(`${preparation}/audio-verification.json`);
    if (acoustic.clips !== 125 || acoustic.results.length !== 125) throw new Error('音訊驗證紀錄應含 125 段');
  }
  if (!checkOnly) {
    await save(`${preparation}/batch.json`, preservedBatch);
    await save(`${preparation}/verification.json`, verification);
    await save(`${preparation}/generation-plan.json`, generationPlan);
    await save(`${preparation}/stories.md`, packages.map(pkg => `# ${pkg.titleZh}\n\n` + pkg.story.sentences.map(s => `${s.id}. ${s.en}\n\n${s.zh}\n`).join('\n')).join('\n'));
    if (!(await optionalJson(`${preparation}/vocabulary-review.json`))) await save(`${preparation}/vocabulary-review.json`, {
      targets: packages.flatMap(pkg => pkg.targets.map(target => ({ scenarioKey: pkg.scenarioKey, ...target,
        visibleCueZh: '對應已認可圖片之分區標題、時間線或 caption 附近留白；每詞一入口，不重複例子。',
        status: 'canonical-existing-production-not-checked' }))),
      inflectionAliases: aliases, missingEntryCount: 0,
      noteZh: '圖與旁白保留 autumn；新增支援詞的離線 canonical／增量已備，不代表正式入庫。',
    });
    for (const pkg of packages) {
      // 人工紀錄由主對話／驗收者持續追加；重跑不能覆寫或降回待產音。
      const reviewPath = `docs/scenarios/packages/${pkg.scenarioKey}-r1/import-review.md`;
      try { await readFile(path.join(root, reviewPath)); continue; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const check = checks.find(item => item.scenarioKey === pkg.scenarioKey);
      await save(`docs/scenarios/packages/${pkg.scenarioKey}-r1/import-review.md`,
        `# ${pkg.titleZh}：離線審閱\n\n` +
        `- 狀態：離線教材文字／圖片已備，${pkg.assets.storyAudio ? '已保留同故事 hash 的既有旁白，聽審另驗' : '旁白待產'}；未正式匯入、發布或部署。\n` +
        `- revision：1；指定詞模式；圖解模式 illustrated-guide；${pkg.targetCount} 個 prep，n／adj／v 皆 0，不要求配額。\n` +
        `- 套件 SHA-256：${check.packageSha256}\n- 故事 SHA-256：${check.textSha256}\n` +
        `- 圖片：沿用使用者認可之 1672×941 原圖；referenceImage 與 baseImage 同源同 hash，containsVocabularyText:true。\n` +
        `- 圖片 SHA-256：${pkg.assets.baseImage.sha256}\n` +
        `- 圖解不提供看圖回想；每詞一座標入口，label／object 同點，不跨區拉線。已看原圖選位；實際桌機／手機標籤遮擋與放大操作待驗證。\n` +
        `- 故事：${check.sentenceCount} 句／${check.tokenCount} 字母 token，逐句繁中；全部目標有真實 canonical GUID，完整 UTF-16 span；不是音訊時間軸。\n` +
        `- 當下離線 checker：${check.result.valid ? `valid:true；publishReady:${check.result.publishReady}；缺件：${check.result.missing.join('、') || '無'}` : '未通過；見 ../../preparation/time-prepositions/verification.json。'}。\n` +
        `- 匯入 dry-run：未執行；${pkg.assets.storyAudio ? '素材與正式環境須另行核對' : '缺旁白，匯入器要求完整素材'}，不能以離線 checker 通過推定可匯入。\n` +
        `- 正式 DB／migrations／字庫與音訊 metadata／volume／備份／運行 API：皆未查核；本批無正式寫入授權。\n` +
        `- 本次生成：0；重用既有圖 1；${pkg.assets.storyAudio ? '已保留既有 assets.storyAudio 與 generationPlan.storyAudio，沒有重新產音' : 'assets.storyAudio:null；generationPlan 只記待本機 Qwen3-TTS／Serena 產音'}。\n` +
        `- 字庫：13 既有詞追加 26 個子項；另補 autumn 支援詞（null 分級、3 explain／3 例句）。新增詞條 ${autumn ? 1 : 0}；全部是離線增量，未正式入庫。\n` +
        `- 全文旁白與詞音：本製作子任務未產音；既有詞音尚未核對。解碼、發音聽審、播放仲裁、缺音提示均待驗。\n` +
        `- 品質可發布／已發布／程式已部署：均未宣稱；文件 read-back 與全庫測試由主對話後續執行，目前待驗。\n` +
        (pkg.scenarioKey.endsWith('basics') ? `- 圖文一致：保留 in autumn，支援詞已離線補齊；December 25 保留數字，未映射數字為假 token，實際 TTS 日期讀法待聽審。\n` : '') +
        `\n重跑：從 Repo 根目錄執行 \`node scripts/scenarios/prepare-time-prepositions.mjs\`；唯讀比對用 \`--check\`。詳見 [本批紀錄](../../preparation/time-prepositions/review.md)。\n`);
    }
  }
  console.log(json({ mode: checkOnly ? 'check' : recordsOnly ? 'records-only' : 'prepare', sourceChildItemsAppendedThisRun: added,
    newEntryCount: autumn ? 1 : 0, checks }));
  if (!checks.every(check => check.result.valid)) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
