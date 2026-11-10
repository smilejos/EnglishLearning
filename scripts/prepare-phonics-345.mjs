// 第三至五章離線備料：只讀已取得的正式快照；不連 DB、不呼叫生成服務。
// 執行：node --import tsx scripts/prepare-phonics-345.mjs --inventory|--wordbank|--verify
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { blendLessons } from '../web-learner/src/phonicsBlendLessons.ts';
import { digraphLessons } from '../web-learner/src/phonicsDigraphLessons.ts';
import { rControlledLessons } from '../web-learner/src/phonicsRControlledLessons.ts';
import { validatePhonicsMp3 } from './phonics-audio-quality.mjs';
import { phonicsSourceDirectory } from './phonics-audio-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const preparation = path.join(root, 'docs/phonics/preparation/phonics-345');
const lessons = [...blendLessons, ...digraphLessons, ...rControlledLessons];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (name, value) => writeFile(path.join(preparation, name), `${JSON.stringify(value, null, 2)}\n`);
const words = (lesson) => lesson.families.flatMap((family) => family.words);
const uuid = (value) => {
  const namespace = Buffer.from('5aa9fb1ea703519e83a1290af6e0b8e4', 'hex');
  const bytes = createHash('sha1').update(namespace).update(`phonics:phonics-345:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const text = bytes.toString('hex');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
};
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
  await save('audio-sources.json', { version: 1, checkedAt: new Date().toISOString(), sources, excluded });
  const items = plan.flatMap((lesson) => lesson.jobs.map((job) => ({ lesson: lesson.id, ...job,
    status: sources.some((source) => source.text === job.text && (job.kind !== 'word' || source.kind === 'word')) ? 'confirmed-reuse' : 'pending-generation' })));
  await save('audio-inventory.json', { checkedAt: new Date().toISOString(), total: items.length, items, excluded,
    scope: '只盤點精確文字候選並驗證檔案；發音與口音仍待人工聽審。' });
  console.log(JSON.stringify({ lessons: plan.length, total: items.length, reuse: items.filter((item) => item.status === 'confirmed-reuse').length,
    pending: items.filter((item) => item.status === 'pending-generation').length, sourceCandidates: sources.length, excluded: excluded.length }));
}
async function wordbank() {
  const canonicalPath = path.join(root, 'source/vocabulary-database.json');
  const canonical = await json(canonicalPath);
  const before = await json(path.join(preparation, 'wordbank-before.json'));
  const entries = new Map(canonical.entries.map((entry) => [entry.word.toLowerCase(), entry]));
  const missing = [...new Set(lessons.flatMap((lesson) => words(lesson).map(({ word }) => word)).filter((word) => !entries.has(word.toLowerCase())))];
  if (missing.length) throw new Error(`教材缺少共用詞條，須先補完整詞條：${missing.join(', ')}`);
  const mappedWords = new Map(), mappedSentences = [], additions = new Map();
  for (const lesson of lessons) {
    for (const item of words(lesson)) {
      const entry = entries.get(item.word.toLowerCase());
      if (!mappedWords.has(entry.guid)) mappedWords.set(entry.guid, { lesson: lesson.id, key: item.word, word: item.word, text: item.word,
        kind: 'word', entryGuid: entry.guid, assetGuid: entry.guid, textHash: hash(item.word), sourceId: entry.id,
        canonicalStatus: before.entries.some((record) => record.guid === entry.guid) ? 'existing-entry' : 'offline-only-entry' });
      if (!before.entries.some((record) => record.guid === entry.guid) && !additions.has(entry.guid)) additions.set(entry.guid, structuredClone(entry));
    }
    for (const sentence of lesson.sentences) {
      const target = sentence.wordKeys.map((key) => entries.get(key.toLowerCase())).find((entry) => entry && mappedWords.get(entry.guid)?.lesson === lesson.id);
      if (!target) throw new Error(`短句沒有可歸屬的本課目標詞：${lesson.id}/${sentence.id}`);
      let example = target.examples.find((candidate) => candidate.en === sentence.text);
      if (!example) {
        example = { guid: uuid(`${target.guid}:example:${sentence.text}`), en: sentence.text, zh: sentence.translation };
        target.examples.push(example);
      }
      const delta = additions.get(target.guid) ?? { id: target.id, guid: target.guid, word: target.word, examples: [] };
      if (!delta.examples.some((candidate) => candidate.guid === example.guid)) delta.examples.push(example);
      additions.set(target.guid, delta);
      mappedSentences.push({ lesson: lesson.id, key: sentence.audioKey, word: target.word, text: sentence.text, kind: 'example',
        entryGuid: target.guid, assetGuid: example.guid, textHash: hash(sentence.text), sourceId: target.id });
    }
  }
  await save('wordbank-phonics-mapping.json', { version: 1, words: [...mappedWords.values()], sentences: mappedSentences });
  await save('wordbank-additions.json', { entries: [...additions.values()] });
  canonical.statistics.total_entries = canonical.entries.length;
  canonical.statistics.total_examples = canonical.entries.reduce((sum, entry) => sum + entry.examples.length, 0);
  canonical.statistics.total_explains = canonical.entries.reduce((sum, entry) => sum + entry.explains.length, 0);
  canonical.metadata.phonics_345_supplement = { prepared_on: '2026-11-02', new_entries: [...mappedWords.values()].filter((item) => item.canonicalStatus === 'offline-only-entry').length,
    lesson_examples: mappedSentences.length, production_import: '未正式匯入；未部署。', guid_note: '沿用字庫 UUID v5 namespace，以 phonics:phonics-345 前綴產生穩定例句識別。' };
  await writeFile(canonicalPath, `${JSON.stringify(canonical, null, 2)}\n`);
  console.log(JSON.stringify({ words: mappedWords.size, examples: mappedSentences.length, affectedEntries: additions.size, canonicalEntries: canonical.entries.length }));
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
      items.push({ lesson: lesson.id, ...job, sha256, ...metadata, origin: entry.origin,
        sourceProfile: entry.sourceProfile ?? manifest.profile, listeningReview: 'awaiting-human-listening' });
    }
  }
  const report = { verifiedAt: new Date().toISOString(), total: items.length,
    reused: items.filter((item) => item.origin?.type === 'reused-local-audio').length,
    generated: items.filter((item) => item.origin?.type === 'generated-local-qwen3-tts').length,
    listeningReview: 'awaiting-human-listening', items };
  await save('audio-verification.json', report);
  console.log(JSON.stringify({ ...report, items: `${items.length} 個檔案通過完整解碼、文字 hash、SHA-256 與近靜音初篩。` }));
}
await mkdir(preparation, { recursive: true });
const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--inventory', '--wordbank', '--verify'].includes(mode[0])) throw new Error('請指定 --inventory、--wordbank 或 --verify；只在離線檔案操作。');
await ({ '--inventory': inventory, '--wordbank': wordbank, '--verify': verify })[mode[0]]();
