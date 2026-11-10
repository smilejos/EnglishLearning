// 離線盤點與可恢復音檔遷移；不產音，apply 目標須以參數或環境變數明列。
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, lstat, copyFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const hash = data => createHash('sha256').update(data).digest('hex');
const json = async p => JSON.parse(await readFile(p, 'utf8'));
const profileOf = p => ({ model: p.model, voice: p.voice, instruct: p.instruct, lang_code: p.lang_code, response_format: p.response_format });
export const profileHash = p => hash(JSON.stringify(profileOf(p))).slice(0, 16);
const stableGuid = text => { const h = hash(`english-learning:audio-asset:${text}`).slice(0, 32).split(''); h[12] = '5'; h[16] = '8'; const s = h.join(''); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
const sourceAllowed = p => /^(web-learner\/public|data\/audio-preparation)\/phonics\/[a-z0-9-]+\/[a-z0-9-]+\.mp3$/.test(p) || /^data\/scenario-preview\/living-room\/audio\/[a-f0-9-]+\.mp3$/.test(p);
export async function safePath(base, relative, create = false) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative)) throw new Error(`不安全路徑：${relative}`);
  const absoluteBase = path.resolve(base);
  let current = absoluteBase;
  const baseStat = await lstat(current); if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) throw new Error('根目錄不可為 symlink');
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part);
    if (create) await mkdir(current).catch(e => { if (e.code !== 'EEXIST') throw e; });
    const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`路徑不可為 symlink：${relative}`);
  }
  const result = path.join(absoluteBase, relative);
  try { const stat = await lstat(result); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`不是一般檔案：${relative}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const actualBase = await realpath(absoluteBase), actualParent = await realpath(path.dirname(result));
  if (actualParent !== actualBase && !actualParent.startsWith(`${actualBase}${path.sep}`)) throw new Error('路徑逃出根目錄');
  return result;
}
async function filesBelow(base) {
  const output = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
      if (entry.isSymbolicLink()) throw new Error(`不接受 symlink：${path.join(dir, entry.name)}`);
      if (entry.isDirectory() && !['checkpoints','static-audio-migration','static-audio-archive','node_modules'].includes(entry.name)) await walk(path.join(dir, entry.name));
      else if (entry.isFile()) output.push(path.join(dir, entry.name));
    }
  }
  await walk(base); return output;
}
async function checked(file, expected) {
  const bytes = await readFile(file);
  if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw new Error(`音檔大小/hash 不符：${file}`);
  return bytes;
}
export function validatePlan(plan) {
  if (plan.version !== 1 || !Array.isArray(plan.entries) || !plan.entries.length || !Array.isArray(plan.sources) || !plan.sources.length) throw new Error('遷移清單不完整');
  const bindings = new Set(), assets = new Map(), covered = new Set();
  for (const e of plan.entries) {
    const context=`${e.scope}/${e.lessonId}/${e.key}`;
    if (!['phonics','scenario-preview'].includes(e.scope) || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(e.lessonId) || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(e.key) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(e.assetGuid) || !['word','sentence','support','narration','example','explanation'].includes(e.kind)) throw new Error(`素材識別格式錯誤：${context}`);
    if (!e.profile || Object.keys(e.profile).length !== 5 || Object.values(profileOf(e.profile)).some(v => typeof v !== 'string') || !e.profile.model || !e.profile.voice || !e.profile.lang_code || e.profile.response_format !== 'mp3' || profileHash(e.profile) !== e.profileHash) throw new Error(`生成設定 hash 不符：${context}`);
    const invalid=[];
    if(Object.keys(e).length!==14)invalid.push('欄位數');
    if(!new RegExp(`^(wordbank|assets)/${e.profileHash}/${e.assetGuid}\\.mp3$`).test(e.relativePath))invalid.push('relativePath');
    if(typeof e.text!=='string'||!e.text.trim()||e.text!==e.text.trim()||e.textHash!==hash(e.text.trim()))invalid.push('text/textHash');
    if(!/^[a-f0-9]{64}$/.test(e.sha256))invalid.push('sha256');
    if(!Number.isSafeInteger(e.bytes)||e.bytes<=0)invalid.push('bytes');
    if(!(e.durationSeconds>0)||!Number.isFinite(e.durationSeconds))invalid.push('durationSeconds');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(e.generatedAt)||!Number.isFinite(Date.parse(e.generatedAt)))invalid.push('generatedAt');
    if(invalid.length)throw new Error(`素材內容或路徑格式錯誤：${context} [${invalid.join(', ')}]`);
    const binding = `${e.scope}/${e.lessonId}/${e.key}`; if (bindings.has(binding)) throw new Error(`重複 binding：${binding}`); bindings.add(binding);
    const id = `${e.assetGuid}/${e.profileHash}`, signature = JSON.stringify([profileOf(e.profile),e.kind,e.text,e.textHash,e.relativePath,e.sha256,e.bytes,e.durationSeconds]);
    if (assets.has(id) && assets.get(id) !== signature) throw new Error(`同 GUID/profile 不同音檔：${id}`); assets.set(id, signature);
  }
  const sources = new Set();
  for (const s of plan.sources) {
    if (!sourceAllowed(s.sourcePath) || sources.has(s.sourcePath) || !Number.isInteger(s.entryIndex) || !plan.entries[s.entryIndex] || s.sha256 !== plan.entries[s.entryIndex].sha256 || s.bytes !== plan.entries[s.entryIndex].bytes) throw new Error('來源清單不完整或不安全');
    sources.add(s.sourcePath); covered.add(s.entryIndex);
  }
  if (plan.entries.some((_, index) => !covered.has(index))) throw new Error('有素材缺少來源');
  return plan;
}
export async function planMigration(projectRoot = root) {
  const database = await json(path.join(projectRoot, 'source/vocabulary-database.json'));
  const wordGuids = new Map(database.entries.map(e => [e.word, e.guid]));
  const mappings = new Map();
  for (const batch of ['short-vowels','long-vowels','phonics-345','endings']) {
    const m = await json(path.join(projectRoot, 'docs/phonics/preparation', batch, 'wordbank-phonics-mapping.json'));
    for (const item of [...m.words,...m.sentences]) mappings.set(`${item.lesson}/${item.key}`, item);
  }
  const canonical = new Map();
  for (const f of await filesBelow(path.join(projectRoot,'data'))) {
    if (!/manifest[^/]*\.json$/.test(f)) continue;
    let m; try { m = await json(f); } catch { continue; }
    if (!m.profile || !Array.isArray(m.entries)) continue;
    for (const e of m.entries) if (/^wordbank\//.test(e.relativePath ?? '') && /^[a-f0-9-]{36}$/.test(e.assetGuid)) {
      const items = canonical.get(e.assetGuid) ?? []; items.push({ ...e, profile: profileOf(e.sourceProfile ?? m.profile), manifestFile: f }); canonical.set(e.assetGuid, items);
    }
  }
  const entries = [], sources = [];
  const add = async (sourcePath, scope, lessonId, key, original, profile, mappedGuid, mappedKind) => {
    const source = await safePath(projectRoot, sourcePath);
    const data = await readFile(source), sha256 = hash(data);
    if (data.length !== original.bytes || (original.sha256 && original.sha256 !== sha256) || original.textHash !== hash(original.text.trim())) throw new Error(`來源 metadata 不符：${sourcePath}`);
    const assetGuid = mappedGuid ?? stableGuid(`${original.kind}:${original.text.trim()}:${sha256}`), p = profileOf(profile), ph = profileHash(p);
    entries.push({ scope, lessonId, key, assetGuid, profileHash: ph, profile: p, kind: mappedKind ?? original.kind, text: original.text.trim(), textHash: original.textHash,
      relativePath: `${mappedGuid ? 'wordbank' : 'assets'}/${ph}/${assetGuid}.mp3`, sha256, bytes: data.length, durationSeconds: original.durationSeconds, generatedAt: original.generatedAt });
    sources.push({ sourcePath, entryIndex: entries.length - 1, sha256, bytes: data.length });
  };
  const phonicsRoots = ['data/audio-preparation/phonics','web-learner/public/phonics'];
  const directories = new Set();
  for(const base of phonicsRoots) for(const item of await readdir(path.join(projectRoot,base),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) if(item.isDirectory())directories.add(item.name);
  for (const directory of [...directories].sort()) {
    const selected=new Map();
    for(const base of phonicsRoots) for(const file of await readdir(path.join(projectRoot,base,directory)).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) if(file.endsWith('.mp3') && !selected.has(file)) selected.set(file,base);
    for (const [file,base] of [...selected].sort(([a],[b])=>a.localeCompare(b))) {
      const m=await json(path.join(projectRoot,base,directory,'manifest.json'));
      const original = m.entries.find(e => e.relativePath === file); if (!original) throw new Error(`音檔缺少 metadata：${directory}/${file}`);
      const key = file.slice(0,-4), mapped = mappings.get(`${directory}/${key}`);
      const guid = mapped?.assetGuid ?? (original.kind === 'word' ? wordGuids.get(original.text) : undefined);
      await add(`${base}/${directory}/${file}`, 'phonics', directory, key, original, original.sourceProfile ?? m.profile, guid, mapped?.kind);
      // staging 與舊 public 同時存在時也保留舊副本的可恢復遷移紀錄。
      if(base===phonicsRoots[0]) {
        const legacyPath=`${phonicsRoots[1]}/${directory}/${file}`;
        try { const legacy=await readFile(await safePath(projectRoot,legacyPath)),last=entries.at(-1); if(hash(legacy)!==last.sha256 || legacy.length!==last.bytes)throw new Error(`staging 與 legacy 同鍵內容不同，請先人工核對：${legacyPath}`);sources.push({sourcePath:legacyPath,entryIndex:entries.length-1,sha256:last.sha256,bytes:last.bytes}); } catch(e) {if(e.code!=='ENOENT')throw e;}
      }
    }
  }
  const previewRoot = 'data/scenario-preview/living-room/audio';
  for (const file of (await readdir(path.join(projectRoot,previewRoot))).filter(f => f.endsWith('.mp3')).sort()) {
    const guid = file.slice(0,-4), bytes = await readFile(await safePath(projectRoot,`${previewRoot}/${file}`));
    const candidates = (canonical.get(guid) ?? []).filter(e => e.bytes === bytes.length && (!e.sha256 || e.sha256 === hash(bytes)));
    if (!candidates.length) throw new Error(`情境預覽缺少可信 manifest：${file}`);
    let candidate;
    for(const option of candidates){
      if(option.sha256===hash(bytes)){candidate=option;break;}
      try {const original=await readFile(await safePath(path.dirname(option.manifestFile),option.relativePath));if(hash(original)===hash(bytes)){candidate=option;break;}}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    if(!candidate)throw new Error(`情境預覽 manifest 無法與原始音檔 hash 對應：${file}`);
    await add(`${previewRoot}/${file}`, 'scenario-preview', 'living-room', file, candidate, candidate.profile, guid);
  }
  return validatePlan({ version: 1, entries, sources });
}

export async function applyMigration(plan, { projectRoot = root, audioDir, importManifest }) {
  validatePlan(plan); if (!audioDir || !importManifest) throw new Error('apply 必須明列 audioDir 與 DB importer');
  // 先完整驗來源、目的地，再開始 copy；發現任何既有差異都不覆寫。
  const targets = new Map();
  for (const s of plan.sources) await checked(await safePath(projectRoot,s.sourcePath),s);
  for (const e of plan.entries) {
    const target = await safePath(audioDir,e.relativePath,true);
    try { await checked(target,e); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!targets.has(e.relativePath)) targets.set(e.relativePath,{ e,target,source: plan.sources.find(s => s.entryIndex === plan.entries.indexOf(e)) });
  }
  let copied = 0;
  for (const { e,target,source } of targets.values()) {
    const from = await safePath(projectRoot,source.sourcePath);
    try { await copyFile(from,target,constants.COPYFILE_EXCL); copied++; } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await checked(target,e);
  }
  const imported = await importManifest({version:1,entries:plan.entries});
  return { copied, ...imported };
}
export async function verifyMigration(plan, { audioDir, readBindings, checkUrl, resolveAssets, readPlaybackMetadata }) {
  validatePlan(plan); if (!audioDir || !readBindings || !checkUrl || !resolveAssets || !readPlaybackMetadata) throw new Error('verify 必須驗 DB、音檔、實際解析結果與播放 URL');
  const rows = await readBindings();
  const bindings = new Map(rows.map(r => [`${r.scope}/${r.lesson_id}/${r.key}`,r]));
  for (const e of plan.entries) {
    const r = bindings.get(`${e.scope}/${e.lessonId}/${e.key}`);
    if (!r || r.asset_guid !== e.assetGuid || r.profile_hash !== e.profileHash || r.relative_path !== e.relativePath || r.sha256 !== e.sha256 || r.text_hash !== e.textHash || Number(r.bytes) !== e.bytes || r.kind!==e.kind || r.text!==e.text || Number(r.duration_seconds)!==e.durationSeconds || JSON.stringify(profileOf(r.profile??{}))!==JSON.stringify(profileOf(e.profile))) throw new Error(`DB binding 不完整：${e.scope}/${e.lessonId}/${e.key}`);
    await checked(await safePath(audioDir,e.relativePath),e);
  }
  const paths = new Map(plan.entries.map(e => [`/audio/${e.relativePath}`,e]));
  const groups=new Map();
  for(const e of plan.entries){const group=`${e.scope}/${e.lessonId}`;if(!groups.has(group))groups.set(group,await resolveAssets(e.scope,e.lessonId));
    const resolved=groups.get(group)?.assets?.[e.key];
    if(!resolved||resolved.assetGuid!==e.assetGuid||resolved.text!==e.text||typeof resolved.url!=='string'||!new RegExp(`^/audio/(wordbank|assets)/[a-zA-Z0-9_-]{1,120}/${e.assetGuid}\\.mp3$`).test(resolved.url))throw new Error(`實際播放 binding 缺漏或不符：${group}/${e.key}`);
    const relativePath=resolved.url.slice('/audio/'.length);
    if(relativePath===e.relativePath)continue;
    if(!relativePath.startsWith('wordbank/'))throw new Error(`實際播放來源不是有效字庫覆寫：${group}/${e.key}`);
    const metadata=await readPlaybackMetadata(e.assetGuid,relativePath,e.textHash);
    if(!metadata||metadata.asset_guid!==e.assetGuid||metadata.relative_path!==relativePath||metadata.text_hash!==e.textHash||metadata.kind!==(e.kind==='sentence'?'example':e.kind)||!Number.isSafeInteger(Number(metadata.bytes))||Number(metadata.bytes)<=0)throw new Error(`實際播放字庫 metadata 不符：${group}/${e.key}`);
    const bytes=await readFile(await safePath(audioDir,relativePath));
    if(bytes.length!==Number(metadata.bytes))throw new Error(`實際播放字庫音檔大小不符：${relativePath}`);
    paths.set(resolved.url,{...e,relativePath,sha256:hash(bytes),bytes:bytes.length});
  }
  for (const [url,entry] of paths) await checkUrl(url,entry);
  return {version:1,manifestHash:hash(JSON.stringify(plan)),verifiedAt:new Date().toISOString(),bindings:plan.entries.length,urls:paths.size};
}
export async function pruneMigration(plan, { projectRoot = root, receipt, verify, archiveRoot = path.join(projectRoot,'data/static-audio-archive') }) {
  validatePlan(plan);
  if (!receipt || receipt.manifestHash !== hash(JSON.stringify(plan)) || !verify) throw new Error('prune 必須提供同份清單的成功驗證紀錄');
  const fresh = await verify(); if (fresh.manifestHash !== receipt.manifestHash) throw new Error('prune 前重新驗證失敗');
  if (path.resolve(archiveRoot) !== path.join(path.resolve(projectRoot),'data/static-audio-archive')) throw new Error('archive 必須位於 ignored data/static-audio-archive');
  await safePath(projectRoot,'data/static-audio-archive/placeholder',true);
  const archiveRootStat=await lstat(archiveRoot);if(!archiveRootStat.isDirectory()||archiveRootStat.isSymbolicLink())throw new Error('archive root 不可為 symlink');
  const archiveDir = path.join(archiveRoot,receipt.manifestHash); await mkdir(archiveDir,{recursive:true});
  const archiveStat=await lstat(archiveDir);if(!archiveStat.isDirectory()||archiveStat.isSymbolicLink())throw new Error('archive directory 不可為 symlink');
  // 每項先校驗，支援中斷續跑；來源缺失時必須已存在相同 archive。
  for (const s of plan.sources) {
    const archived = await safePath(archiveDir,s.sourcePath,true);
    const source = await safePath(projectRoot,s.sourcePath);
    try { await checked(source,s); } catch (error) { if (error.code !== 'ENOENT') throw error; await checked(archived,s); }
    try { await checked(archived,s); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const index={version:1,manifestHash:receipt.manifestHash,sources:plan.sources},indexFile=await safePath(archiveDir,'restore-index.json');
  try {await writeFile(indexFile,JSON.stringify(index,null,2)+'\n',{flag:'wx'});} catch(e) {if(e.code!=='EEXIST')throw e;if(JSON.stringify(await json(indexFile))!==JSON.stringify(index))throw new Error('archive restore-index 不符');}
  for (const s of plan.sources) {
    const source=await safePath(projectRoot,s.sourcePath), archived=await safePath(archiveDir,s.sourcePath,true);
    try { await copyFile(source,archived,constants.COPYFILE_EXCL); } catch(e) { if(!['EEXIST','ENOENT'].includes(e.code)) throw e; }
    await checked(archived,s);
    try { await checked(source,s); await unlink(source); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  }
  return {archived:plan.sources.length,archiveDir};
}

export function createPlaybackChecker(baseUrl,audioDir,fetcher=fetch) {
  const base=new URL(baseUrl);
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('base-url 必須為不含帳密或路徑的 HTTP(S) origin');
  return async (url,entry)=>{
    const response=await fetcher(new URL(url,base),{headers:{Range:'bytes=0-0'},redirect:'error',signal:AbortSignal.timeout(15000)});
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!response.headers.get('content-type')?.includes('audio/'))throw new Error(`播放 URL 格式錯誤：${url}`);
    if(response.status===206){const original=await checked(await safePath(audioDir,entry.relativePath),entry);if(response.headers.get('content-range')!==`bytes 0-0/${entry.bytes}`||bytes.length!==1||bytes[0]!==original[0])throw new Error(`播放 Range 驗證失敗：${url}`);}
    else if(response.status!==200||bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)throw new Error(`播放 URL 內容驗證失敗：${url}`);
  };
}

export async function main(args=process.argv.slice(2)) {
  const options={}; let mode='plan';
  for(let i=0;i<args.length;i++) {
    if(['plan','apply','verify','prune'].includes(args[i]) && i===0) mode=args[i];
    else if(['--root','--manifest','--audio-dir','--database-url','--base-url'].includes(args[i]) && args[i+1]) options[args[i].slice(2)]=args[++i];
    else if(args[i]==='--dry-run') mode='plan'; else throw new Error(`未知參數：${args[i]}`);
  }
  const projectRoot=path.resolve(options.root ?? root);
  const manifestFile=path.resolve(projectRoot,options.manifest ?? 'data/static-audio-migration/manifest.json');
  if(mode==='plan') { const plan=await planMigration(projectRoot); await mkdir(path.dirname(manifestFile),{recursive:true}); await writeFile(manifestFile,JSON.stringify(plan,null,2)+'\n'); console.log(JSON.stringify({mode,manifestFile,bindings:plan.entries.length,assets:new Set(plan.entries.map(e=>`${e.assetGuid}/${e.profileHash}`)).size,sources:plan.sources.length,sourceBytes:plan.sources.reduce((n,s)=>n+s.bytes,0)})); return; }
  options['audio-dir'] ??= process.env.AUDIO_DIR;
  options['database-url'] ??= process.env.DATABASE_URL;
  if(!options['audio-dir'] || !options['database-url']) throw new Error('必須指定 --audio-dir/AUDIO_DIR 與 --database-url/DATABASE_URL');
  const plan=validatePlan(await json(manifestFile));
  const {createPool,importAudioAssetsManifest,getAudioAssets}=await import('@el/shared');
  const pool=createPool(options['database-url']);
  const audioDir=path.resolve(options['audio-dir']);
  const verifyOptions={audioDir,readBindings:async()=> (await pool.query('SELECT b.scope,b.lesson_id,b.key,b.asset_guid,b.profile_hash,a.relative_path,a.sha256,a.text_hash,a.bytes,a.kind,a.text,a.profile,a.duration_seconds FROM audio_asset_bindings b JOIN audio_assets a USING(asset_guid,profile_hash)')).rows,
    resolveAssets:(scope,lessonId)=>getAudioAssets(pool,scope,lessonId),
    readPlaybackMetadata:async(assetGuid,relativePath,textHash)=>(await pool.query('SELECT asset_guid,relative_path,text_hash,kind,bytes FROM wordbank_audio WHERE asset_guid=$1 AND relative_path=$2 AND text_hash=$3',[assetGuid,relativePath,textHash])).rows[0]??null,
    checkUrl:options['base-url']?createPlaybackChecker(options['base-url'],audioDir):async()=>{throw new Error('verify/prune 必須明列 --base-url');}};
  const verify=()=>verifyMigration(plan,verifyOptions),receiptFile=`${manifestFile}.verified.json`;
  try {
    let result;
    if(mode==='apply') result=await applyMigration(plan,{projectRoot,audioDir:verifyOptions.audioDir,importManifest:m=>importAudioAssetsManifest(pool,m)});
    else if(mode==='verify') {result=await verify();await writeFile(receiptFile,JSON.stringify(result,null,2)+'\n');}
    else result=await pruneMigration(plan,{projectRoot,receipt:await json(receiptFile),verify});
    console.log(JSON.stringify({mode,...result}));
  } finally { await pool.end(); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
