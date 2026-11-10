// 本批隔離預覽；預設僅 draft，--browse 僅在 _test 分類／發布，不提供生成 client。
import { readFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createPool, parseWordbankDocument, importWordbankEntries,
  scenarioSafePath, scenarioHash, copyScenarioAsset, importScenarioRevision,
  WordbankAudioManifestSchema, validateWordbankAudioManifest, importWordbankAudioManifest,
  validateScenarioMedia, getScenarioTagKind, getOrCreateTag, listScenarios, setScenarioTags,
  publishScenarioRevision, type ScenarioMedia } from '@el/shared';
import { resolveTestDatabaseUrl } from '@el/shared/testing';
import { buildApp } from '../../api/src/app';
import { contentFromScenarioPackage } from '../import-scenario';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function main() {
  // @ts-expect-error 現有 MJS 原語沒有型別宣告。
  const { validateMp3, DEFAULT_PROFILE, planAudio } = await import('../generate-wordbank-audio.mjs');
  // @ts-expect-error 現有 MJS 套件檢查器沒有型別宣告。
  const { validateScenarioPackage } = await import('../check-scenario-package.mjs');
  const args = process.argv.slice(2), files: string[] = [];
  let browse = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--browse' && !browse) { browse = true; continue; }
    if (args[i] !== '--package' || !args[i+1] || args[i+1].startsWith('--')) throw Error('只接受兩個 --package PATH 與單一 --browse');
    files.push(args[++i]);
  }
  if (files.length !== 2) throw Error('須指定兩套本批套件');
  const source = parseWordbankDocument(JSON.parse(await readFile(path.join(root, 'source/vocabulary-database.json'), 'utf8')));
  const packages = [];
  for (const file of files) {
    const relative = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
    const pkg = JSON.parse(await readFile(await scenarioSafePath(root, relative), 'utf8'));
    const checked = await validateScenarioPackage(pkg, { repoRoot: root });
    if (!checked.valid || !checked.publishReady) throw Error(`套件未完整：${JSON.stringify(checked)}`);
    // 與正式匯入器共用欄位轉換；contentReview 等離線審閱欄位不送入 strict content。
    const content = contentFromScenarioPackage(pkg);
    if (!('learningMode' in content) || content.learningMode !== 'illustrated-guide') throw Error('僅接受 illustrated-guide 套件，須先完成共用契約適配');
    packages.push({ pkg, content });
  }
  if (packages.map(p=>p.content.targetCount).sort((a,b)=>a-b).join(',') !== '3,11' || new Set(packages.map(p=>p.content.scenarioKey)).size !== 2) throw Error('本批必須為3＋11目標的兩個不同情境');
  if (packages.some(p => p.content.revision !== 1) || packages.map(p => p.content.scenarioKey).sort().join(',') !== 'time-prepositions-basics,time-prepositions-extended') throw Error('僅接受本批兩個情境 revision 1');
  const refs = new Set(packages.flatMap(p => [...p.content.targets, ...p.content.story.sentences.flatMap(s=>s.wordLinks)].map(w=>w.entryGuid)));
  const targets = new Set(packages.flatMap(p=>p.content.targets.map(t=>t.entryGuid)));
  if (targets.size !== 13) throw Error('本批必須13個不同目標GUID');
  const entries = source.filter(e=>refs.has(e.guid));
  if (entries.length !== refs.size) throw Error('故事／目標引用缺 canonical 詞條');
  const audioBase = 'data/scenario-wordbank-audio/time-prepositions';
  const raw = WordbankAudioManifestSchema.parse(JSON.parse(await readFile(await scenarioSafePath(root, `${audioBase}/manifest.json`), 'utf8')));
  if (JSON.stringify(Object.entries(raw.profile).sort()) !== JSON.stringify(Object.entries(DEFAULT_PROFILE).sort())) throw Error('音檔profile不符');
  const manifest = { ...raw, entries: raw.entries.filter(a=>refs.has(a.entryGuid)) };
  validateWordbankAudioManifest(manifest, entries);
  const requiredAudio = planAudio({ entries:entries.filter(e=>targets.has(e.guid)) }, 'all') as Array<{ assetGuid:string }>;
  if (requiredAudio.some(j=>!manifest.entries.some(e=>e.assetGuid===j.assetGuid))) throw Error('本批目標詞音檔未完整；先執行缺音工具');
  const pool = createPool(resolveTestDatabaseUrl());
  let directory: string | undefined;
  let app: ReturnType<typeof buildApp> | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    await app?.close(); await pool.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  };
  try {
    const identity = (await pool.query('SELECT current_database() AS database')).rows[0].database as string;
    if (!identity.endsWith('_test')) throw Error('拒絕非_test資料庫');
    // 不清表、不覆寫既有 revision；內容衝突由 shared importer 拒絕。
    directory = await mkdtemp(path.join(os.tmpdir(), 'time-prepositions-preview-'));
    const roots = { imageDir: path.join(directory, 'images'), audioDir: path.join(directory, 'audio') };
    await mkdir(roots.imageDir); await mkdir(roots.audioDir);
    for (const asset of manifest.entries) {
      const file = await scenarioSafePath(path.join(root, audioBase), asset.relativePath);
      const meta = await validateMp3(file);
      if (meta.bytes !== asset.bytes || Math.abs(meta.durationSeconds-asset.durationSeconds)>0.05) throw Error('字庫音檔實檔metadata不符');
      const destination = path.join(roots.audioDir, asset.relativePath);
      await mkdir(path.dirname(destination), { recursive: true }); await copyFile(file, destination);
    }
    await importWordbankEntries(pool, entries);
    await importWordbankAudioManifest(pool, manifest);
    const urls = [];
    for (const { pkg, content } of packages) {
      const image = await readFile(await scenarioSafePath(root, pkg.assets.baseImage.path));
      const audioFile = await scenarioSafePath(root, pkg.assets.storyAudio.path);
      const audio = await readFile(audioFile);
      await validateMp3(audioFile);
      if (scenarioHash(image)!==pkg.assets.baseImage.sha256 || scenarioHash(audio)!==pkg.assets.storyAudio.sha256 || scenarioHash(content.story.textEn)!==pkg.assets.storyAudio.textSha256) throw Error('套件媒體／故事hash不符');
      const metadata = await sharp(image).metadata();
      const formats: Record<string, [string, 'image/png'|'image/jpeg'|'image/webp']> = { png:['png','image/png'], jpeg:['jpg','image/jpeg'], webp:['webp','image/webp'] };
      const format = formats[metadata.format ?? ''];
      if (!format || !metadata.width || !metadata.height) throw Error('圖片格式／尺寸不符');
      const prefix = `scenarios/${content.scenarioKey}/${content.revision}`;
      const media: ScenarioMedia = {
        image: { relativePath:`${prefix}/${scenarioHash(image)}.${format[0]}`, sha256:scenarioHash(image), bytes:image.length,
          contentType:format[1] as 'image/png'|'image/jpeg'|'image/webp', width:metadata.width, height:metadata.height },
        audio: { relativePath:`${prefix}/${scenarioHash(audio)}.mp3`, sha256:scenarioHash(audio), bytes:audio.length,
          contentType:'audio/mpeg', textSha256:scenarioHash(content.story.textEn) },
      };
      validateScenarioMedia(content, media);
      await copyScenarioAsset(roots.imageDir, media.image, image); await copyScenarioAsset(roots.audioDir, media.audio, audio);
      const result = await importScenarioRevision(pool, content, media, roots);
      if (!browse && result.status !== 'draft') throw Error('測試庫已有published版本；請使用獨立測試庫');
      urls.push(`http://127.0.0.1:5181/#/scenarios/${content.scenarioKey}/revisions/${content.revision}`);
    }
    // 兩套素材皆驗證並匯入成功後，才允許分類／發布；重啟可重用同 tag 與 revision。
    let categoryId: number | undefined;
    let categoryUrl: string | undefined;
    if (browse) {
      const kind = await getScenarioTagKind(pool);
      const tag = await getOrCreateTag(pool, kind, '語法情境');
      const summaries = await listScenarios(pool, true);
      for (const { content } of packages) {
        const summary = summaries.find(item => item.scenarioKey === content.scenarioKey);
        if (!summary) throw Error(`找不到已匯入情境：${content.scenarioKey}`);
        const tagIds = [...new Set([...(summary.tags ?? []).map(item => item.id), tag.id])];
        if (!await setScenarioTags(pool, content.scenarioKey, tagIds)) throw Error(`情境分類失敗：${content.scenarioKey}`);
      }
      for (const { content } of packages) {
        if (!await publishScenarioRevision(pool, content.scenarioKey, content.revision, roots)) throw Error(`測試情境發布失敗：${content.scenarioKey}`);
      }
      categoryId = tag.id;
      categoryUrl = `http://127.0.0.1:5181/#/scenarios?category=${categoryId}`;
    }
    const email = 'time-prepositions-preview@example.test';
    app = buildApp({ pool, config:{ cfAccess:null, devAuthBypass:true, devUserEmail:email, adminEmails:[email] }, scenarios:roots, audioDir:roots.audioDir });
    await app.listen({ host:'127.0.0.1', port:5180 });
    console.log(JSON.stringify({ database:identity, api:'http://127.0.0.1:5180', mediaRoot:directory, status:browse ? 'published' : 'draft', urls, clips:manifest.entries.length,
      ...(browse ? { categoryId, categoryUrl } : {}) }));
    process.once('SIGINT',()=>{ void close().catch(console.error); });
    process.once('SIGTERM',()=>{ void close().catch(console.error); });
  } catch (error) { await close(); throw error; }
}
main().catch(error=>{ console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
