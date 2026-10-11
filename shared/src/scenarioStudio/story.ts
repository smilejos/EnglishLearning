import type { Queryable } from "../repo/types";
import { ScenarioContentSchema, SCENARIO_MAX_TARGETS } from "../scenarios";
import { StudioStorySchema, type StudioDraft, type StudioEditable, type StudioCheck, type StudioAudioClip, type StudioAsset } from "./contracts";
import { wordbankTextHash } from "../wordbankAudio";
import { readFile } from "node:fs/promises";
import { scenarioSafePath } from "../scenarios";
import { validateStudioMp3 } from "./storage";

export interface StudioWord { guid: string; word: string; partsOfSpeech: string[]; definition: string; level: { list?: string; [key: string]: unknown } }
const mapWord = (r: any): StudioWord => ({ guid:r.guid, word:r.word, partsOfSpeech:r.parts_of_speech,definition:r.definition,level:r.level });
export async function searchStudioWords(db: Queryable, q: string, levels: string[], pos: string | undefined, limit=30, offset=0): Promise<{entries:StudioWord[];total:number}> {
  const conditions = "level->>'list'=ANY($1::text[]) AND ($2='' OR word ILIKE '%'||$2||'%' OR definition ILIKE '%'||$2||'%') AND ($3::text IS NULL OR $3=ANY(parts_of_speech))";
  const params=[levels,q,pos??null];
  const total=Number((await db.query(`SELECT count(*)::int AS count FROM wordbank_entries WHERE ${conditions}`,params)).rows[0].count);
  const rows=(await db.query(`SELECT guid,word,parts_of_speech,definition,level FROM wordbank_entries WHERE ${conditions} ORDER BY (lower(word)=lower($2)) DESC,source_id,guid LIMIT $4 OFFSET $5`,[...params,limit,offset])).rows;
  return {entries:rows.map(mapWord),total};
}
export async function resolveStudioWords(db: Queryable, words: string[], levels: string[]) {
  const rows=(await db.query("SELECT guid,word,parts_of_speech,definition,level FROM wordbank_entries WHERE lower(word)=ANY($1::text[]) ORDER BY source_id,guid",[words.map(w=>w.trim().toLowerCase())])).rows.map(mapWord);
  const seen=new Set<string>();
  return {results:words.map(input=>{
    const normalized=input.trim().toLowerCase(), entries=rows.filter(r=>r.word.toLowerCase()===normalized), allowed=entries.filter(r=>levels.includes(r.level.list??""));
    const status=seen.has(normalized)?"duplicate":!entries.length?"unknown":!allowed.length?"out-of-level":allowed.length>1?"ambiguous":"matched";
    seen.add(normalized);return {input,status,entries:allowed.length?allowed:entries};
  })};
}
/** 模型只建議原型，GUID 由 DB 解析；手選 GUID 可消除同字多條目的歧義。 */
export async function analyzeStudioStory(db: Queryable, draft: StudioEditable): Promise<{story:StudioEditable["story"];checks:StudioCheck[]}> {
  if (!draft.story) return {story:null,checks:[{code:"story-missing",message:"尚未準備英文故事與繁中翻譯",blocking:true}]};
  const story=StudioStorySchema.parse(draft.story),checks:StudioCheck[]=[];
  const names=story.sentences.flatMap(s=>[...s.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)].map((t,i)=>s.baseWords?.[i]||s.wordLinks.find(l=>l.start===t.index)?.word||t[0]));
  const guids=story.sentences.flatMap(s=>s.wordLinks.map(l=>l.entryGuid));
  const rows=(await db.query("SELECT guid,word,level FROM wordbank_entries WHERE lower(word)=ANY($1::text[]) OR guid=ANY($2::uuid[])",[names.map(n=>n.toLowerCase()),guids])).rows;
  const targetIds=new Set(draft.targets.map(t=>t.entryGuid)),covered=new Set<string>();
  for(const sentence of story.sentences){
    const tokens=[...sentence.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)], links=[];
    for(const [i,token] of tokens.entries()){
      const previous=sentence.wordLinks.find(l=>l.start===token.index&&l.surface===token[0]);
      const baseWord=sentence.baseWords?.[i]||previous?.word||token[0];
      const candidates=rows.filter(r=>r.word.toLowerCase()===baseWord.toLowerCase());
      const selected=previous&&rows.find(r=>r.guid===previous.entryGuid&&r.word===previous.word&&r.word.toLowerCase()===baseWord.toLowerCase());
      const entry=selected||(candidates.length===1?candidates[0]:undefined);
      if(!entry){checks.push({code:candidates.length?"story-ambiguous":"story-unresolved",message:`故事「${token[0]}」的原型「${baseWord}」${candidates.length?"有多筆詞條，請選擇":"查無字庫，請修正"}`,blocking:true,sentenceId:sentence.id,tokenIndex:i,surface:token[0]});continue;}
      if(!draft.vocabularyFilter.levels.includes(entry.level.list)) checks.push({code:"story-out-of-level",message:`故事「${token[0]}」→ ${entry.word} 超出指定級別`,blocking:true,sentenceId:sentence.id,tokenIndex:i,surface:token[0]});
      const isTarget=targetIds.has(entry.guid);if(isTarget)covered.add(entry.guid);
      links.push({surface:token[0],word:entry.word,entryGuid:entry.guid,isTarget,start:token.index!,end:token.index!+token[0].length});
    }
    sentence.wordLinks=links;
    if(!sentence.en.trim()||!sentence.zh.trim())checks.push({code:"story-empty",message:"每句故事都需要英文與繁中翻譯",blocking:true,sentenceId:sentence.id});
  }
  story.textEn=story.sentences.map(s=>s.en.trim()).join(" ");story.textZh=story.sentences.map(s=>s.zh.trim()).join("");
  for(const t of draft.targets)if(!covered.has(t.entryGuid))checks.push({code:"target-uncovered",message:`故事尚未涵蓋 ${t.word}`,blocking:true});
  return {story,checks};
}
export async function validateStudioTargets(db: Queryable,draft:StudioEditable):Promise<StudioCheck[]> {
  const checks:StudioCheck[]=[];
  if(draft.targets.length<1||draft.targets.length>SCENARIO_MAX_TARGETS)checks.push({code:"target-count",message:`需要1–${SCENARIO_MAX_TARGETS}個目標單字`,blocking:true});
  if(new Set(draft.targets.map(t=>t.entryGuid)).size!==draft.targets.length||new Set(draft.targets.map(t=>t.word.toLowerCase())).size!==draft.targets.length)checks.push({code:"target-duplicate",message:"目標單字不可重複",blocking:true});
  const rows=(await db.query("SELECT guid,word,parts_of_speech,level FROM wordbank_entries WHERE guid=ANY($1::uuid[])",[draft.targets.map(t=>t.entryGuid)])).rows;
  for(const t of draft.targets){const r=rows.find(r=>r.guid===t.entryGuid);if(!r||r.word!==t.word||r.level.list!==t.list||!draft.vocabularyFilter.levels.includes(t.list)||!r.parts_of_speech.includes(t.teachingPos))checks.push({code:"target-invalid",message:`${t.word} 的 GUID、級別或詞性與字庫不符`,blocking:true});if(!t.senseZh.trim())checks.push({code:"target-sense",message:`請填寫 ${t.word} 的本情境詞義`,blocking:true});}
  return checks;
}
export async function studioMissingAudioPlan(db:Queryable,draft:StudioEditable,audioDir?:string,fullDecode=false):Promise<StudioAudioClip[]> {
  const rows=(await db.query("SELECT e.*,COALESCE((SELECT jsonb_object_agg(a.asset_guid::text,to_jsonb(a)) FROM wordbank_audio a WHERE a.entry_guid=e.guid),'{}'::jsonb) AS audio FROM wordbank_entries e WHERE guid=ANY($1::uuid[])",[draft.targets.map(t=>t.entryGuid)])).rows;
  const missing:StudioAudioClip[]=[];
  for(const r of rows){
    const clips=[{assetGuid:r.guid,kind:"word",text:r.word},...r.examples.map((v:any)=>({assetGuid:v.guid,kind:"example",text:v.en})),...r.explains.map((v:any)=>({assetGuid:v.guid,kind:"explanation",text:v.en}))];
    for(const c of clips){const text=c.text.trim(),textHash=wordbankTextHash(text),a=r.audio[c.assetGuid];let valid=Boolean(a&&a.entry_guid===r.guid&&a.kind===c.kind&&a.text_hash===textHash&&/^wordbank\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.mp3$/.test(a.relative_path));
      if(valid&&audioDir)try{const filename=await scenarioSafePath(audioDir,a.relative_path),bytes=await readFile(filename);valid=bytes.length===Number(a.bytes)&&(bytes.subarray(0,3).toString()==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224));if(valid&&fullDecode)await validateStudioMp3(filename);}catch{valid=false;}
      if(!valid)missing.push({assetGuid:c.assetGuid,entryGuid:r.guid,kind:c.kind,text,textHash});
    }
  }
  return missing;
}
export async function studioDraftChecks(db:Queryable,draft:StudioDraft,assets:StudioAsset[]):Promise<StudioCheck[]> {
  const checks=[...await validateStudioTargets(db,draft),...(await analyzeStudioStory(db,draft)).checks];
  if(!draft.titleZh.trim()||!draft.sceneDescription.trim())checks.push({code:"description",message:"請填寫情境標題與說明",blocking:true});
  const image=assets.find(a=>a.id===draft.selectedImageId&&a.kind==="image"),audio=assets.find(a=>a.id===draft.selectedAudioId&&a.kind==="story-audio");
  if(!image)checks.push({code:"image-missing",message:"尚未選用底圖",blocking:true});
  if(!audio||audio.textSha256!==wordbankTextHash(draft.story?.textEn??""))checks.push({code:"audio-missing",message:"尚未選用對應目前故事的旁白",blocking:true});
  if(draft.targets.some(t=>!t.interaction.label||!t.interaction.object))checks.push({code:"coordinates-missing",message:"所有目標詞都需完成標籤及物件定位",blocking:true});
  for(const [key,label]of Object.entries({story:"故事與詞形",image:"圖片內容",coordinates:"所有目標詞定位",audio:"旁白試聽"}))if(!draft.review[key as keyof typeof draft.review])checks.push({code:`review-${key}`,message:`請確認${label}驗收`,blocking:true});
  if(draft.story&&draft.targets.every(t=>t.interaction.label&&t.interaction.object)){
    const parsed=ScenarioContentSchema.safeParse({schemaVersion:1,scenarioKey:draft.scenarioKey,revision:1,titleZh:draft.titleZh,vocabularyFilter:draft.vocabularyFilter,targetCount:draft.targets.length,targets:draft.targets,story:{...draft.story,sentences:draft.story.sentences.map(({baseWords,...s})=>s)}});
    if(!parsed.success)checks.push({code:"content-invalid",message:"故事、詞形或目標尚未符合完整教材契約",blocking:true});
  }
  return checks;
}
