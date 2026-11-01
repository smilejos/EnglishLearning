// 將本課已備妥錄音轉成共用字庫離線增量；不連 DB、不碰正式 volume、不呼叫 TTS。
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withBatchLock } from './generate-wordbank-audio.mjs';
import { validatePhonicsMp3 } from './phonics-audio-quality.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const preparation = path.join(root, 'docs/phonics/preparation/short-vowels');
const output = path.join(root, 'data/phonics/short-vowels/wordbank-audio');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const save = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateMapping(mapping) {
  if (!Array.isArray(mapping?.words) || !Array.isArray(mapping?.sentences)) throw new Error('缺少單字／例句映射');
  for (const [kind, items] of [['word', mapping.words], ['example', mapping.sentences]]) {
    for (const item of items) {
      if (!item || typeof item.lesson !== 'string' || !/^short-[aeiou]$/.test(item.lesson)) throw new Error('課程識別不合法');
      if (typeof item.key !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.key)) throw new Error('素材 key 不合法');
      if (typeof item.entryGuid !== 'string' || !uuid.test(item.entryGuid)
        || typeof item.assetGuid !== 'string' || !uuid.test(item.assetGuid)) throw new Error('素材／詞條 UUID 不合法');
      if (item.kind !== kind) throw new Error('單字／例句映射用途不符');
      if (typeof item.text !== 'string' || !item.text.trim() || item.text !== item.text.trim()
        || typeof item.textHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.textHash)
        || item.textHash !== hash(item.text)) throw new Error('映射文字或 textHash 不符');
      if (kind === 'word' && (item.assetGuid !== item.entryGuid || item.word !== item.text))
        throw new Error('整詞素材未歸屬本身詞條');
    }
  }
  const words = new Map(mapping.words.map((item) => [item.entryGuid, item]));
  for (const item of mapping.sentences) {
    const word = words.get(item.entryGuid);
    if (!word || word.word !== item.word || word.lesson !== item.lesson || words.has(item.assetGuid))
      throw new Error('例句素材未歸屬本課對應詞條');
  }
}

/** 使用製作前實際快照排除既有錄音；不同文字／用途衝突直接停止，不能覆寫。 */
export function planBackfill(mapping, snapshot) {
  // 所有可進入路徑的欄位在任何讀寫／規劃之前完成檢查，包含被保留的素材。
  validateMapping(mapping);
  const existing = new Map((snapshot.audio ?? []).map((audio) => [audio.asset_guid, audio]));
  const selected = [];
  const preserved = [];
  const seen = new Set();
  for (const item of [...mapping.words, ...mapping.sentences]) {
    if (seen.has(item.assetGuid)) throw new Error(`重複素材 GUID：${item.assetGuid}`);
    seen.add(item.assetGuid);
    const audio = existing.get(item.assetGuid);
    if (!audio) { selected.push(item); continue; }
    if (audio.entry_guid !== item.entryGuid || audio.kind !== item.kind || audio.text_hash !== item.textHash)
      throw new Error(`既有音訊 metadata 與教材衝突：${item.assetGuid}`);
    preserved.push(item);
  }
  return { selected, preserved };
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--prepare')) throw new Error('只接受 --prepare；無參數只列離線計畫');
  const mapping = await json(path.join(preparation, 'wordbank-phonics-mapping.json'));
  const snapshot = await json(path.join(preparation, 'wordbank-before.json'));
  const { selected, preserved } = planBackfill(mapping, snapshot);
  if (!args.includes('--prepare')) {
    console.log(JSON.stringify({ dryRun: true, sourceSnapshotTarget: snapshot.target,
      output, preserved: preserved.length, words: selected.filter((a) => a.kind === 'word').length,
      examples: selected.filter((a) => a.kind === 'example').length, assets: selected }, null, 2));
    return;
  }
  await mkdir(output, { recursive: true });
  await withBatchLock(output, async () => {
    const groups = new Map();
    const copies = [];
    for (const item of selected) {
      const lessonDir = path.join(root, 'web-learner/public/phonics', item.lesson);
      const manifest = await json(path.join(lessonDir, 'manifest.json'));
      const source = manifest.entries.find((audio) => audio.assetGuid === `phonics-${item.lesson}-${item.key}`);
      if (!source || source.text !== item.text || source.textHash !== item.textHash)
        throw new Error(`教材來源未備妥或文字不同：${item.lesson}/${item.key}`);
      if (!/^[a-z0-9-]+\.mp3$/.test(source.relativePath)) throw new Error('教材來源路徑不合法');
      const sourceFile = path.join(lessonDir, source.relativePath);
      const metadata = await validatePhonicsMp3(sourceFile);
      const sha256 = hash(await readFile(sourceFile));
      if (source.sha256 !== sha256) throw new Error(`教材來源 hash 不符：${sourceFile}`);
      const profile = source.sourceProfile ?? manifest.profile;
      const profileHash = hash(JSON.stringify(profile)).slice(0, 16);
      const relativePath = `wordbank/${profileHash}/${item.assetGuid}.mp3`;
      const targetFile = path.join(output, relativePath);
      await mkdir(path.dirname(targetFile), { recursive: true });
      let present = false;
      try {
        const targetHash = hash(await readFile(targetFile));
        if (targetHash !== sha256) throw new Error(`離線目的檔已有不同內容，拒絕覆寫：${targetFile}`);
        present = true;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!present) await copyFile(sourceFile, targetFile);
      const entry = { assetGuid: item.assetGuid, entryGuid: item.entryGuid, kind: item.kind,
        text: item.text, textHash: item.textHash, relativePath, ...metadata,
        generatedAt: source.generatedAt, sha256,
        origin: { type: 'copied-phonics-asset', path: path.relative(root, sourceFile), assetGuid: source.assetGuid },
        listeningReview: source.listeningReview ?? 'awaiting-human-listening' };
      if (!groups.has(profileHash)) groups.set(profileHash, { version: 1, profile, entries: [] });
      groups.get(profileHash).entries.push(entry);
      copies.push({ sourcePath: path.relative(root, sourceFile), targetPath: path.relative(root, targetFile),
        relativePath, sha256, bytes: metadata.bytes, assetGuid: item.assetGuid });
    }
    const manifests = [];
    for (const [profileHash, manifest] of groups) {
      const name = groups.size === 1 ? 'wordbank-audio-import.json' : `wordbank-audio-import-${profileHash}.json`;
      await save(path.join(preparation, name), manifest);
      manifests.push({ path: path.relative(root, path.join(preparation, name)), entries: manifest.entries.length, profileHash });
    }
    const report = { preparedAt: new Date().toISOString(), mode: 'offline-only',
      sourceSnapshotTarget: snapshot.target, preservedWordAudio: preserved.length,
      words: selected.filter((a) => a.kind === 'word').length,
      examples: selected.filter((a) => a.kind === 'example').length,
      manifests, copies, listeningReview: 'awaiting-human-listening',
      formalImport: 'not-executed' };
    await save(path.join(preparation, 'wordbank-audio-preparation.json'), report);
    console.log(JSON.stringify({ ...report, copies: `${copies.length} validated identical copies` }, null, 2));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
