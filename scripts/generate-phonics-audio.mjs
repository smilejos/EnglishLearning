// 自然發音短母音 a 試作：只使用本機 Qwen3-TTS，預設 dry-run，不寫資料庫。
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROFILE, generateBatch, validateMp3, withBatchLock } from './generate-wordbank-audio.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'web-learner/public/phonics/short-a');
const sourceRoot = path.join(root, 'data/wordbank-audio');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
// 保留第一版及十詞版既有素材，再補字族版缺件；不要因改教材刪除舊音。
const words = ['cat', 'mat', 'sat', 'map', 'tap', 'cap', 'bat', 'bag', 'can', 'fan', 'man', 'pan', 'clap', 'flag', 'hand', 'stamp', 'hat', 'ran', 'nap'];
const jobs = [
  ...words.map((word) => ({ id: word, kind: 'word', text: word })),
  { id: 'sentence-1', kind: 'sentence', text: 'A cat sat.' },
  { id: 'sentence-2', kind: 'sentence', text: 'A cat sat on a mat.' },
  { id: 'sentence-family-2', kind: 'sentence', text: 'A man sat on a mat.' },
].map(({ id, ...job }) => ({ ...job, assetGuid: `phonics-short-a-${id}`, textHash: sha256(job.text), relativePath: `${id}.mp3` }));

async function readJson(filename, fallback) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--generate')) throw new Error('只接受 --generate；不帶參數則預覽計畫');
  const source = await readJson(path.join(sourceRoot, 'manifest.json'), null);
  const compatible = source && JSON.stringify(source.profile) === JSON.stringify(DEFAULT_PROFILE);
  const candidates = new Map(jobs.map((job) => [job.assetGuid,
    compatible ? source.entries.find((entry) => entry.kind === 'word' && entry.textHash === job.textHash) : null]));
  if (!args.includes('--generate')) {
    console.log(JSON.stringify({ dryRun: true, output: destination, profile: DEFAULT_PROFILE,
      jobs: jobs.map((job) => ({ ...job, reusableSource: candidates.get(job.assetGuid)?.relativePath ?? null })) }, null, 2));
    return;
  }
  if (process.env.PHONICS_REAL_TTS !== '1') throw new Error('本機產音須 PHONICS_REAL_TTS=1');
  const endpoint = process.env.PHONICS_TTS_ENDPOINT ?? 'http://127.0.0.1:8000/v1/audio/speech';
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password)
    throw new Error('只允許本機 HTTP Qwen3-TTS 服務');
  await mkdir(destination, { recursive: true });
  await withBatchLock(destination, async () => {
    let manifest = await readJson(path.join(destination, 'manifest.json'), { version: 1, profile: DEFAULT_PROFILE, entries: [] });
    if (JSON.stringify(manifest.profile) !== JSON.stringify(DEFAULT_PROFILE)) throw new Error('既有 manifest 使用不同音訊設定');
    for (const job of jobs) {
      if (manifest.entries.some((entry) => entry.assetGuid === job.assetGuid)) continue;
      const candidate = candidates.get(job.assetGuid);
      if (!candidate) continue;
      const sourceFile = path.join(sourceRoot, candidate.relativePath);
      let metadata;
      try { metadata = await validateMp3(sourceFile); }
      catch (error) { console.log(`舊音檔無效，改由本機生成：${job.text}（${error.message}）`); continue; }
      await copyFile(sourceFile, path.join(destination, job.relativePath));
      manifest.entries.push({ ...job, ...metadata, generatedAt: candidate.generatedAt,
        preparedAt: new Date().toISOString(), origin: { type: 'reused-local-qwen3-tts', path: path.relative(root, sourceFile), assetGuid: candidate.assetGuid } });
    }
    await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const report = await generateBatch({ jobs, outputDir: destination, endpoint, retries: 0 });
    if (report.failed.length || report.generated + report.skipped !== jobs.length) throw new Error('本次自然發音音訊未全部準備完成');
    manifest = await readJson(path.join(destination, 'manifest.json'));
    for (const entry of manifest.entries) {
      entry.origin ??= { type: 'generated-local-qwen3-tts', endpoint };
      entry.sha256 = sha256(await readFile(path.join(destination, entry.relativePath)));
      entry.listeningReview ??= 'awaiting-human-listening';
    }
    manifest.lesson = 'short-a';
    manifest.preparedAt = new Date().toISOString();
    manifest.listeningReview = 'awaiting-human-listening';
    manifest.scope = '整字與短句示範；沒有可宣稱已驗收的孤立音素或逐音拼合錄音。';
    manifest.notes = [
      'a、on 為短句中的額外常用詞；a 在自然句中通常使用弱讀，不應當作本課 /æ/ 示範。',
      '字母 c 在本課單字對應 /k/，字母名稱不能代替音素。',
      'MP3 完整解碼通過只代表檔案有效；自然發音教學品質仍需人工試聽。',
    ];
    await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
