// 第一批離線套件備料；不連 DB、不產圖／產音、不正式匯入。
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd();
const args=process.argv.slice(2), id=args[0];
if(!/^\d{2}$/.test(id??'')||Number(id)<2||Number(id)>40)throw Error('用法：node scripts/scenarios/prepare-batch-01.mjs <02–40> <現存參考圖相對路徑>');
const image=args[1];if(!image||path.isAbsolute(image)||image.split('/').includes('..'))throw Error('須提供專案內現存參考圖');
const group=Number(id)<=14?'02-14':Number(id)<=27?'15-27':'28-40';
const drafts=JSON.parse(await readFile(`docs/scenarios/preparation/basic-advance-01/author-${group}.json`,'utf8'));
const scene=drafts.find(s=>s.id===id);if(!scene)throw Error('缺本場文字備料');
const source=JSON.parse(await readFile('source/vocabulary-database.json','utf8')).entries;
const allowed=source.filter(e=>['basic','advance'].includes(e.level?.list));
const byGuid=new Map(allowed.map(e=>[e.guid,e]));
const byWord=new Map();for(const e of allowed){const word=e.word.toLowerCase();const list=byWord.get(word)??[];list.push(e);byWord.set(word,list);}
const targets=scene.targets.map(t=>{const e=byGuid.get(t.entryGuid);if(!e||e.word!==t.word||e.level.list!==t.list||!e.parts_of_speech.includes(t.teachingPos))throw Error(`目標字庫不符：${t.word}`);return {word:t.word,entryGuid:t.entryGuid,list:t.list,teachingPos:t.teachingPos,senseZh:t.senseZh,interaction:null};});
if(targets.length!==15||new Set(targets.map(t=>t.entryGuid)).size!==15||new Set(targets.map(t=>t.word)).size!==15||['n','v','adj'].some(p=>!targets.some(t=>t.teachingPos===p)))throw Error('目標數量／唯一性／詞性不符');
const original=JSON.parse(await readFile('docs/scenarios/basic-advance-batch-01.json','utf8')).scenarios.find(s=>s.id===id);if(original.words.some(w=>!targets.some(t=>t.entryGuid===w.guid&&t.teachingPos===w.teachingPos)))throw Error('原八詞關聯未保留');
const targetWords=new Map(targets.map(t=>[t.word.toLowerCase(),t]));
const sentences=scene.sentences.map((s,i)=>({id:`s${i+1}`,en:s.en,zh:s.zh,wordLinks:[...s.en.matchAll(/[A-Za-z]+/g)].map(match=>{const surface=match[0],lower=surface.toLowerCase(),base=scene.aliases?.[lower]??lower;const target=targetWords.get(base);const candidates=byWord.get(base)??[];const e=target?byGuid.get(target.entryGuid):candidates.find(x=>x.word===base)??candidates[0];if(!e)throw Error(`故事詞不在basic/advance：${surface}`);return {surface,word:e.word,entryGuid:e.guid,isTarget:targets.some(t=>t.entryGuid===e.guid),start:match.index,end:match.index+surface.length};})}));
const covered=new Set(sentences.flatMap(s=>s.wordLinks).filter(l=>l.isTarget).map(l=>l.entryGuid));if(covered.size!==15)throw Error('故事未涵蓋十五詞');
const sha256=createHash('sha256').update(await readFile(image)).digest('hex');
const pkg={schemaVersion:1,scenarioKey:scene.scenarioKey,revision:1,status:'draft',titleZh:scene.titleZh,vocabularyFilter:{system:'list',levels:['basic','advance']},targetCount:15,targets,story:{language:'en',translationLanguage:'zh-Hant',textEn:sentences.map(s=>s.en).join(' '),textZh:sentences.map(s=>s.zh).join(''),sentences},assets:{referenceImage:{path:image,sha256},baseImage:null,storyAudio:null},generationPlan:{baseImage:{status:'awaiting-reviewed-base-image',method:'Codex CLI',sceneDescriptionZh:scene.descriptionZh},storyAudio:{status:'awaiting-local-tts',voice:'Serena'},wordbankAudio:{status:'awaiting-formal-audio-check',scope:'target-fifteen-only'}},contentReview:{status:'text-prepared-awaiting-media-review',notes:scene.reviewNotes}};
const folder=path.join('docs/scenarios/packages',`${scene.scenarioKey}-15-v1`);await mkdir(folder,{recursive:true});const file=path.join(folder,'scenario.json');try{await access(file);throw Error('套件已存在，拒絕覆寫');}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(file,JSON.stringify(pkg,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({file,scenarioKey:pkg.scenarioKey,targetCount:15,tokens:sentences.reduce((n,s)=>n+s.wordLinks.length,0),status:'awaiting-media-and-coordinates'}));
