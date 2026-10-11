// 只補指定情境目標詞缺音；唯讀正式快照規劃，生成須明確 opt-in；不寫正式 DB。
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {planAudio,generateBatch,DEFAULT_PROFILE,withBatchLock} from '../generate-wordbank-audio.mjs';
const args=process.argv.slice(2);const file=args[0];let generate=false;let output='data/scenario-wordbank-audio/basic-advance-01';
if(!file||file.startsWith('--'))throw Error('須指定單一套件');
for(let i=1;i<args.length;i++){if(args[i]==='--generate'&&!generate)generate=true;else if(args[i]==='--output'&&args[i+1]){output=args[++i];if(!/^data\/scenario-wordbank-audio\/[a-zA-Z0-9_-]+$/.test(output))throw Error('音檔輸出須為專案內指定備料目錄');}else throw Error('未知、重複或缺值參數');}
const pkg=JSON.parse(await readFile(file,'utf8'));const snapshot=JSON.parse(await readFile('data/scenario-preparation/basic-advance-01/formal-snapshot.json','utf8'));
if(snapshot.identity.database!=='english_learning'||snapshot.identity.address!=='172.18.0.4/32'||snapshot.identity.port!==5432)throw Error('正式快照身分不符');
const entries=pkg.targets.map(t=>{const e=snapshot.entries.find(e=>e.guid===t.entryGuid);if(!e||e.word!==t.word||e.level.list!==t.list||!e.parts_of_speech.includes(t.teachingPos))throw Error(`正式字庫不符：${t.word}`);return e;});
const planned=planAudio({entries},'all');const metadata=new Map(snapshot.audio.map(a=>[a.asset_guid,a]));
const jobs=planned.filter(j=>{const a=metadata.get(j.assetGuid);return !a||a.entry_guid!==j.entryGuid||a.kind!==j.kind||a.text_hash!==j.textHash||!a.fileExists||!a.bytesValid;});
const outputDir=path.resolve(output);await mkdir(outputDir,{recursive:true});
const plan={scenarioKey:pkg.scenarioKey,revision:pkg.revision,formalSnapshotAt:snapshot.checkedAt,total:planned.length,reused:planned.length-jobs.length,missing:jobs.length,jobs};
await writeFile(path.join(outputDir,`${pkg.scenarioKey}-plan.json`),JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({...plan,jobs:jobs.map(j=>({word:entries.find(e=>e.guid===j.entryGuid).word,kind:j.kind,assetGuid:j.assetGuid}))}));
if(!generate)process.exit(0);if(process.env.SCENARIO_REAL_TTS!=='1')throw Error('實際缺音生成須SCENARIO_REAL_TTS=1');
if(jobs.length){const report=await withBatchLock(outputDir,()=>generateBatch({jobs,outputDir,profile:DEFAULT_PROFILE,endpoint:'http://127.0.0.1:8000/v1/audio/speech',retries:0}));if(report.failed.length||report.generated+report.skipped!==jobs.length)throw Error('缺音生成未全部完成，停止本場正式匯入');console.log(JSON.stringify(report));}
