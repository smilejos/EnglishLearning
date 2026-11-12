// 僅本批隔離 _test 資料／媒體 bootstrap；不生成、不啟動服務、不發布、不清表。
import { lstat, readFile, realpath, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createPool, parseWordbankDocument, importWordbankEntries, mergeWordbankEntry,
  WordbankEntrySchema, WordbankAudioManifestSchema, validateWordbankAudioManifest,
  importWordbankAudioManifest, scenarioSafePath, scenarioHash, scenarioCanonicalJson,
  scenarioRevisionHash, validateScenarioMedia, copyScenarioAsset, importScenarioRevision,
  getScenarioRevision, type ScenarioMedia, type ScenarioContent } from '@el/shared';
import { contentFromScenarioPackage } from '../../../../scripts/import-scenario';
import { readPreviewSettings, checkedMediaRoot, assertPreviewDatabase } from './test-preview-api';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const preparation = 'data/scenario-preparation/travel-scenarios/test-preview';
const newManifestPath = 'data/scenario-audio/travel-scenarios-qwen17b/wordbank-assets/manifest.json';
const expectedScenes = new Map([
  ['travel-airport-gate', 26], ['travel-hotel-check-in', 29],
  ['travel-ferry-trip', 19], ['travel-airplane-cabin', 29],
]);
type FilePlan = { root: string; relativePath: string; sourceRoot: string; sourcePath: string; sha256: string; bytes: number };
type PackagePlan = { content: ScenarioContent; media: ScenarioMedia; image: Buffer; audio: Buffer };
const readJson = async (root: string, file: string): Promise<unknown> => JSON.parse(await readFile(await scenarioSafePath(root, file), 'utf8'));
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);

async function verifyFile(root: string, relativePath: string, sha256: string, bytes: number): Promise<Buffer> {
  const data = await readFile(await scenarioSafePath(root, relativePath));
  if (data.length !== bytes || scenarioHash(data) !== sha256) throw new Error(`媒體 SHA-256／bytes 不符：${relativePath}`);
  return data;
}

// 預檢不存在的目錄也不建立；任何既有層 symlink、非目錄或不同內容均拒絕。
async function inspectDestination(root: string, relativePath: string, sha256: string, bytes: number): Promise<boolean> {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\\') ||
      relativePath.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('目的路徑不可逃逸');
  const parts = relativePath.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const info = await lstat(current).catch(error => { if (errorCode(error) === 'ENOENT') return null; throw error; });
    if (!info) return false;
    if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile()))
      throw new Error(`目的路徑不是實體目錄／檔案：${relativePath}`);
  }
  await verifyFile(root, relativePath, sha256, bytes);
  return true;
}

async function copyWordbankFile(file: FilePlan): Promise<boolean> {
  // 寫入前重查來源，防止前置驗證後來源被替換；僅 wx 建檔，永不覆蓋。
  const data = await verifyFile(file.sourceRoot, file.sourcePath, file.sha256, file.bytes);
  if (await inspectDestination(file.root, file.relativePath, file.sha256, file.bytes)) return false;
  let directory = file.root;
  for (const part of file.relativePath.split('/').slice(0, -1)) {
    directory = path.join(directory, part);
    await mkdir(directory).catch(error => { if (errorCode(error) !== 'EEXIST') throw error; });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('字庫目的目錄不可為 symlink');
  }
  const destination = path.join(directory, path.basename(file.relativePath));
  const handle = await open(destination, 'wx').catch(async error => {
    if (errorCode(error) !== 'EEXIST') throw error;
    await verifyFile(file.root, file.relativePath, file.sha256, file.bytes);
    return null;
  });
  if (!handle) return false;
  try { await handle.writeFile(data); }
  catch (error) { await handle.close(); await unlink(destination); throw error; }
  await handle.close();
  await verifyFile(file.root, file.relativePath, file.sha256, file.bytes);
  return true;
}

export async function bootstrapTravelTestPreview(env: Record<string, string | undefined> = process.env) {
  // 必須是第一項檢查；未 opt-in 不讀套件／音檔，不連 DB，也不建立任何檔案。
  const settings = readPreviewSettings(env);
  const [audioDir, imageDir] = await Promise.all([
    checkedMediaRoot(settings.audioDir, 'audio', settings.database),
    checkedMediaRoot(settings.imageDir, 'images', settings.database),
  ]);
  const reuseSetting = env.TEST_REUSE_AUDIO_DIR;
  if (!reuseSetting || !path.isAbsolute(reuseSetting)) throw new Error('須明示唯讀舊音來源 TEST_REUSE_AUDIO_DIR 絕對路徑');
  const reuseInfo = await lstat(reuseSetting);
  if (!reuseInfo.isDirectory() || reuseInfo.isSymbolicLink()) throw new Error('舊音來源必須為實體唯讀掛載目錄');
  const reuseRoot = await realpath(reuseSetting);
  if (overlaps(audioDir, imageDir) || [audioDir, imageDir].some(root => overlaps(root, reuseRoot) || overlaps(root, repoRoot)))
    throw new Error('測試媒體根不可重疊，亦不可與來源音訊／Repo重疊');
  // @ts-expect-error 既有離線 MJS 原語沒有型別宣告。
  const { validateScenarioPackage } = await import('../../../../scripts/check-scenario-package.mjs');
  // @ts-expect-error 既有離線 MJS 原語沒有型別宣告；僅使用計畫／解碼檢查，不執行生成。
  const { planAudio, validateMp3 } = await import('../../../../scripts/generate-wordbank-audio.mjs');
  const batch = await readJson(repoRoot, 'docs/scenarios/preparation/travel-scenarios-proposal/batch.json') as {
    scenes: Array<{ key: string; preparation: { packagePath: string } }> };
  if (!Array.isArray(batch.scenes) || batch.scenes.length !== 4 ||
      new Set(batch.scenes.map(s => s.key)).size !== 4 || batch.scenes.some(s => !expectedScenes.has(s.key)))
    throw new Error('僅接受本批四個旅遊情境');
  const packages: PackagePlan[] = [];
  for (const scene of batch.scenes) {
    const pkg = await readJson(repoRoot, scene.preparation.packagePath) as Record<string, unknown> & {
      assets: { baseImage: { path: string; sha256: string }; storyAudio: { path: string; sha256: string; textSha256: string } } };
    const check = await validateScenarioPackage(pkg, { repoRoot });
    if (!check.valid || !check.publishReady) throw new Error(`套件尚未完整：${scene.key}；${JSON.stringify(check)}`);
    const content = contentFromScenarioPackage(pkg);
    if (content.scenarioKey !== scene.key || content.revision !== 1 || content.targetCount !== expectedScenes.get(scene.key))
      throw new Error(`套件 key／revision／targetCount 不符：${scene.key}`);
    const image = await readFile(await scenarioSafePath(repoRoot, pkg.assets.baseImage.path));
    const audioFile = await scenarioSafePath(repoRoot, pkg.assets.storyAudio.path);
    const audio = await readFile(audioFile);
    await validateMp3(audioFile);
    const imageHash = scenarioHash(image), audioHash = scenarioHash(audio), textHash = scenarioHash(content.story.textEn);
    if (imageHash !== pkg.assets.baseImage.sha256 || audioHash !== pkg.assets.storyAudio.sha256 || textHash !== pkg.assets.storyAudio.textSha256)
      throw new Error(`套件媒體／故事 SHA-256 不符：${scene.key}`);
    const metadata = await sharp(image).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error(`本批底圖必須為有效 PNG：${scene.key}`);
    const prefix = `scenarios/${scene.key}/1`;
    const media = validateScenarioMedia(content, {
      image: { relativePath: `${prefix}/${imageHash}.png`, sha256: imageHash, bytes: image.length,
        contentType: 'image/png', width: metadata.width, height: metadata.height },
      audio: { relativePath: `${prefix}/${audioHash}.mp3`, sha256: audioHash, bytes: audio.length,
        contentType: 'audio/mpeg', textSha256: textHash },
    });
    packages.push({ content, media, image, audio });
  }
  // canonical 僅讀；只取 targets＋story.wordLinks 的 GUID，不將全庫載入測試 DB。
  const sourceCanonical = parseWordbankDocument(await readJson(repoRoot, 'source/vocabulary-database.json'));
  const refs = new Map<string, string>();
  for (const { content } of packages) for (const ref of [...content.targets, ...content.story.sentences.flatMap(s => s.wordLinks)]) {
    if (refs.has(ref.entryGuid) && refs.get(ref.entryGuid) !== ref.word) throw new Error('同 GUID 引用不同單字');
    refs.set(ref.entryGuid, ref.word);
  }
  const entries = sourceCanonical.filter(entry => refs.has(entry.guid));
  if (entries.length !== refs.size || entries.some(entry => refs.get(entry.guid) !== entry.word)) throw new Error('引用 GUID／單字缺 canonical 詞條');
  const byGuid = new Map(entries.map(entry => [entry.guid, entry]));
  for (const { content } of packages) for (const target of content.targets) {
    const entry = byGuid.get(target.entryGuid)!;
    if (entry.level.list !== target.list || !entry.parts_of_speech.includes(target.teachingPos)) throw new Error(`canonical 分級／詞性不符：${target.word}`);
  }
  const targets = new Set(packages.flatMap(p => p.content.targets.map(t => t.entryGuid)));
  const required = planAudio({ entries: entries.filter(e => targets.has(e.guid)) }, 'all') as Array<{ assetGuid: string }>;
  if (required.length !== 720 || new Set(required.map(a => a.assetGuid)).size !== 720) throw new Error('本批應有720個不同目標詞音訊資產');
  const requiredIds = new Set(required.map(a => a.assetGuid));
  const oldManifest = WordbankAudioManifestSchema.parse(await readJson(repoRoot, `${preparation}/reusable-audio-manifest.json`));
  const newManifest = WordbankAudioManifestSchema.parse(await readJson(repoRoot, newManifestPath));
  if (oldManifest.entries.length !== 442 || newManifest.entries.length !== 278) throw new Error('舊442＋新278音訊尚未完整；拒絕任何 DB 寫入');
  const manifests = [oldManifest, newManifest];
  const allAssets = manifests.flatMap(manifest => manifest.entries);
  if (new Set(allAssets.map(a => a.assetGuid)).size !== 720 || allAssets.some(a => !requiredIds.has(a.assetGuid)))
    throw new Error('舊／新音訊資產 GUID 必須互斥且完整涵蓋720個目標資產');
  const oldList = await readJson(repoRoot, `${preparation}/existing-audio-copy-list.json`) as {
    copies: Array<{ assetGuid: string; relativePath: string; sha256: string; bytes: number }> };
  if (!Array.isArray(oldList.copies) || oldList.copies.length !== 442 || new Set(oldList.copies.map(a => a.assetGuid)).size !== 442)
    throw new Error('舊音複製核對清單不完整');
  const oldByGuid = new Map(oldList.copies.map(a => [a.assetGuid, a]));
  const audioFiles: FilePlan[] = [];
  for (const [index, manifest] of manifests.entries()) {
    validateWordbankAudioManifest(manifest, entries);
    const hash = scenarioHash(JSON.stringify(manifest.profile)).slice(0, 16);
    if (hash !== (index === 0 ? '09eeb3d17582e855' : '2706fd2bc0c87488')) throw new Error('本批錄音生成設定識別碼不符');
    for (const asset of manifest.entries) {
      if (asset.relativePath !== `wordbank/${hash}/${asset.assetGuid}.mp3`) throw new Error('字庫路徑與 profile／GUID 不符');
      const sourceRoot = index === 0 ? reuseRoot : path.dirname(path.join(repoRoot, newManifestPath));
      const sourcePath = asset.relativePath;
      const file = await scenarioSafePath(sourceRoot, sourcePath);
      // 新音 manifest 原生僅記 bytes／textHash；以真檔 SHA 固定本次計畫，複製前後重驗。
      const data = await readFile(file), sha256 = scenarioHash(data);
      if (data.length !== asset.bytes) throw new Error(`音檔 bytes 不符：${asset.assetGuid}`);
      if (index === 0) {
        const recorded = oldByGuid.get(asset.assetGuid);
        if (!recorded || !/^[a-f0-9]{64}$/.test(recorded.sha256) || recorded.relativePath !== sourcePath ||
            recorded.bytes !== data.length || recorded.sha256 !== sha256) throw new Error(`舊音 SHA-256／bytes 不符：${asset.assetGuid}`);
      }
      const probed = await validateMp3(file);
      if (probed.bytes !== asset.bytes || Math.abs(probed.durationSeconds - asset.durationSeconds) > 0.05)
        throw new Error(`音檔 duration／bytes 不符：${asset.assetGuid}`);
      audioFiles.push({ root: audioDir, relativePath: asset.relativePath, sourceRoot, sourcePath, sha256, bytes: data.length });
    }
  }
  for (const file of audioFiles) await inspectDestination(file.root, file.relativePath, file.sha256, file.bytes);
  for (const { media } of packages) for (const [root, asset] of [[imageDir, media.image], [audioDir, media.audio]] as const)
    await inspectDestination(root, asset.relativePath, asset.sha256, asset.bytes);
  // 全部輸入、720音檔、四旁白／底圖、目的路徑驗完後，才建立 DB 連線。
  const pool = createPool(settings.databaseUrl);
  try {
    const identity = (await pool.query('SELECT current_database() AS database')).rows[0]?.database;
    assertPreviewDatabase(identity, settings.database);
    // 先拒絕不同內容／已發布版本，避免 importer 的逐套交易前已有其他寫入。
    for (const { content, media } of packages) {
      const current = await getScenarioRevision(pool, content.scenarioKey, 1, true);
      if (current && (current.status !== 'draft' || current.contentHash !== scenarioRevisionHash(content, media)))
        throw new Error(`測試庫已有不同內容或已發布版本：${content.scenarioKey}/1`);
    }
    const existingEntries = await pool.query('SELECT guid, source_id AS id, word, parts_of_speech, definition, explains, examples, level, category, scenario FROM wordbank_entries WHERE guid = ANY($1::uuid[])', [[...refs.keys()]]);
    const existingByGuid = new Map(existingEntries.rows.map(row => { const entry = WordbankEntrySchema.parse(row); return [entry.guid, entry]; }));
    const effectiveEntries = entries.map(entry => {
      const current = existingByGuid.get(entry.guid);
      if (current && current.word !== entry.word) throw new Error(`測試字庫 GUID 已屬於其他單字：${entry.guid}`);
      const merged = current ? mergeWordbankEntry(current, entry) : entry;
      if (merged.level.list !== entry.level.list) throw new Error(`測試字庫既有分級與 canonical 衝突：${entry.word}`);
      return merged;
    });
    for (const manifest of manifests) validateWordbankAudioManifest(manifest, effectiveEntries);
    // 共用 audio importer 是 upsert；本批額外先拒絕不同 metadata，不覆蓋他人錄音。
    const oldAudio = await pool.query('SELECT asset_guid, entry_guid, kind, relative_path, model, voice, instruct, language, text_hash, duration_seconds, bytes, generated_at FROM wordbank_audio WHERE asset_guid = ANY($1::uuid[])', [[...requiredIds]]);
    const expectedAudio = new Map(manifests.flatMap(manifest => manifest.entries.map(asset => [asset.assetGuid, { manifest, asset }] as const)));
    for (const row of oldAudio.rows) {
      const { manifest, asset } = expectedAudio.get(row.asset_guid)!;
      const expected = [asset.entryGuid, asset.kind, asset.relativePath, manifest.profile.model, manifest.profile.voice,
        manifest.profile.instruct, manifest.profile.lang_code, asset.textHash, asset.durationSeconds, asset.bytes, new Date(asset.generatedAt).toISOString()];
      const actual = [row.entry_guid, row.kind, row.relative_path, row.model, row.voice, row.instruct, row.language,
        row.text_hash, Number(row.duration_seconds), Number(row.bytes), new Date(row.generated_at).toISOString()];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`測試庫既有音訊 metadata 不同：${asset.assetGuid}`);
    }
    let copied = 0, reused = 0;
    // 再驗 marker；只有經標記且與實際 _test DB 相符的根可接收寫入。
    await checkedMediaRoot(audioDir, 'audio', identity); await checkedMediaRoot(imageDir, 'images', identity);
    for (const file of audioFiles) { if (await copyWordbankFile(file)) copied++; else reused++; }
    for (const { media, image, audio } of packages) {
      for (const [root, asset, data] of [[imageDir, media.image, image], [audioDir, media.audio, audio]] as const) {
        if (await copyScenarioAsset(root, asset, data)) copied++; else reused++;
        await verifyFile(root, asset.relativePath, asset.sha256, asset.bytes);
      }
    }
    await importWordbankEntries(pool, entries);
    for (const manifest of manifests) await importWordbankAudioManifest(pool, manifest);
    for (const { content, media } of packages) {
      const result = await importScenarioRevision(pool, content, media, { audioDir, imageDir });
      if (result.status !== 'draft') throw new Error('測試版本狀態不是 draft');
    }
    const mediaHash = scenarioHash(scenarioCanonicalJson({
      audio: audioFiles.map(({ relativePath, sha256, bytes }) => ({ relativePath, sha256, bytes })).sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      scenarios: packages.map(({ content, media }) => ({ key: content.scenarioKey, media })).sort((a, b) => a.key.localeCompare(b.key)),
    }));
    const summary = { database: identity, selectedEntries: entries.length, audioAssets: allAssets.length,
      scenarios: packages.length, status: 'draft', copied, reused, mediaHash, generationClients: false };
    console.log(JSON.stringify(summary));
    return summary;
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootstrapTravelTestPreview().catch(error => {
    const message = (error instanceof Error ? error.message : '測試資料 bootstrap 失敗')
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[已隱藏資料庫連線字串]');
    console.error(message); process.exitCode = 1;
  });
}
