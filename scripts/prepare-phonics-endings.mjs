// 字尾變化的限定批次備料；只有 --snapshot／--preflight 連正式庫，且交易唯讀。
// 其餘模式只操作離線檔案；不寫正式 DB／volume、不呼叫 TTS。
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflectedLessons as lessons } from '../web-learner/src/phonicsInflectedLessons.ts';
import { validatePhonicsMp3 } from './phonics-audio-quality.mjs';
import { phonicsSourceDirectory } from './phonics-audio-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const preparation = path.join(root, 'docs/phonics/preparation/endings');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (name, value) => writeFile(path.join(preparation, name), `${JSON.stringify(value, null, 2)}\n`);
const words = (lesson) => lesson.families.flatMap((family) => family.words);
const allWords = lessons.flatMap(words);
const uuid = (value) => {
  const namespace = Buffer.from('5aa9fb1ea703519e83a1290af6e0b8e4', 'hex');
  const bytes = createHash('sha1').update(namespace).update(`phonics:endings:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const text = bytes.toString('hex');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlArray = (values) => `ARRAY[${values.map(quote).join(',')}]::text[]`;
function readOnlyQuery(query) {
  const output = execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'app', '-d', 'english_learning', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN READ ONLY; ${query}; ROLLBACK;`], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const result = JSON.parse(output.trim());
  if (result.target !== 'english_learning' || result.user !== 'app' || result.readOnly !== 'on') throw new Error('正式快照目標或唯讀交易不符');
  return result;
}
function lessonPlan(lesson) {
  const jobs = new Map();
  const add = (key, kind, text) => {
    const previous = jobs.get(key);
    if (previous && (previous.text !== text || previous.kind !== kind)) throw new Error(`素材 key 衝突：${lesson.id}/${key}`);
    jobs.set(key, { key, kind, text });
  };
  words(lesson).forEach(({ word }) => add(word, 'word', word));
  lesson.sentences.forEach((sentence) => {
    add(sentence.audioKey, 'sentence', sentence.text);
    sentence.supportWords?.forEach((support) => add(support.audioKey, 'support', support.text));
  });
  return { id: lesson.id, jobs: [...jobs.values()] };
}
async function snapshot() {
  const targets = allWords.map(({ word }) => word);
  const texts = [...new Set(lessons.flatMap((lesson) => lessonPlan(lesson).jobs.map(({ text }) => text)))];
  const selected = `lower(btrim(word)) = ANY(${sqlArray(targets)})`;
  const value = readOnlyQuery(`SELECT json_build_object(
    'target',current_database(),'user',current_user,'readOnly',current_setting('transaction_read_only'),
    'capturedAt',clock_timestamp(),'connection','docker compose exec db / local socket',
    'scopeWords',${sqlArray(targets)},'totalEntries',(SELECT count(*) FROM wordbank_entries),'maxSourceId',(SELECT max(source_id) FROM wordbank_entries),
    'entries',COALESCE((SELECT json_agg(t) FROM (SELECT guid,source_id AS id,word,parts_of_speech,definition,explains,examples,level,category,scenario FROM wordbank_entries WHERE ${selected} ORDER BY source_id)t),'[]'::json),
    'audio',COALESCE((SELECT json_agg(a) FROM wordbank_audio a WHERE entry_guid IN(SELECT guid FROM wordbank_entries WHERE ${selected})),'[]'::json),
    'articleCandidates',json_build_object(
      'paragraphs',COALESCE((SELECT json_agg(t) FROM (SELECT text,en_audio_path AS path FROM paragraphs WHERE text=ANY(${sqlArray(texts)}) AND en_audio_path IS NOT NULL)t),'[]'::json),
      'words',COALESCE((SELECT json_agg(t) FROM (SELECT normalized_word AS text,en_audio_path AS path FROM words WHERE normalized_word=ANY(${sqlArray(targets)}) AND en_audio_path IS NOT NULL)t),'[]'::json),
      'examples',COALESCE((SELECT json_agg(t) FROM (SELECT en_example AS text,en_example_audio_path AS path FROM word_explanations WHERE en_example=ANY(${sqlArray(texts)}) AND en_example_audio_path IS NOT NULL)t),'[]'::json)
    ))`);
  await save('wordbank-before.json', value);
  console.log(JSON.stringify({ target: value.target, readOnly: value.readOnly, targets: targets.length, existingEntries: value.entries.length, existingAudio: value.audio.length, articleCandidates: Object.values(value.articleCandidates).reduce((sum, items) => sum + items.length, 0) }));
}
async function manifests(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && !['wordbank', 'node_modules', 'checkpoints', 'listening-evidence'].includes(entry.name)) found.push(...await manifests(filename));
    else if (entry.isFile() && /manifest\.json$/.test(entry.name)) found.push(filename);
  }
  return found;
}
async function inventory() {
  const plan = lessons.map(lessonPlan);
  await save('audio-plan.json', { version: 1, lessons: plan });
  const needed = new Set(plan.flatMap(({ jobs }) => jobs.map(({ text }) => text)));
  const filenames = [...new Set([path.join(root, 'data/wordbank-audio/manifest.json'), ...await manifests(path.join(root, 'data')), ...await manifests(path.join(root, 'web-learner/public/phonics'))])];
  const sources = [], excluded = [], seen = new Set();
  for (const filename of filenames) {
    const manifest = await json(filename);
    for (const entry of manifest.entries ?? []) {
      if (!needed.has(entry.text) || entry.textHash !== hash(entry.text) || !entry.relativePath) continue;
      const sourceFile = path.resolve(path.dirname(filename), entry.relativePath);
      if (!sourceFile.startsWith(root) || seen.has(sourceFile)) continue;
      seen.add(sourceFile);
      try {
        const metadata = await validatePhonicsMp3(sourceFile);
        const sha256 = hash(await readFile(sourceFile));
        if (entry.sha256 && entry.sha256 !== sha256) throw new Error('來源 SHA-256 不符');
        const profile = entry.sourceProfile ?? manifest.profile;
        if (!profile?.model || !profile?.voice || !profile?.lang_code) throw new Error('來源生成設定不完整');
        sources.push({ text: entry.text, kind: entry.kind, sourcePath: path.relative(root, sourceFile), assetGuid: entry.assetGuid,
          entryGuid: entry.entryGuid, profile, textHash: entry.textHash, sha256, ...metadata,
          generatedAt: entry.generatedAt, manifest: path.relative(root, filename), listeningReview: 'awaiting-human-listening' });
      } catch (error) { excluded.push({ text: entry.text, sourcePath: path.relative(root, sourceFile), reason: error.message }); }
    }
  }
  const before = await json(path.join(preparation, 'wordbank-before.json'));
  // 這批正式庫沒有既有屈折形錄音或精確文章候選；如後續有資料，先明示缺少服務檔盤點，不能偷重產。
  if (before.audio.length || Object.values(before.articleCandidates).some((items) => items.length))
    throw new Error('正式候選不為空，須先取得服務檔並補來源 metadata 後再盤點；不以缺少本機副本判為缺音。');
  await save('audio-sources.json', { version: 1, checkedAt: new Date().toISOString(), sources, excluded });
  const items = plan.flatMap((lesson) => lesson.jobs.map((job) => ({ lesson: lesson.id, ...job,
    status: sources.some((source) => source.text === job.text && (job.kind !== 'word' || source.kind === 'word')) ? 'confirmed-reuse' : 'pending-generation' })));
  await save('audio-inventory.json', { checkedAt: new Date().toISOString(), total: items.length, uniqueTexts: needed.size, items, excluded,
    formalSnapshot: 'wordbank-before.json', scope: '正式詞條/音訊/文章候選唯讀比對；本機精確文字素材經解碼/hash驗證。讀音與口音仍待人工聽審。' });
  console.log(JSON.stringify({ lessons: plan.length, total: items.length, uniqueTexts: needed.size, reuse: items.filter((item) => item.status === 'confirmed-reuse').length,
    pending: items.filter((item) => item.status === 'pending-generation').length, sourceCandidates: sources.length, excluded: excluded.length }));
}

// 本批自編詞條；每詞三個自然例句及三段含原形關係的英文解釋，不偽造分級。
const lexical = {
  cats: ['Cats are small animals that many people keep as pets.', ['The cats nap.','這些貓在小睡。'], ['Two cats sit by the door.','兩隻貓坐在門邊。'], ['I can see three cats.','我看得到三隻貓。']],
  caps: ['Caps are soft hats that often have a short brim at the front.', ['The caps are on the shelf.','這些帽子在架上。'], ['We wear caps in the sun.','我們在陽光下戴帽子。'], ['These caps are blue.','這些帽子是藍色的。']],
  maps: ['Maps are drawings that show places and help people find their way.', ['The maps are in my bag.','這些地圖在我的袋子裡。'], ['We use maps to find the park.','我們用地圖找公園。'], ['These maps show the town.','這些地圖標示了這個城鎮。']],
  cups: ['Cups are small containers used for drinking.', ['The cups are on the table.','這些杯子在桌上。'], ['Please wash these cups.','請洗這些杯子。'], ['We need two cups.','我們需要兩個杯子。']],
  pigs: ['Pigs are farm animals with short legs and a wide nose.', ['The pigs sit on the beds.','這些豬坐在床上。'], ['The pigs are in the pen.','這些豬在豬圈裡。'], ['Three pigs eat together.','三隻豬一起吃東西。']],
  dogs: ['Dogs are animals that many people keep as pets.', ['The dogs run in the park.','這些狗在公園裡跑。'], ['Two dogs play with a ball.','兩隻狗玩球。'], ['Our dogs sleep here.','我們的狗睡在這裡。']],
  pens: ['Pens are tools used for writing with ink.', ['The pens are on the desk.','這些筆在書桌上。'], ['I have two black pens.','我有兩支黑筆。'], ['Please put the pens in the box.','請把這些筆放進盒子。']],
  beds: ['Beds are pieces of furniture used for sleeping.', ['The beds are soft.','這些床很柔軟。'], ['There are two beds in the room.','房間裡有兩張床。'], ['We made the beds this morning.','我們今天早上整理了床鋪。']],
  buses: ['Buses are large vehicles that carry many passengers.', ['The buses stop here.','這些公車在這裡停靠。'], ['Two buses are at the station.','車站有兩輛公車。'], ['We take buses to school.','我們搭公車上學。']],
  dishes: ['Dishes are plates or bowls used for serving or eating food.', ['The dishes are in the boxes.','這些盤子在箱子裡。'], ['I wash the dishes after dinner.','我晚餐後洗碗盤。'], ['Put the clean dishes on the shelf.','把乾淨的盤子放到架上。']],
  wishes: ['Wishes are things that someone hopes will happen.', ['She made three wishes.','她許了三個願望。'], ['His wishes came true.','他的願望成真了。'], ['We wrote our wishes on paper.','我們把願望寫在紙上。']],
  foxes: ['Foxes are wild animals with pointed ears and a long, bushy tail.', ['The foxes run.','這些狐狸在跑。'], ['Two foxes hide in the woods.','兩隻狐狸躲在樹林裡。'], ['We saw foxes near the farm.','我們在農場附近看到了狐狸。']],
  boxes: ['Boxes are containers with flat sides used for holding things.', ['The boxes are empty.','這些箱子是空的。'], ['We put the books in boxes.','我們把書放進箱子。'], ['Three boxes are by the door.','門邊有三個箱子。']],
  matches: ['Matches are small sticks with tips that make a flame when rubbed against a suitable surface.', ['Keep matches away from children.','請把火柴放在兒童拿不到的地方。'], ['The matches are in a small box.','這些火柴在一個小盒子裡。'], ['These matches are dry.','這些火柴是乾的。']],
  catches: ['Catches means takes hold of something that is moving through the air.', ['She catches the ball.','她接住球。'], ['He catches a leaf as it falls.','他接住一片落下的葉子。'], ['The player catches the ball with both hands.','這位球員用雙手接住球。']],
  benches: ['Benches are long seats for two or more people.', ['The benches are in the park.','這些長椅在公園裡。'], ['We sit on the benches.','我們坐在長椅上。'], ['Two benches stand by the path.','小路旁有兩張長椅。']],
  tapped: ['Tapped means touched something lightly, often with a finger.', ['She tapped the desk.','她輕敲了書桌。'], ['I tapped his arm gently.','我輕輕拍了他的手臂。'], ['He tapped on the door.','他輕敲了門。']],
  packed: ['Packed means put things into a bag, box, or other container.', ['I packed my bag.','我打包好了袋子。'], ['She packed lunch for us.','她為我們裝好了午餐。'], ['We packed the books in a box.','我們把書裝進了箱子。']],
  jumped: ['Jumped means pushed off the ground with the legs and moved through the air.', ['The dog jumped.','這隻狗跳了。'], ['I jumped over the puddle.','我跳過了水窪。'], ['She jumped up to catch the ball.','她跳起來接球。']],
  filled: ['Filled means put something into a container until it was full.', ['He filled the cup with water.','他把杯子裝滿了水。'], ['We filled the box with toys.','我們把箱子裝滿了玩具。'], ['She filled the bowl with rice.','她把碗裝滿了飯。']],
  hummed: ['Hummed means sang a tune with the lips closed.', ['She hummed a song.','她哼唱了一首歌。'], ['I hummed while I worked.','我工作時哼著歌。'], ['He hummed a quiet tune.','他輕聲哼唱了一段曲調。']],
  played: ['Played means spent time enjoying a game or another fun activity.', ['I rested and played.','我休息了，也玩了。'], ['We played in the park.','我們在公園裡玩了。'], ['She played with her friends.','她和朋友們玩了。']],
  landed: ['Landed means came down onto the ground or another surface after moving through the air.', ['The plane landed safely.','飛機安全降落了。'], ['The bird landed on a branch.','鳥停落在樹枝上。'], ['The ball landed in the grass.','球落在草地裡。']],
  rested: ['Rested means stopped working or moving for a while to relax.', ['I rested and played.','我休息了，也玩了。'], ['We rested under a tree.','我們在樹下休息了。'], ['She rested after the walk.','她散步後休息了。']],
  needed: ['Needed means had to have something or required help.', ['I needed a pen.','我當時需要一支筆。'], ['She needed help with the box.','她當時需要人幫忙搬箱子。'], ['We needed more time.','我們當時需要更多時間。']],
  jumping: ['Jumping means pushing off the ground with the legs and moving through the air.', ['The dog is jumping.','這隻狗正在跳。'], ['I am jumping over a line.','我正在跳過一條線。'], ['The children are jumping together.','孩子們正在一起跳。']],
  resting: ['Resting means taking a break from work or movement.', ['She is resting on the sofa.','她正在沙發上休息。'], ['We are resting after the game.','我們比賽後正在休息。'], ['The dog is resting in the shade.','這隻狗正在陰影下休息。']],
  running: ['Running means moving quickly on foot, with steps in which both feet leave the ground.', ['The cat is running.','這隻貓正在跑。'], ['He is running in the park.','他正在公園裡跑。'], ['We are running to the gate.','我們正在跑向大門。']],
  hopping: ['Hopping means jumping on one foot or making short jumps.', ['The child is hopping on one foot.','這個孩子正在單腳跳。'], ['A rabbit is hopping across the grass.','一隻兔子正一跳一跳地穿過草地。'], ['I am hopping over a line.','我正在單腳跳過一條線。']],
  sitting: ['Sitting means resting with the body supported by a seat or another surface.', ['The cat is sitting on the mat.','這隻貓正坐在墊子上。'], ['We are sitting on a bench.','我們正坐在長椅上。'], ['She is sitting beside me.','她正坐在我旁邊。']],
  making: ['Making means creating, preparing, or producing something.', ['I am making a map.','我正在製作一張地圖。'], ['She is making a paper boat.','她正在做一艘紙船。'], ['We are making lunch.','我們正在準備午餐。']],
  riding: ['Riding means sitting on and controlling a bicycle, horse, or similar thing while it moves.', ['He is riding a bike.','他正在騎腳踏車。'], ['She is riding a horse.','她正在騎馬。'], ['We are riding our bikes to the park.','我們正騎著腳踏車前往公園。']],
  playing: ['Playing means taking part in a game or another enjoyable activity.', ['The children are playing in the park.','孩子們正在公園裡玩。'], ['I am playing with my dog.','我正在和我的狗玩。'], ['We are playing a game.','我們正在玩遊戲。']],
};
async function wordbank() {
  const canonicalPath = path.join(root, 'source/vocabulary-database.json');
  const canonical = await json(canonicalPath);
  const before = await json(path.join(preparation, 'wordbank-before.json'));
  if (before.readOnly !== 'on' || before.target !== 'english_learning' || before.scopeWords.length !== allWords.length || allWords.some(({ word }) => !before.scopeWords.includes(word))) throw new Error('正式快照未完整涵蓋本批');
  const entries = new Map(canonical.entries.map((entry) => [entry.word.toLowerCase(), entry]));
  let nextId = Math.max(before.maxSourceId, ...canonical.entries.map(({ id }) => id));
  const additions = new Map(), mappedWords = new Map(), mappedSentences = [];
  for (const item of allWords) {
    let entry = entries.get(item.word.toLowerCase());
    const formal = before.entries.find((candidate) => candidate.word.toLowerCase() === item.word.toLowerCase());
    if (formal && entry && formal.guid !== entry.guid) throw new Error(`正式與來源同字不同 GUID：${item.word}`);
    if (!entry && formal) { entry = structuredClone(formal); canonical.entries.push(entry); entries.set(item.word.toLowerCase(), entry); }
    if (!entry) {
      const info = lexical[item.word];
      if (!info || !item.inflection) throw new Error(`缺少完整詞條備料：${item.word}`);
      const noun = ['endings-s', 'endings-es'].some((id) => item.familyId.startsWith(id)) && item.word !== 'catches';
      const relation = noun ? `the plural form of ${item.inflection.baseWord}` : item.word === 'catches' ? 'the third-person singular present form of catch' : item.familyId.startsWith('endings-ed') ? `the simple past form of ${item.inflection.baseWord}` : `the -ing form of ${item.inflection.baseWord}`;
      const definition = `${item.meaning}；${noun ? `${item.inflection.baseWord} 的複數` : item.word === 'catches' ? 'catch 的現在式第三人稱單數' : item.familyId.startsWith('endings-ing') ? `${item.inflection.baseWord} 的 -ing 形式` : `${item.inflection.baseWord} 的規則過去式`}。`;
      const explanations = [info[0], `${item.word[0].toUpperCase() + item.word.slice(1)} is ${relation}.`, noun ? 'Use this plural noun when talking about more than one.' : item.word === 'catches' ? 'Use catches with he, she, it, or a singular subject when talking about a usual action.' : item.familyId.startsWith('endings-ed') ? 'Use this simple past form to describe an action or situation in the past.' : 'This -ing form can follow am, is, or are to describe an action that is happening.'];
      entry = { id: ++nextId, guid: uuid(`word:${item.word}`), word: item.word, parts_of_speech: [noun ? 'n' : 'v'], definition,
        explains: explanations.map((en) => ({ guid: uuid(`explain:${item.word}:${en}`), en })),
        examples: info.slice(1).map(([en, zh]) => ({ guid: uuid(`example:${item.word}:${JSON.stringify([en, zh])}`), en, zh })),
        level: { cefr: null, tw_7000: null, list: null }, category: [], scenario: [] };
      canonical.entries.push(entry); entries.set(item.word.toLowerCase(), entry);
    }
    mappedWords.set(entry.guid, { lesson: lessons.find((lesson) => words(lesson).includes(item)).id, key: item.word, word: item.word, text: item.word,
      kind: 'word', entryGuid: entry.guid, assetGuid: entry.guid, textHash: hash(item.word), sourceId: entry.id, baseWord: item.inflection.baseWord,
      canonicalStatus: formal ? 'existing-entry' : 'offline-only-entry' });
    if (!formal) additions.set(entry.guid, entry);
  }
  for (const lesson of lessons) for (const sentence of lesson.sentences) {
    const target = entries.get(sentence.wordKeys[0]);
    if (!target) throw new Error(`短句沒有可歸屬的本課目標詞：${lesson.id}/${sentence.id}`);
    let example = target.examples.find((candidate) => candidate.en === sentence.text);
    if (!example) {
      example = { guid: uuid(`example:${target.word}:${JSON.stringify([sentence.text, sentence.translation])}`), en: sentence.text, zh: sentence.translation };
      target.examples.push(example);
    }
    if (!additions.has(target.guid)) additions.set(target.guid, { id: target.id, guid: target.guid, word: target.word, examples: [example] });
    mappedSentences.push({ lesson: lesson.id, key: sentence.audioKey, word: target.word, text: sentence.text, kind: 'example',
      entryGuid: target.guid, assetGuid: example.guid, textHash: hash(sentence.text), sourceId: target.id });
  }
  await save('wordbank-phonics-mapping.json', { version: 1, words: [...mappedWords.values()], sentences: mappedSentences });
  await save('wordbank-additions.json', { entries: [...additions.values()] });
  const counts = (key) => canonical.entries.reduce((result, entry) => { const value = String(entry.level[key]); result[value] = (result[value] ?? 0) + 1; return result; }, {});
  Object.assign(canonical.statistics, { total_entries: canonical.entries.length, total_examples: canonical.entries.reduce((sum, entry) => sum + entry.examples.length, 0), total_explains: canonical.entries.reduce((sum, entry) => sum + entry.explains.length, 0), entries_by_list: counts('list'), entries_by_tw_7000: counts('tw_7000'), entries_by_cefr: counts('cefr'), entries_with_fewer_than_3_examples: canonical.entries.filter((entry) => entry.examples.length < 3).length });
  canonical.metadata.phonics_endings_supplement = { prepared_on: '2026-11-02', new_entries: [...mappedWords.values()].filter((item) => item.canonicalStatus === 'offline-only-entry').length,
    lesson_examples: mappedSentences.length, production_import: '未正式匯入；未部署。', level_note: '本批屈折形無獨立分級依據，level三欄留null。', guid_note: '沿用字庫 UUID v5 namespace，以 phonics:endings 前綴產生穩定詞條與子項識別。' };
  await writeFile(canonicalPath, `${JSON.stringify(canonical, null, 2)}\n`);
  console.log(JSON.stringify({ words: mappedWords.size, examples: mappedSentences.length, affectedEntries: additions.size, newEntries: [...mappedWords.values()].filter((item) => item.canonicalStatus === 'offline-only-entry').length, canonicalEntries: canonical.entries.length }));
}
async function preflight() {
  const { entries } = await json(path.join(preparation, 'wordbank-additions.json'));
  const before = await json(path.join(preparation, 'wordbank-before.json'));
  const fresh = entries.filter((entry) => !before.entries.some((record) => record.guid === entry.guid));
  const ids = fresh.map(({ id }) => id), guids = entries.flatMap((entry) => [entry.guid, ...(entry.explains ?? []).map(({ guid }) => guid), ...(entry.examples ?? []).map(({ guid }) => guid)]);
  const result = readOnlyQuery(`SELECT json_build_object('target',current_database(),'user',current_user,'readOnly',current_setting('transaction_read_only'),'checkedAt',clock_timestamp(),
    'checkedSourceIds',${sqlArray(ids)},'checkedGuids',${guids.length},
    'entryConflicts',(SELECT count(*) FROM wordbank_entries WHERE source_id::text=ANY(${sqlArray(ids)}) OR guid::text=ANY(${sqlArray(guids)})),
    'childGuidConflicts',(SELECT count(*) FROM wordbank_entries e WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(e.explains || e.examples) child WHERE child->>'guid'=ANY(${sqlArray(guids)}))),
    'audioGuidConflicts',(SELECT count(*) FROM wordbank_audio WHERE asset_guid::text=ANY(${sqlArray(guids)})))`);
  await save('wordbank-guid-preflight.json', result);
  if (result.entryConflicts || result.childGuidConflicts || result.audioGuidConflicts) throw new Error('本批正式GUID/source id preflight出現衝突，停止。');
  console.log(JSON.stringify(result));
}
async function verify() {
  const items = [];
  for (const lesson of lessons) {
    const directory = await phonicsSourceDirectory(root, lesson.id);
    const manifest = await json(path.join(directory, 'manifest.json'));
    for (const job of lessonPlan(lesson).jobs) {
      const entry = manifest.entries.find((candidate) => candidate.assetGuid === `phonics-${lesson.id}-${job.key}`);
      if (!entry || entry.text !== job.text || entry.textHash !== hash(job.text)) throw new Error(`素材遺失或文字不符：${lesson.id}/${job.key}`);
      const file = path.resolve(directory, entry.relativePath);
      if (!file.startsWith(`${directory}${path.sep}`)) throw new Error('素材路徑越界');
      const metadata = await validatePhonicsMp3(file);
      const sha256 = hash(await readFile(file));
      if (entry.sha256 !== sha256) throw new Error(`素材 hash 不符：${file}`);
      items.push({ lesson: lesson.id, ...job, sha256, ...metadata, origin: entry.origin, sourceProfile: entry.sourceProfile ?? manifest.profile, listeningReview: 'awaiting-human-listening' });
    }
  }
  const report = { verifiedAt: new Date().toISOString(), total: items.length, reused: items.filter((item) => item.origin?.type === 'reused-local-audio').length,
    generated: items.filter((item) => item.origin?.type === 'generated-local-qwen3-tts').length, listeningReview: 'awaiting-human-listening', items };
  await save('audio-verification.json', report);
  console.log(JSON.stringify({ ...report, items: `${items.length} 個檔案通過完整解碼、文字 hash、SHA-256 與近靜音初篩。` }));
}
await mkdir(preparation, { recursive: true });
const modes = { '--snapshot': snapshot, '--inventory': inventory, '--wordbank': wordbank, '--preflight': preflight, '--verify': verify };
const args = process.argv.slice(2);
if (args.length !== 1 || !Object.hasOwn(modes, args[0])) throw new Error('請指定 --snapshot、--inventory、--wordbank、--preflight 或 --verify；只有 --snapshot／--preflight 會連正式庫，交易唯讀，絕不寫DB。');
await modes[args[0]]();
