import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hash, profileHash, safePath, validatePlan, applyMigration, verifyMigration, pruneMigration, createPlaybackChecker } from './migrate-static-audio.mjs';

const profile={model:'test',voice:'Serena',instruct:'',lang_code:'English',response_format:'mp3'};
async function fixture(t) {
  const base=await mkdtemp(path.join(os.tmpdir(),'audio-migration-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const projectRoot=path.join(base,'project'),audioDir=path.join(base,'audio');await mkdir(projectRoot);await mkdir(audioDir);
  const sourcePath='web-learner/public/phonics/short-a/cat.mp3',source=path.join(projectRoot,sourcePath),data=Buffer.from('test MP3 bytes');await mkdir(path.dirname(source),{recursive:true});await writeFile(source,data);
  const ph=profileHash(profile),guid='1c9f6b77-3906-54f3-850e-fe30107a006c';
  const entry={scope:'phonics',lessonId:'short-a',key:'cat',assetGuid:guid,profileHash:ph,profile,kind:'word',text:'cat',textHash:hash('cat'),relativePath:`wordbank/${ph}/${guid}.mp3`,sha256:hash(data),bytes:data.length,durationSeconds:1,generatedAt:'2026-11-01T00:00:00.000Z'};
  const plan={version:1,entries:[entry],sources:[{sourcePath,entryIndex:0,sha256:hash(data),bytes:data.length}]};
  const rows=[{scope:entry.scope,lesson_id:entry.lessonId,key:entry.key,asset_guid:guid,profile_hash:ph,relative_path:entry.relativePath,sha256:entry.sha256,text_hash:entry.textHash,bytes:entry.bytes,kind:entry.kind,text:entry.text,profile,duration_seconds:entry.durationSeconds}];
  const verifyOptions={audioDir,readBindings:async()=>rows,checkUrl:async url=>assert.equal(url,`/audio/${entry.relativePath}`),resolveAssets:async()=>({assets:{cat:{url:`/audio/${entry.relativePath}`,text:entry.text,assetGuid:guid}}}),readPlaybackMetadata:async()=>null};
  return {projectRoot,audioDir,source,data,entry,plan,rows,verifyOptions,verify:()=>verifyMigration(plan,verifyOptions)};
}

test('apply verifies complete source, exclusively copies, then imports; repeating skips identical files',async t=>{
  const f=await fixture(t);let imports=0;
  const options={...f,importManifest:async m=>{assert.deepEqual(await readFile(path.join(f.audioDir,f.entry.relativePath)),f.data);assert.equal(m.entries.length,1);imports++;return {assets:1,bindings:1};}};
  assert.equal((await applyMigration(f.plan,options)).copied,1);
  assert.equal((await applyMigration(f.plan,options)).copied,0);assert.equal(imports,2);
  assert.equal((await f.verify()).bindings,1);
});
test('existing different hash rejects before importer and preserves destination and source',async t=>{
  const f=await fixture(t),target=await safePath(f.audioDir,f.entry.relativePath,true);await writeFile(target,'different');let imported=false;
  await assert.rejects(applyMigration(f.plan,{...f,importManifest:async()=>{imported=true;}}),/hash/);
  assert.equal(imported,false);assert.equal(await readFile(target,'utf8'),'different');await access(f.source);
});
test('source hash mismatch rejects without importing',async t=>{
  const f=await fixture(t);await writeFile(f.source,'tampered');let imported=false;
  await assert.rejects(applyMigration(f.plan,{...f,importManifest:async()=>{imported=true;}}),/hash/);assert.equal(imported,false);
});
test('traversal, symlinks, malformed profile and incomplete source lists are rejected',async t=>{
  const f=await fixture(t);
  await assert.rejects(safePath(f.audioDir,'../escaped.mp3'),/不安全/);
  await symlink(f.projectRoot,path.join(f.audioDir,'linked'));
  await assert.rejects(safePath(f.audioDir,'linked/cat.mp3'),/symlink/);
  for(const mutate of [p=>p.sources=[],p=>p.sources[0].sourcePath='../../secret',p=>p.entries[0].relativePath='../secret.mp3',p=>p.entries[0].profileHash='0'.repeat(16)]){
    const p=structuredClone(f.plan);mutate(p);assert.throws(()=>validatePlan(p));
  }
});
test('verify checks DB binding, physical hashes and playable URLs',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});
  await assert.rejects(verifyMigration(f.plan,{...f.verifyOptions,readBindings:async()=>[]}),/DB binding/);
  await assert.rejects(verifyMigration(f.plan,{...f.verifyOptions,checkUrl:async()=>{throw new Error('URL failed');}}),/URL failed/);
  await writeFile(path.join(f.audioDir,f.entry.relativePath),'corrupt');await assert.rejects(f.verify(),/hash/);
});
test('prune requires matching prior and fresh verification, archives before removing, and can rerun',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});const receipt=await f.verify();
  await assert.rejects(pruneMigration(f.plan,{...f,receipt:{...receipt,manifestHash:'wrong'}}),/驗證紀錄/);await access(f.source);
  await assert.rejects(pruneMigration(f.plan,{...f,receipt,verify:async()=>{throw new Error('fresh failed');}}),/fresh failed/);await access(f.source);
  const result=await pruneMigration(f.plan,{...f,receipt});assert.equal(result.archived,1);await assert.rejects(access(f.source),{code:'ENOENT'});
  assert.deepEqual(await readFile(path.join(result.archiveDir,f.plan.sources[0].sourcePath)),f.data);
  assert.equal((await pruneMigration(f.plan,{...f,receipt})).archived,1);
});
test('changed source and unsafe archive never remove source',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});const receipt=await f.verify();
  await assert.rejects(pruneMigration(f.plan,{...f,receipt,archiveRoot:path.join(f.projectRoot,'public/archive')}),/ignored/);
  await writeFile(f.source,'changed');await assert.rejects(pruneMigration(f.plan,{...f,receipt}),/hash/);assert.equal(await readFile(f.source,'utf8'),'changed');
});
test('playback checker verifies exact Range and complete response content',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});
  const url=`/audio/${f.entry.relativePath}`;
  const response=(bytes,status,range)=>new Response(bytes,{status,headers:{'content-type':'audio/mpeg',...(range?{'content-range':range}:{})}});
  await createPlaybackChecker('http://api:8080',f.audioDir,async()=>response(f.data.subarray(0,1),206,`bytes 0-0/${f.data.length}`))(url,f.entry);
  await createPlaybackChecker('http://api:8080',f.audioDir,async()=>response(f.data,200))(url,f.entry);
  for(const reply of [()=>response(Buffer.from('x'),206,`bytes 0-0/${f.data.length}`),()=>response(f.data.subarray(0,1),206,'bytes 0-0/1'),()=>response(Buffer.from('wrong'),200)])await assert.rejects(createPlaybackChecker('http://api:8080',f.audioDir,async()=>reply())(url,f.entry));
  assert.throws(()=>createPlaybackChecker('http://user:password@api:8080',f.audioDir),/base-url/);
});
test('same asset identity includes duration and source records must exactly match asset hashes',async t=>{
  const f=await fixture(t),p=structuredClone(f.plan);
  p.entries.push({...p.entries[0],key:'cat-copy',durationSeconds:2});p.sources.push({...p.sources[0],sourcePath:'web-learner/public/phonics/short-a/cat-copy.mp3',entryIndex:1});
  assert.throws(()=>validatePlan(p),/同 GUID/);
  const wrong=structuredClone(f.plan);wrong.sources[0].sha256='0'.repeat(64);assert.throws(()=>validatePlan(wrong),/來源/);
});
test('prune rejects symlinked archive parent before moving any source',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});const receipt=await f.verify();
  await symlink(f.audioDir,path.join(f.projectRoot,'data'));
  await assert.rejects(pruneMigration(f.plan,{...f,receipt}),/symlink/);await access(f.source);
});
test('missing current wordbank recording blocks verify and prune even when original migrated file is valid',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});const receipt=await f.verify();
  const relativePath=`wordbank/updated-profile/${f.entry.assetGuid}.mp3`;
  f.verifyOptions.resolveAssets=async()=>({assets:{cat:{url:`/audio/${relativePath}`,text:'cat',assetGuid:f.entry.assetGuid}}});
  f.verifyOptions.readPlaybackMetadata=async()=>({asset_guid:f.entry.assetGuid,relative_path:relativePath,text_hash:f.entry.textHash,kind:'word',bytes:5});
  await assert.rejects(f.verify(),{code:'ENOENT'});
  await assert.rejects(pruneMigration(f.plan,{...f,receipt}),{code:'ENOENT'});await access(f.source);
});
test('current wordbank recording is resolved, matched to metadata, and checked over its actual URL',async t=>{
  const f=await fixture(t);await applyMigration(f.plan,{...f,importManifest:async()=>({})});
  const relativePath=`wordbank/updated-profile/${f.entry.assetGuid}.mp3`,data=Buffer.from('new correct audio');await writeFile(await safePath(f.audioDir,relativePath,true),data);
  f.verifyOptions.resolveAssets=async()=>({assets:{cat:{url:`/audio/${relativePath}`,text:'cat',assetGuid:f.entry.assetGuid}}});
  f.verifyOptions.readPlaybackMetadata=async()=>({asset_guid:f.entry.assetGuid,relative_path:relativePath,text_hash:f.entry.textHash,kind:'word',bytes:data.length});
  const checkedUrls=[];f.verifyOptions.checkUrl=async(url,e)=>{checkedUrls.push(url);if(url.endsWith(relativePath)){assert.equal(e.sha256,hash(data));assert.equal(e.bytes,data.length);}};
  assert.equal((await f.verify()).urls,2);assert.deepEqual(checkedUrls,[`/audio/${f.entry.relativePath}`,`/audio/${relativePath}`]);
  f.verifyOptions.readPlaybackMetadata=async()=>null;await assert.rejects(f.verify(),/metadata/);
  f.verifyOptions.resolveAssets=async()=>({assets:{}});await assert.rejects(f.verify(),/binding/);
});
