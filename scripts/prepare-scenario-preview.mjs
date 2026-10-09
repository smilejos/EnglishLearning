#!/usr/bin/env node
// 離線預覽素材準備：不連資料庫、不呼叫生成 API。
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScenarioPackage } from './check-scenario-package.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const inside = (base, file) => {
  const relative = path.relative(base, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** 來源詞條先完整核對，再選擇有效音檔；無效或缺音一律回傳 null。 */
export async function buildScenarioPreview({ pkg, sourceEntries, manifest, audioRoot, outputAudioDir }) {
  const byGuid = new Map(sourceEntries.map((entry) => [entry.guid, entry]));
  const required = [...pkg.targets, ...pkg.story.sentences.flatMap((sentence) => sentence.wordLinks)];
  for (const item of required) {
    if (!byGuid.has(item.entryGuid) || byGuid.get(item.entryGuid).word !== item.word) {
      throw new Error(`情境詞條與來源不符：${item.entryGuid}`);
    }
  }
  const targetGuids = new Set(pkg.targets.map((target) => target.entryGuid));
  const entryGuids = [...new Set(required.map((item) => item.entryGuid))];
  const assets = Array.isArray(manifest?.entries) ? manifest.entries : [];
  let realAudioRoot;
  try { realAudioRoot = await realpath(audioRoot); } catch { realAudioRoot = null; }
  const files = new Map();
  let rejectedAssets = 0;

  async function audioKey(entry, kind, assetGuid, text) {
    if (typeof text !== 'string' || !text.trim() || !uuid.test(assetGuid)) return null;
    const candidates = assets.filter((asset) => asset.entryGuid === entry.guid && asset.kind === kind && asset.assetGuid === assetGuid);
    for (const asset of candidates) {
      try {
        if (!realAudioRoot || asset.text !== text.trim() || asset.textHash !== hash(text.trim()) ||
            !Number.isInteger(asset.bytes) || asset.bytes <= 0 || typeof asset.relativePath !== 'string' ||
            !/^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(asset.relativePath) ||
            !asset.relativePath.endsWith(`/${assetGuid}.mp3`)) throw new Error('音檔 metadata 不符');
        const file = await realpath(path.join(audioRoot, asset.relativePath));
        const metadata = await stat(file);
        if (!inside(realAudioRoot, file) || !metadata.isFile() || metadata.size !== asset.bytes) throw new Error('音檔路徑或大小不符');
        const key = `${assetGuid}.mp3`;
        files.set(key, file);
        return key;
      } catch { rejectedAssets += 1; }
    }
    return null;
  }

  const entries = [];
  for (const guid of entryGuids) {
    const entry = byGuid.get(guid);
    const target = targetGuids.has(guid);
    entries.push({
      guid, word: entry.word, list: entry.level?.list ?? null,
      partsOfSpeech: entry.parts_of_speech ?? [], definition: entry.definition ?? '',
      explains: await Promise.all((entry.explains ?? []).map(async (explanation) => ({
        guid: explanation.guid, en: explanation.en,
        audioKey: target ? await audioKey(entry, 'explanation', explanation.guid, explanation.en) : null,
      }))),
      examples: await Promise.all((entry.examples ?? []).map(async (example) => ({
        guid: example.guid, en: example.en, zh: example.zh,
        audioKey: target ? await audioKey(entry, 'example', example.guid, example.en) : null,
      }))),
      wordAudioKey: await audioKey(entry, 'word', guid, entry.word),
    });
  }
  if (outputAudioDir) {
    await mkdir(outputAudioDir, { recursive: true });
    for (const [key, file] of files) await copyFile(file, path.join(outputAudioDir, key));
  }
  const data = {
    scenarioKey: pkg.scenarioKey, titleZh: pkg.titleZh,
    story: { textEn: pkg.story.textEn, textZh: pkg.story.textZh, sentences: pkg.story.sentences },
    targets: pkg.targets, entries,
  };
  const stats = {
    targets: pkg.targets.length, entries: entries.length, audioFiles: files.size, rejectedAssets,
    targetsWithWordAudio: entries.filter((entry) => targetGuids.has(entry.guid) && entry.wordAudioKey).length,
    targetsMissingWordAudio: entries.filter((entry) => targetGuids.has(entry.guid) && !entry.wordAudioKey).map((entry) => entry.word),
    manifestAvailable: Array.isArray(manifest?.entries),
  };
  return { data, stats };
}

export async function prepareScenarioPreview(repoRoot = root) {
  const packageFile = path.join(repoRoot, 'docs/scenarios/packages/living-room-15-v1/scenario.json');
  const sourceFile = path.join(repoRoot, 'source/vocabulary-database.json');
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
  const validation = await validateScenarioPackage(pkg, { repoRoot, sourceFile });
  if (!validation.valid) throw new Error(`套件預檢失敗：${validation.errors.join('；')}`);
  const source = JSON.parse(await readFile(sourceFile, 'utf8'));
  const audioRoot = path.join(repoRoot, 'data/wordbank-audio');
  let manifest = null;
  try { manifest = JSON.parse(await readFile(path.join(audioRoot, 'manifest.json'), 'utf8')); } catch { /* 缺音明示，不生成。 */ }
  const { data, stats } = await buildScenarioPreview({ pkg, sourceEntries: source.entries, manifest, audioRoot,
    outputAudioDir: path.join(repoRoot, 'data/scenario-preview/living-room/audio') });
  await writeFile(path.join(repoRoot, 'web-learner/src/scenarioPreviewData.json'), `${JSON.stringify(data, null, 2)}\n`);
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await prepareScenarioPreview(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
