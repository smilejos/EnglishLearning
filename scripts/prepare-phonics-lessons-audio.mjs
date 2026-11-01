// 五個短母音的離線備音；不寫 DB，完整保留來源設定，僅缺件才呼叫本機 TTS。
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_PROFILE, generateBatch, withBatchLock } from './generate-wordbank-audio.mjs';
import { validatePhonicsMp3 } from './phonics-audio-quality.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const preparation = path.join(root, 'docs/phonics/preparation/short-vowels');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

export function localTtsEndpoint(value = 'http://127.0.0.1:8000/v1/audio/speech') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password)
    throw new Error('只允許本機 HTTP Qwen3-TTS 服務');
  return url.href;
}

export function planLesson(lesson) {
  if (!/^short-[aeiou]$/.test(lesson.id)) throw new Error('無效的短母音課程');
  const seen = new Set();
  return lesson.jobs.map(({ key, kind, text }) => {
    if (!/^[a-z0-9-]+$/.test(key) || seen.has(key)) throw new Error('音訊 key 無效或重複');
    if (!['word', 'sentence', 'support'].includes(kind) || typeof text !== 'string' || !text.trim()) throw new Error('音訊需求格式錯誤');
    seen.add(key);
    return { assetGuid: `phonics-${lesson.id}-${key}`, kind, text: text.trim(), textHash: hash(text.trim()), relativePath: `${key}.mp3` };
  });
}

export function matchingSource(job, sources) {
  return sources.find((source) => source.text === job.text && source.textHash === job.textHash
    && (job.kind === 'word' ? source.kind === 'word' : job.kind === 'support' || source.kind !== 'word'));
}

export async function keepExistingRecording(filename, existing, { validate = validatePhonicsMp3, read = readFile } = {}) {
  try { await validate(filename); }
  catch { return false; } // 缺檔、不可解碼或近靜音才可由已驗證來源／本機生成補缺。
  const actualHash = hash(await read(filename));
  if (!existing || (existing.sha256 && existing.sha256 !== actualHash))
    throw new Error(`已有有效音檔但 metadata 不符，停止以避免覆寫：${filename}`);
  return true;
}

export async function selectValidSource(job, sources, verify, onExcluded = () => {}) {
  for (const source of sources) {
    if (!matchingSource(job, [source])) continue;
    try { return { source, metadata: await verify(source) }; }
    catch (error) { onExcluded(source, error); }
  }
  return null;
}

async function prepareLesson(lesson, sources, mode, endpoint) {
  const jobs = planLesson(lesson);
  const outputDir = path.join(root, 'web-learner/public/phonics', lesson.id);
  let manifest;
  try { manifest = await json(path.join(outputDir, 'manifest.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; manifest = { version: 1, profile: DEFAULT_PROFILE, entries: [] }; }
  const plan = jobs.map((job) => ({ ...job, existing: manifest.entries.find((entry) => entry.assetGuid === job.assetGuid && entry.textHash === job.textHash && entry.relativePath === job.relativePath), source: matchingSource(job, sources) }));
  if (mode === 'dry-run') return { lesson: lesson.id, total: jobs.length, jobs: plan.map(({ existing, source, ...job }) => ({ ...job, existingPath: existing?.relativePath ?? null, reusableSource: source?.sourcePath ?? null })) };
  await mkdir(outputDir, { recursive: true });
  return withBatchLock(outputDir, async () => {
    // 批次工具使用此 profile 生成缺件；重用檔的實際 profile 另保留於 sourceProfile。
    if (JSON.stringify(manifest.profile) !== JSON.stringify(DEFAULT_PROFILE)) throw new Error('教材輸出已有不同的預設生成設定');
    const errors = [];
    for (const { existing, source: plannedSource, ...job } of plan) {
      const target = path.join(outputDir, job.relativePath);
      if (await keepExistingRecording(target, existing)) continue;
      // 不採用已變更文字的 metadata；generateBatch 會為缺件生成。
      manifest.entries = manifest.entries.filter((entry) => entry.assetGuid !== job.assetGuid);
      const reusable = await selectValidSource(job, sources, async (candidate) => {
        const sourceFile = path.resolve(root, candidate.sourcePath);
        if (!sourceFile.startsWith(`${root}${path.sep}`)) throw new Error('來源必須位於專案內');
        const metadata = await validatePhonicsMp3(sourceFile);
        if (candidate.sha256 !== hash(await readFile(sourceFile))) throw new Error('來源 SHA-256 不符');
        return metadata;
      }, (candidate, error) => errors.push({ text: job.text, reason: error.message, candidate: candidate.sourcePath }));
      if (!reusable) continue;
      const { source, metadata } = reusable;
      const sourceFile = path.resolve(root, source.sourcePath);
      if (sourceFile !== target) await copyFile(sourceFile, target);
      manifest.entries.push({ ...job, ...metadata, generatedAt: source.generatedAt,
        sha256: source.sha256, sourceProfile: source.profile, entryGuid: source.entryGuid,
        origin: { type: 'reused-local-audio', path: source.sourcePath, assetGuid: source.assetGuid, kind: source.kind },
        listeningReview: 'awaiting-human-listening' });
    }
    await save(path.join(outputDir, 'manifest.json'), manifest);
    if (mode === 'generate') {
      const report = await generateBatch({ jobs, outputDir, endpoint, retries: 0, validate: validatePhonicsMp3 });
      if (report.failed.length || report.generated + report.skipped !== jobs.length) throw new Error(`${lesson.id} 音訊尚未全部準備完成`);
    }
    manifest = await json(path.join(outputDir, 'manifest.json'));
    for (const entry of manifest.entries) {
      entry.sha256 = hash(await readFile(path.join(outputDir, entry.relativePath)));
      entry.sourceProfile ??= manifest.profile;
      entry.origin ??= { type: 'generated-local-qwen3-tts', endpoint };
      entry.listeningReview ??= 'awaiting-human-listening';
    }
    manifest.lesson = lesson.id;
    manifest.preparedAt = new Date().toISOString();
    manifest.scope = '整字、短句與支援詞示範；不包含孤立音素或逐音拼合錄音。';
    manifest.listeningReview = 'awaiting-human-listening';
    manifest.excludedCandidates = errors;
    await save(path.join(outputDir, 'manifest.json'), manifest);
    return { lesson: lesson.id, total: jobs.length, ready: jobs.filter((job) => manifest.entries.some((entry) => entry.assetGuid === job.assetGuid && entry.textHash === job.textHash)).length, excludedCandidates: errors };
  });
}

export async function main(args = process.argv.slice(2)) {
  let mode = 'dry-run';
  let selected = 'all';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--generate' || args[i] === '--reuse-only') mode = args[i].slice(2);
    else if (args[i] === '--lesson' && args[i + 1]) selected = args[++i];
    else throw new Error('僅接受 --lesson short-a/short-e/short-i/short-o/short-u/all、--reuse-only、--generate');
  }
  const endpoint = localTtsEndpoint(process.env.PHONICS_TTS_ENDPOINT);
  if (mode === 'generate' && process.env.PHONICS_REAL_TTS !== '1') throw new Error('本機產音須 PHONICS_REAL_TTS=1');
  const { lessons } = await json(path.join(preparation, 'audio-plan.json'));
  const { sources } = await json(path.join(preparation, 'audio-sources.json'));
  if (selected !== 'all' && !lessons.some((lesson) => lesson.id === selected)) throw new Error('課程不存在');
  for (const lesson of lessons.filter((item) => selected === 'all' || item.id === selected))
    console.log(JSON.stringify(await prepareLesson(lesson, sources, mode, endpoint), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
